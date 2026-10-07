import {
  API_ERROR_CODES,
  API_ERROR_MESSAGES,
  isWithinTehranBoundary,
  locationInputSchema,
  locationPatchSchema,
  type LocationSearchResult,
} from "@better-buy/shared";
import { Store } from "../store";
import type { Api } from "./types";
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
    if (!displayName || !isWithinTehranBoundary(latitude, longitude)) continue;
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
    url.searchParams.set("viewbox", "51.18,35.82,51.66,35.56");
    url.searchParams.set("addressdetails", "0");
    url.searchParams.set("accept-language", "fa");
    return url;
  } catch {
    return null;
  }
}

export function registerLocations(api: Api) {
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
        400
      );

    const configuredBaseUrl = c.env.GEOCODER_BASE_URL?.trim();
    if (!configuredBaseUrl)
      return c.json(
        {
          error: API_ERROR_CODES.GEOCODER_UNAVAILABLE,
          message: API_ERROR_MESSAGES.GEOCODER_UNAVAILABLE,
        },
        503
      );

    const url = geocoderUrl(configuredBaseUrl, query);
    if (!url)
      return c.json(
        {
          error: API_ERROR_CODES.GEOCODER_UNAVAILABLE,
          message: API_ERROR_MESSAGES.GEOCODER_UNAVAILABLE,
        },
        503
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
        502
      );
    }
    if (!response.ok)
      return c.json(
        {
          error: API_ERROR_CODES.GEOCODER_ERROR,
          message: API_ERROR_MESSAGES.GEOCODER_ERROR,
        },
        502
      );

    const body = await response.json().catch(() => null);
    return c.json({ data: parseGeocoderResults(body) });
  });

  api.post("/api/locations", async (c) => {
    const p = locationInputSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!p.success) return c.json({ error: "INVALID_INPUT" }, 400);
    if (!isWithinTehranBoundary(p.data.latitude, p.data.longitude))
      return c.json(
        {
          error: API_ERROR_CODES.OUTSIDE_TEHRAN,
          message: API_ERROR_MESSAGES.OUTSIDE_TEHRAN,
        },
        422
      );
    const v = await new Store(
      c.env.DB,
      c.get("userId"),
      c.env.BOX_KEY
    ).createLocation(p.data);
    return c.json({ data: v }, 201);
  });

  api.patch("/api/locations/:id", async (c) => {
    const p = locationPatchSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!p.success) return c.json({ error: "INVALID_INPUT" }, 400);
    const store = new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY);
    const current = await store.location(c.req.param("id"));
    if (!current) return c.json({ error: "NOT_FOUND" }, 404);
    const merged = { ...current, ...p.data };
    if (
      !isWithinTehranBoundary(Number(merged.latitude), Number(merged.longitude))
    )
      return c.json(
        {
          error: API_ERROR_CODES.OUTSIDE_TEHRAN,
          message: API_ERROR_MESSAGES.OUTSIDE_TEHRAN,
        },
        422
      );
    const v = await store.updateLocation(c.req.param("id"), p.data);
    return v ? c.json({ data: v }) : c.json({ error: "NOT_FOUND" }, 404);
  });
  api.delete("/api/locations/:id", async (c) => {
    const r = await new Store(
      c.env.DB,
      c.get("userId"),
      c.env.BOX_KEY
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
          r === "missing" ? 404 : 409
        );
  });
}
