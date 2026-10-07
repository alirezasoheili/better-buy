import {
  nearbyResponse,
  campaignsResponse,
  offersResponse,
  normalizeOkalaOffer,
} from "./model";
import { isEligibleDeal } from "../../domain/eligibility";
import type { DealRecord } from "@better-buy/shared";
import { Effect } from "effect";
import { z } from "zod";
import { CollectorError, type PersistenceError } from "../../domain/failures";
import { requestJson } from "../../infrastructure/http";

const baseUrl = "https://apigateway.okala.com/api";
const headers = {
  accept: "application/json",
  origin: "https://www.okala.com",
  source: "okala",
  "ui-version": "2.0",
};

function decode<A>(schema: z.ZodType<A>, body: unknown) {
  const envelope = z
    .object({
      success: z.boolean().optional(),
      hasValidationError: z.boolean().optional(),
    })
    .safeParse(body);
  if (
    envelope.success &&
    (envelope.data.success === false ||
      envelope.data.hasValidationError === true)
  )
    return Effect.fail(
      new CollectorError(
        "UPSTREAM_ERROR",
        "اکالا درخواست دریافت پیشنهادها را نپذیرفت؛ دوباره تلاش کنید."
      )
    );
  const parsed = schema.safeParse(body);
  return parsed.success
    ? Effect.succeed(parsed.data)
    : Effect.fail(
        new CollectorError(
          "UPSTREAM_CHANGED",
          "ساختار پاسخ اکالا تغییر کرده است؛ دوباره تلاش کنید."
        )
      );
}

function checkPagination(value: {
  hasNextPage?: boolean;
  totalPages?: number;
}) {
  // No verified next-page request contract. Do not guess parameters or certify a partial feed.
  return value.hasNextPage || (value.totalPages ?? 1) > 1
    ? Effect.fail(
        new CollectorError(
          "INCOMPLETE_PAGINATION",
          "پیشنهادهای اکالا صفحه‌های بیشتری دارند که دریافت نشدند؛ دوباره تلاش کنید."
        )
      )
    : Effect.void;
}

export function collectOkala(input: {
  latitude: number;
  longitude: number;
  threshold: number;
  fetcher?: typeof fetch;
  onProgress?: (counts: {
    vendorCount: number;
    productCount: number;
  }) => Effect.Effect<void, PersistenceError>;
}) {
  return Effect.gen(function* () {
    const get = (path: string, query: URLSearchParams) =>
      requestJson(
        `${baseUrl}${path}?${query.toString()}`,
        { headers },
        {
          fetcher: input.fetcher,
          provider: "اکالا",
          forbiddenCode: "UPSTREAM_FORBIDDEN",
          unauthorizedCode: "UPSTREAM_FORBIDDEN",
          invalidJsonCode: "UPSTREAM_INVALID_JSON",
        }
      ).pipe(Effect.map((response) => response.body));
    const coordinates = {
      latitude: String(input.latitude),
      longitude: String(input.longitude),
    };
    const nearby = yield* decode(
      nearbyResponse,
      yield* get("/opex/v4/stores/nearby", new URLSearchParams(coordinates))
    );
    const storeIds = [
      ...new Set(
        nearby.data.stores
          .filter((s) => s.isActive && s.isServes && s.isExist)
          .map((s) => s.storeId)
      ),
    ];
    if (!storeIds.length)
      return yield* Effect.fail(
        new CollectorError(
          "NO_STORES",
          "فروشگاه سرویس‌دهنده‌ای در این مکان اکالا پیدا نشد"
        )
      );
    const campaignsQuery = new URLSearchParams({
      pageType: "HomePage",
      ...coordinates,
    });
    storeIds.forEach((id) => campaignsQuery.append("StoreIds", String(id)));
    const campaigns = yield* decode(
      campaignsResponse,
      yield* get("/carousel/v4/offers", campaignsQuery)
    );
    yield* checkPagination(campaigns);
    const ids = new Set(
      campaigns.carousels.flatMap((c) => (c.isMulti ? [c.id] : []))
    );
    if (!ids.size)
      return yield* Effect.fail(
        new CollectorError(
          "NO_CAMPAIGNS",
          "کمپین چندفروشگاهی فعالی در اکالا پیدا نشد"
        )
      );
    const rows = new Map<string, Omit<DealRecord, "scanId" | "state">>();
    let products = 0,
      completed = 0;
    for (const carouselId of ids) {
      const query = new URLSearchParams({ carouselId: String(carouselId) });
      storeIds.forEach((id) => query.append("StoreIds", String(id)));
      const payload = yield* decode(
        offersResponse,
        yield* get("/carousel/v4/offers/multi-store", query)
      );
      yield* checkPagination(payload);
      for (const entity of payload.entities)
        for (const item of entity.products) {
          products++;
          if (
            isEligibleDeal(
              item.discountPercent,
              item.hasQuantity,
              item.quantity,
              input.threshold
            )
          )
            rows.set(`${item.storeId}:${item.id}`, normalizeOkalaOffer(item));
        }
      completed++;
      if (input.onProgress)
        yield* input.onProgress({
          vendorCount: Math.min(storeIds.length, completed),
          productCount: products,
        });
    }
    return {
      vendorCount: storeIds.length,
      productCount: products,
      deals: [...rows.values()],
    };
  });
}
