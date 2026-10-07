import { Hono } from "hono";
import { createAuth, type AuthEnv } from "./auth";
import {
  API_ERROR_CODES,
  API_ERROR_MESSAGES,
  groupDeals,
  isWithinTehranBoundary,
  type LocationSearchResult,
  locationInputSchema,
  locationPatchSchema,
  okalaOtpRequestSchema,
  okalaOtpVerifySchema,
  okalaSettingsInputSchema,
  settingsInputSchema,
  snappOtpRequestSchema,
  snappOtpVerifySchema,
  scanInputSchema,
} from "@better-buy/shared";
import { Store } from "./store";
import { issueTestSession } from "./test-login";
import { collectDeals, CollectorError } from "./collector";
import { collectDigikala } from "./digikala";
import { collectOkala } from "./okala";
import { collectWithRetry } from "./retry";

type Env = AuthEnv & {
  BOX_KEY: string;
  OKALA_CLIENT_SECRET: string;
  GEOCODER_BASE_URL?: string;
  CORS_ORIGIN?: string;
  DEV_MODE?: string;
  ASSETS: Fetcher;
};
type Variables = { userId: string };

export const api = new Hono<{ Bindings: Env; Variables: Variables }>();
const isHiddenProvider = (source: string) => source === "digikalajet";

async function refreshOkalaAccessToken(env: Env, refreshToken: string) {
  let clientSecret = env.OKALA_CLIENT_SECRET?.trim() ?? "";
  try {
    if (/%[0-9a-f]{2}/i.test(clientSecret))
      clientSecret = decodeURIComponent(clientSecret);
  } catch {
    // Keep the configured value if it is not valid percent-encoding.
  }
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: "customer_client_id",
    client_secret: clientSecret,
    scope: "offline_access",
    refresh_token: refreshToken,
  });
  const response = await fetch(
    "https://apigateway.okala.com/api/v1/accounts/tokens",
    {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://www.okala.com",
        referer: "https://www.okala.com/",
        source: "okala",
        "ui-version": "2.0",
        "session-id": crypto.randomUUID(),
      },
      body: form,
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  } | null;
  return body?.access_token
    ? {
        token: body.access_token,
        refreshToken: body.refresh_token ?? refreshToken,
        expiresAt: new Date(
          Date.now() + (body.expires_in ?? 36_000) * 1000,
        ).toISOString(),
      }
    : null;
}

const snappLoginHeaders = {
  accept: "application/json, text/plain, */*",
  "content-type": "application/x-www-form-urlencoded",
  origin: "https://snapp.market",
  referer: "https://snapp.market/",
};
const snappUrl = (
  path: string,
  q: { appVersion: string; udid: string; latitude: number; longitude: number },
) =>
  `https://svc.snapp.market${path}?client=JEK_PWA&deviceType=JEK_PWA&appVersion=${encodeURIComponent(q.appVersion)}&UDID=${encodeURIComponent(q.udid)}&lat=${encodeURIComponent(q.latitude)}&long=${encodeURIComponent(q.longitude)}`;

const GEOCODER_RESULT_LIMIT = 5;
const GEOCODER_TIMEOUT_MS = 8_000;

const sanitizeGeocoderText = (value: unknown, maxLength = 240) =>
  typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength)
    : "";

function parseGeocoderResults(body: unknown): LocationSearchResult[] {
  if (!Array.isArray(body)) return [];
  const results: LocationSearchResult[] = [];
  const seen = new Set<string>();
  for (const item of body) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const latitude = Number(record.lat);
    const longitude = Number(record.lon);
    const displayName = sanitizeGeocoderText(record.display_name);
    if (
      !displayName ||
      !isWithinTehranBoundary(latitude, longitude)
    )
      continue;
    const key = `${latitude.toFixed(6)}:${longitude.toFixed(6)}:${displayName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ latitude, longitude, displayName });
    if (results.length >= GEOCODER_RESULT_LIMIT) break;
  }
  return results;
}

function geocoderUrl(baseUrl: string, query: string) {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(GEOCODER_RESULT_LIMIT));
    url.searchParams.set("bounded", "1");
    url.searchParams.set(
      "viewbox",
      "51.18,35.82,51.66,35.56",
    );
    url.searchParams.set("addressdetails", "0");
    url.searchParams.set("accept-language", "fa");
    return url;
  } catch {
    return null;
  }
}

api.post("/api/auth/test-login", async (c) => {
  if (c.env.DEV_MODE !== "true")
    return c.json({ error: "NOT_FOUND" }, 404);
  const cookie = await issueTestSession(c.env.DB, c.env.BETTER_AUTH_SECRET);
  c.header("Set-Cookie", cookie);
  return c.json({ data: { ok: true } });
});

api.on(["GET", "POST"], "/api/auth/*", (c) =>
  createAuth(c.env).handler(c.req.raw),
);

// Liveness must not depend on a user session or a D1 read. Keep diagnostics
// under the authenticated /api/health route below.
api.get("/healthz", (c) => c.json({ ok: true }));

api.use("/api/*", async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin) {
    const allowed = new Set(
      [c.env.APP_ORIGIN, c.env.CORS_ORIGIN].flatMap((value) =>
        value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [],
      ),
    );
    if (allowed.has(origin)) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Vary", "Origin");
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      c.header("Access-Control-Max-Age", "86400");
    }
  }
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});

api.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth/")) return next();
  c.header("Cache-Control", "private, no-store, max-age=0");
  c.header("Pragma", "no-cache");
  c.header("Vary", "Cookie, Authorization");
  const session = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session?.user?.id)
    return c.json(
      { error: "UNAUTHENTICATED", message: "برای ادامه با گوگل وارد شوید." },
      401,
    );
  c.set("userId", session.user.id);
  await new Store(c.env.DB, session.user.id, c.env.BOX_KEY).reconcileStale();
  await next();
});

api.get("/api/health", (c) =>
  c.json({ ok: true, storage: "d1", signedIn: Boolean(c.get("userId")) }),
);
api.get("/api/me", (c) => c.json({ data: { id: c.get("userId") } }));
api.get("/api/locations", async (c) => {
  const s = new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY);
  return c.json({ data: await s.locations() });
});
api.get("/api/locations/search", async (c) => {
  const query = (c.req.query("q") ?? "").normalize("NFKC").trim();
  if (query.length < 2 || query.length > 120)
    return c.json(
      {
        error: API_ERROR_CODES.INVALID_SEARCH_QUERY,
        message: API_ERROR_MESSAGES.INVALID_SEARCH_QUERY,
      },
      400,
    );

  const configuredBaseUrl = c.env.GEOCODER_BASE_URL?.trim();
  if (!configuredBaseUrl)
    return c.json(
      {
        error: API_ERROR_CODES.GEOCODER_UNAVAILABLE,
        message: API_ERROR_MESSAGES.GEOCODER_UNAVAILABLE,
      },
      503,
    );

  const url = geocoderUrl(configuredBaseUrl, query);
  if (!url)
    return c.json(
      {
        error: API_ERROR_CODES.GEOCODER_UNAVAILABLE,
        message: API_ERROR_MESSAGES.GEOCODER_UNAVAILABLE,
      },
      503,
    );

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "better-buy-location-search/1.0",
      },
      signal: AbortSignal.timeout(GEOCODER_TIMEOUT_MS),
    });
  } catch {
    return c.json(
      {
        error: API_ERROR_CODES.GEOCODER_ERROR,
        message: API_ERROR_MESSAGES.GEOCODER_ERROR,
      },
      502,
    );
  }
  if (!response.ok)
    return c.json(
      {
        error: API_ERROR_CODES.GEOCODER_ERROR,
        message: API_ERROR_MESSAGES.GEOCODER_ERROR,
      },
      502,
    );

  const body = await response.json().catch(() => null);
  return c.json({ data: parseGeocoderResults(body) });
});

api.post("/api/locations", async (c) => {
  const p = locationInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: "INVALID_INPUT" }, 400);
  if (!isWithinTehranBoundary(p.data.latitude, p.data.longitude))
    return c.json(
      {
        error: API_ERROR_CODES.OUTSIDE_TEHRAN,
        message: API_ERROR_MESSAGES.OUTSIDE_TEHRAN,
      },
      422,
    );
  const v = await new Store(
    c.env.DB,
    c.get("userId"),
    c.env.BOX_KEY,
  ).createLocation(p.data);
  return c.json({ data: v }, 201);
});

api.patch("/api/locations/:id", async (c) => {
  const p = locationPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: "INVALID_INPUT" }, 400);
  const store = new Store(
    c.env.DB,
    c.get("userId"),
    c.env.BOX_KEY,
  );
  const current = await store.location(c.req.param("id"));
  if (!current) return c.json({ error: "NOT_FOUND" }, 404);
  const merged = { ...current, ...p.data };
  if (!isWithinTehranBoundary(Number(merged.latitude), Number(merged.longitude)))
    return c.json(
      {
        error: API_ERROR_CODES.OUTSIDE_TEHRAN,
        message: API_ERROR_MESSAGES.OUTSIDE_TEHRAN,
      },
      422,
    );
  const v = await store.updateLocation(c.req.param("id"), p.data);
  return v ? c.json({ data: v }) : c.json({ error: "NOT_FOUND" }, 404);
});
api.delete("/api/locations/:id", async (c) => {
  const r = await new Store(
    c.env.DB,
    c.get("userId"),
    c.env.BOX_KEY,
  ).deleteLocation(c.req.param("id"));
  return r === "deleted"
    ? c.body(null, 204)
    : c.json(
        {
          error:
            r === "missing"
              ? "NOT_FOUND"
              : r === "active"
                ? API_ERROR_CODES.SCAN_IN_PROGRESS
                : "LAST_LOCATION",
        },
        r === "missing" ? 404 : 409,
      );
});
api.get("/api/settings/snappmarket", async (c) =>
  c.json({
    data: await new Store(
      c.env.DB,
      c.get("userId"),
      c.env.BOX_KEY,
    ).snappStatus(),
  }),
);
api.put("/api/settings/snappmarket", async (c) => {
  const p = settingsInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: "INVALID_INPUT" }, 400);
  const s = new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY);
  await s.saveProvider("snappmarket", p.data.token, {
    appVersion: p.data.appVersion,
  });
  return c.json({ data: await s.snappStatus() });
});
api.post("/api/settings/snappmarket/otp", async (c) => {
  const p = snappOtpRequestSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!p.success) return c.json({ error: "INVALID_INPUT" }, 400);
  const q = {
    appVersion: p.data.appVersion,
    udid: crypto.randomUUID(),
    latitude: p.data.latitude ?? 35.7,
    longitude: p.data.longitude ?? 51.4,
  };
  let response: Response;
  try {
    response = await fetch(
      snappUrl("/mobile/v4/user/loginMobileWithNoPass", q),
      {
        method: "POST",
        headers: { ...snappLoginHeaders, "cache-control": "no-cache" },
        body: new URLSearchParams({
          captcha: "",
          cellphone: p.data.mobile,
          optionalLoginToken: "true",
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    return c.json(
      { error: "NETWORK_ERROR", message: "ارتباط با اسنپ‌مارکت برقرار نشد" },
      502,
    );
  }
  const body = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
  } | null;
  if (!response.ok || body?.status !== true)
    return c.json(
      { error: "UPSTREAM_ERROR", message: "ارسال کد اسنپ‌مارکت ناموفق بود" },
      409,
    );
  return c.json({ data: { sent: true } }, 202);
});
api.post("/api/settings/snappmarket/login", async (c) => {
  const p = snappOtpVerifySchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!p.success) return c.json({ error: "INVALID_INPUT" }, 400);
  const q = {
    appVersion: p.data.appVersion,
    udid: p.data.udid ?? crypto.randomUUID(),
    latitude: p.data.latitude ?? 35.7,
    longitude: p.data.longitude ?? 51.4,
  };
  let response: Response;
  try {
    response = await fetch(
      snappUrl("/mobile/v2/user/loginMobileWithToken", q),
      {
        method: "POST",
        headers: snappLoginHeaders,
        body: new URLSearchParams({
          cellphone: p.data.mobile,
          code: p.data.otp,
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    return c.json(
      { error: "NETWORK_ERROR", message: "ارتباط با اسنپ‌مارکت برقرار نشد" },
      502,
    );
  }
  const body = (await response.json().catch(() => null)) as {
    status?: boolean;
    data?: {
      oauth2_token?: {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
    };
    message?: string;
  } | null;
  const token = body?.data?.oauth2_token;
  if (!response.ok || body?.status !== true || !token?.access_token)
    return c.json(
      { error: "UPSTREAM_ERROR", message: "کد اسنپ‌مارکت پذیرفته نشد" },
      409,
    );
  const s = new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY);
  await s.saveProvider("snappmarket", token.access_token, {
    appVersion: p.data.appVersion,
    refreshToken: token.refresh_token,
    expiresAt: new Date(
      Date.now() + (token.expires_in ?? 3600) * 1000,
    ).toISOString(),
  });
  return c.json({ data: await s.snappStatus() });
});
api.get("/api/settings/digikalajet", (c) =>
  c.json(
    {
      error: API_ERROR_CODES.PROVIDER_UNAVAILABLE,
      message: API_ERROR_MESSAGES.PROVIDER_UNAVAILABLE,
    },
    409,
  ),
);
api.put("/api/settings/digikalajet", (c) =>
  c.json(
    {
      error: API_ERROR_CODES.PROVIDER_UNAVAILABLE,
      message: API_ERROR_MESSAGES.PROVIDER_UNAVAILABLE,
    },
    409,
  ),
);
api.get("/api/settings/okala", async (c) =>
  c.json({
    data: await new Store(
      c.env.DB,
      c.get("userId"),
      c.env.BOX_KEY,
    ).okalaStatus(),
  }),
);
api.put("/api/settings/okala", async (c) => {
  const p = okalaSettingsInputSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!p.success) return c.json({ error: "INVALID_INPUT" }, 400);
  const s = new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY);
  await s.saveProvider("okala", p.data.token);
  return c.json({ data: await s.okalaStatus() });
});
api.post("/api/settings/okala/otp", async (c) => {
  const p = okalaOtpRequestSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!p.success) return c.json({ error: "INVALID_INPUT" }, 400);
  const response = await fetch(
    "https://apigateway.okala.com/api/voyager/C/CustomerAccount/OTPRegister",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        source: "okala",
        "ui-version": "2.0",
        "session-id": crypto.randomUUID(),
        "x-user-unique-id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        mobile: p.data.mobile,
        deviceTypeCode: 10,
        confirmTerms: true,
        notRobot: false,
        otpType: 0,
        ValidationCodeCreateReason: 5,
        OtpApp: 0,
        IsAppOnly: false,
      }),
    },
  );
  if (!response.ok)
    return c.json(
      { error: "UPSTREAM_ERROR", message: "ارسال کد اکالا ناموفق بود" },
      409,
    );
  return c.json({ data: { sent: true } }, 202);
});
api.post("/api/settings/okala/login", async (c) => {
  const p = okalaOtpVerifySchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!p.success) return c.json({ error: "INVALID_INPUT" }, 400);
  if (!c.env.OKALA_CLIENT_SECRET)
    return c.json(
      {
        error: "CONFIGURATION_ERROR",
        message: "کلید اتصال اکالا در Worker تنظیم نشده است.",
      },
      503,
    );
  let clientSecret = c.env.OKALA_CLIENT_SECRET.trim();
  try {
    if (/%[0-9a-f]{2}/i.test(clientSecret))
      clientSecret = decodeURIComponent(clientSecret);
  } catch {
    /* keep the configured value */
  }
  const form = new URLSearchParams({
    mobile_number: p.data.mobile,
    otp_code: p.data.otp,
    grant_type: "customer_grant_type",
    client_id: "customer_client_id",
    client_secret: clientSecret,
    client_name: "customer_client_name",
    device_type_code: "10",
    scope: "offline_access",
    loginDuration: "77489",
  });
  const response = await fetch(
    "https://apigateway.okala.com/api/v1/accounts/tokens",
    {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://www.okala.com",
        referer: "https://www.okala.com/",
        source: "okala",
        "ui-version": "2.0",
        "session-id": crypto.randomUUID(),
      },
      body: form,
    },
  );
  if (!response.ok)
    return c.json(
      {
        error: "UPSTREAM_ERROR",
        message: `پاسخ ناموفق اکالا (${response.status})`,
      },
      409,
    );
  const body = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!body.access_token)
    return c.json(
      { error: "UPSTREAM_ERROR", message: "توکن اکالا در پاسخ وجود نداشت" },
      502,
    );
  const s = new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY);
  await s.saveProvider("okala", body.access_token, {
    refreshToken: body.refresh_token,
    expiresAt: new Date(
      Date.now() + (body.expires_in ?? 36000) * 1000,
    ).toISOString(),
  });
  return c.json({ data: await s.okalaStatus() });
});
api.get("/api/scans", async (c) =>
  c.json({
    data: await new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY).scans(),
  }),
);
api.get("/api/scans/:id", async (c) => {
  const v = await new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY).scan(
    c.req.param("id"),
  );
  return v ? c.json({ data: v }) : c.json({ error: "NOT_FOUND" }, 404);
});
api.get("/api/scans/:id/deals", async (c) =>
  c.json({
    data: await new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY).deals(
      c.req.param("id"),
    ),
  }),
);
api.get("/api/scans/:id/deal-groups", async (c) => {
  const store = new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY);
  const scan = await store.scan(c.req.param("id"));
  if (!scan) return c.json({ error: "NOT_FOUND" }, 404);
  const deals = await store.deals(scan.id);
  const groups = groupDeals(scan.source, deals);
  return c.json({
    data: groups,
    meta: {
      groupKeyVersion: 1,
      groupedProductCount: groups.length,
      offerCount: deals.length,
    },
  });
});
api.post("/api/scans", async (c) => {
  const parsed = scanInputSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) return c.json({ error: "INVALID_INPUT" }, 400);
  const locationId = parsed.data.locationId;
  const threshold = parsed.data.threshold;
  // Keep the runtime provider string wide so the collector dispatch remains
  // type-safe if a temporarily hidden provider is restored later.
  const source: string = parsed.data.source;
  const mode = parsed.data.mode;
  if (isHiddenProvider(source))
    return c.json(
      {
        error: API_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: API_ERROR_MESSAGES.PROVIDER_UNAVAILABLE,
      },
      409,
    );
  const store = new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY);
  const location = await store.location(locationId);
  if (!location) return c.json({ error: "LOCATION_NOT_FOUND" }, 404);
  if (!isWithinTehranBoundary(location.latitude, location.longitude))
    return c.json(
      {
        error: API_ERROR_CODES.OUTSIDE_TEHRAN,
        message: API_ERROR_MESSAGES.OUTSIDE_TEHRAN,
      },
      422,
    );
  if (await store.activeScan())
    return c.json(
      {
        error: API_ERROR_CODES.SCAN_IN_PROGRESS,
        message: API_ERROR_MESSAGES.SCAN_IN_PROGRESS,
      },
      409,
    );
  let credentials = await store.credentials(source);
  if (!credentials) return c.json({ error: "TOKEN_REQUIRED" }, 409);
  if (
    source === "okala" &&
    credentials.expiresAt &&
    Date.parse(credentials.expiresAt) <= Date.now() &&
    credentials.refreshToken
  ) {
    try {
      const refreshed = await refreshOkalaAccessToken(
        c.env,
        credentials.refreshToken,
      );
      if (refreshed) {
        await store.saveProvider("okala", refreshed.token, {
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
        });
        credentials = await store.credentials(source);
      }
    } catch {
      // The collector will surface a safe network/upstream failure below.
    }
  }
  if (
    !credentials ||
    (credentials.expiresAt && Date.parse(credentials.expiresAt) <= Date.now())
  )
    return c.json(
      {
        error: "AUTH_EXPIRED",
        message: "احراز هویت این فروشگاه منقضی شده است.",
      },
      409,
    );
  let id: string;
  try {
    id = await store.createScan(
      locationId,
      source === "digikalajet" || source === "okala"
        ? Math.max(30, threshold)
        : threshold,
      source,
      mode,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!/scans_one_active_per_user|UNIQUE constraint failed: scans\.user_id/i.test(detail))
      throw error;
    return c.json(
      {
        error: API_ERROR_CODES.SCAN_IN_PROGRESS,
        message: API_ERROR_MESSAGES.SCAN_IN_PROGRESS,
      },
      409,
    );
  }
  c.executionCtx.waitUntil(
    (async () => {
      await store.markRunning(id);
      try {
        const result = await collectWithRetry(() =>
          source === "digikalajet"
            ? collectDigikala({
                threshold,
                mode,
                token: credentials.token,
                appId: credentials.appId,
                onProgress: (v) => void store.progress(id, v),
              })
            : source === "okala"
              ? collectOkala({
                  latitude: location.latitude,
                  longitude: location.longitude,
                  threshold,
                  token: credentials.token,
                  onProgress: (v) => void store.progress(id, v),
                })
              : collectDeals({
                  latitude: location.latitude,
                  longitude: location.longitude,
                  threshold,
                  token: credentials.token,
                  udid: credentials.udid,
                  appVersion: credentials.appVersion,
                  onProgress: (v) => void store.progress(id, v),
                }),
        );
        await store.succeed(
          id,
          {
            vendorCount: result.vendorCount,
            productCount: result.productCount,
          },
          result.deals,
        );
      } catch (e) {
        await store.fail(
          id,
          e instanceof CollectorError ? e.code : "UNKNOWN_ERROR",
          e instanceof Error ? e.message : "اسکن ناموفق بود",
        );
      }
    })(),
  );
  return c.json({ data: { id, status: "queued" } }, 202);
});
api.notFound((c) =>
  c.json({ error: "NOT_FOUND", message: "مسیر پیدا نشد." }, 404),
);

export default {
  async fetch(request, env, ctx) {
    const response = await api.fetch(request, env, ctx);
    if (
      response.status !== 404 ||
      new URL(request.url).pathname.startsWith("/api/")
    )
      return response;
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
