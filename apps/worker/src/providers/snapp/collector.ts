import { z } from "zod";
import { Effect } from "effect";
import { CollectorError, type PersistenceError } from "../../domain/failures";
import { requestJson } from "../../infrastructure/http";
import { vendorSchema, responseSchema, normalizeSnappDeals } from "./model";

export interface CollectInput {
  latitude: number;
  longitude: number;
  threshold: number;
  fetcher?: typeof fetch;
  onProgress?: (counts: {
    vendorCount: number;
    productCount: number;
  }) => Effect.Effect<void, PersistenceError>;
}

// Public PWA configuration, owned by the provider adapter, never by a customer.
const SNAPP_PWA = {
  client: "PWA",
  deviceType: "PWA",
  appVersion: "1.403.1",
} as const;
const snappHeaders = {
  accept: "application/json, text/plain, */*",
  "accept-language": "fa-IR, fa;q=0.9,en;q=0.8",
  origin: "https://snapp.market",
  referer: "https://snapp.market/",
  "user-agent": "Mozilla/5.0 BetterBuy/1.0",
};
const guestSchema = z.object({
  status: z.literal(true),
  data: z.object({
    access_token: z.string().trim().min(1),
    expires_in: z.number().positive(),
  }),
});

export function collectDeals(input: CollectInput) {
  return Effect.gen(function* () {
    const fetcher = input.fetcher ?? fetch,
      vendors = new Map<string, z.infer<typeof vendorSchema>>(),
      pageFingerprints = new Set<string>();
    // A scan owns its guest session. Worker restarts simply acquire a new one.
    const deviceId = crypto.randomUUID();
    let guest: { token: string; expiresAt: number } | undefined;
    let renewedAfter401 = false;
    const acquireGuest = () =>
      Effect.gen(function* () {
        const url = new URL("https://svc.snapp.market/oauth2/default/token");
        Object.entries({ ...SNAPP_PWA, UDID: deviceId }).forEach(([k, v]) =>
          url.searchParams.set(k, v)
        );
        const requestedAt = Date.now();
        const response = yield* requestJson(
          url,
          {
            method: "POST",
            headers: { ...snappHeaders, "content-type": "application/json" },
            body: JSON.stringify({
              data: {
                device_uid: deviceId,
                client_id: "snappfood_pwa",
                client_secret: "snappfood_pwa_secret",
                grant_type: "client_credentials",
                scope: "mobile_v2 mobile_v1 webview",
              },
            }),
          },
          {
            fetcher,
            provider: "اسنپ‌مارکت",
            allow401: true,
            forbiddenCode: "UPSTREAM_FORBIDDEN",
            invalidJsonCode: "UPSTREAM_INVALID_JSON",
          }
        );
        if (response.status === 401)
          return yield* Effect.fail(
            new CollectorError(
              "GUEST_AUTH_REJECTED",
              "دسترسی خودکار اسنپ‌مارکت برقرار نشد؛ بعداً دوباره اسکن کنید"
            )
          );
        const parsed = guestSchema.safeParse(response.body);
        if (!parsed.success)
          return yield* Effect.fail(
            new CollectorError(
              "UPSTREAM_CHANGED",
              "ساختار پاسخ دسترسی خودکار اسنپ‌مارکت تغییر کرده است"
            )
          );
        const access = {
          token: parsed.data.data.access_token,
          expiresAt: requestedAt + parsed.data.data.expires_in * 1000,
        };
        if (access.expiresAt <= Date.now())
          return yield* Effect.fail(
            new CollectorError(
              "GUEST_AUTH_REJECTED",
              "دسترسی خودکار اسنپ‌مارکت اعتبار کافی برای اسکن ندارد"
            )
          );
        return access;
      });
    let totalCount = Infinity;
    for (let page = 0; page < 50 && vendors.size < totalCount; page++) {
      const url = new URL(
        `https://svc.snapp.market/market-party/${input.latitude}/${input.longitude}`
      );
      Object.entries({
        deal_type: "supermarket",
        user_id: "0",
        isPro: "false",
        page: String(page),
        page_size: "100",
        ...SNAPP_PWA,
        UDID: deviceId,
      }).forEach(([k, v]) => url.searchParams.set(k, v));
      if (!guest || guest.expiresAt <= Date.now())
        guest = yield* acquireGuest();
      const access = guest;
      const requestPage = (token = access.token) =>
        requestJson(
          url,
          {
            headers: { ...snappHeaders, authorization: `Bearer ${token}` },
          },
          {
            fetcher,
            provider: "اسنپ‌مارکت",
            allow401: true,
            forbiddenCode: "UPSTREAM_FORBIDDEN",
            invalidJsonCode: "UPSTREAM_INVALID_JSON",
          }
        );
      let response = yield* requestPage();
      if (response.status === 401 && !renewedAfter401) {
        renewedAfter401 = true;
        guest = yield* acquireGuest();
        response = yield* requestPage(guest.token);
      }
      if (response.status === 401)
        return yield* Effect.fail(
          new CollectorError(
            "GUEST_AUTH_REJECTED",
            "اسنپ‌مارکت دسترسی خودکار اسکن را نپذیرفت؛ بعداً دوباره تلاش کنید"
          )
        );
      const parsed = responseSchema.safeParse(response.body);
      if (!parsed.success || !parsed.data.status)
        return yield* Effect.fail(
          new CollectorError(
            "UPSTREAM_CHANGED",
            "ساختار پاسخ اسنپ‌مارکت تغییر کرده است"
          )
        );
      totalCount = parsed.data.data.total_count;
      const pageVendors = parsed.data.data.vendors,
        fingerprint = pageVendors
          .map((v) => String(v.vendor_id))
          .sort()
          .join(",");
      if (pageVendors.length === 0) {
        if (vendors.size < totalCount)
          return yield* Effect.fail(
            new CollectorError(
              "INCOMPLETE_PAGINATION",
              "همه فروشگاه‌ها دریافت نشدند"
            )
          );
        break;
      }
      if (pageFingerprints.has(fingerprint))
        return yield* Effect.fail(
          new CollectorError(
            "INCOMPLETE_PAGINATION",
            "صفحه تکراری از اسنپ‌مارکت دریافت شد"
          )
        );
      pageFingerprints.add(fingerprint);
      for (const vendor of pageVendors)
        vendors.set(String(vendor.vendor_id), vendor);
      const productKeys = new Set<string>();
      for (const vendor of vendors.values())
        for (const p of vendor.products)
          productKeys.add(`${p.vendorId}:${p.productVariationId}`);
      if (input.onProgress)
        yield* input.onProgress({
          vendorCount: vendors.size,
          productCount: productKeys.size,
        });
    }
    if (vendors.size < totalCount)
      return yield* Effect.fail(
        new CollectorError(
          "INCOMPLETE_PAGINATION",
          `تنها ${vendors.size} از ${totalCount} فروشگاه دریافت شد`
        )
      );
    return normalizeSnappDeals(vendors.values(), vendors.size, input.threshold);
  });
}
