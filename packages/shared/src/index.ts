import { z } from "zod";

/**
 * Versioned, conservative Tehran service-area approximation.
 *
 * This rectangle intentionally describes the supported urban area for the
 * current MVP, rather than the wider Tehran metropolitan region. It is kept
 * in the shared domain package so clients can provide fast feedback while the
 * Worker remains the authoritative enforcer. Replace this definition with a
 * reviewed polygon when the location-search phase introduces one.
 */
export const TEHRAN_BOUNDARY = {
  version: 1,
  minLatitude: 35.56,
  maxLatitude: 35.82,
  minLongitude: 51.18,
  maxLongitude: 51.66,
} as const;

export const API_ERROR_CODES = {
  OUTSIDE_TEHRAN: "OUTSIDE_TEHRAN",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  INVALID_SEARCH_QUERY: "INVALID_SEARCH_QUERY",
  GEOCODER_UNAVAILABLE: "GEOCODER_UNAVAILABLE",
  GEOCODER_ERROR: "GEOCODER_ERROR",
  SCAN_IN_PROGRESS: "SCAN_IN_PROGRESS",
} as const;

export const API_ERROR_MESSAGES: Record<keyof typeof API_ERROR_CODES, string> = {
  OUTSIDE_TEHRAN: "فعلاً فقط امکان استفاده در شهر تهران وجود دارد.",
  PROVIDER_UNAVAILABLE: "این فروشگاه فعلاً برای اسکن جدید در دسترس نیست.",
  INVALID_SEARCH_QUERY: "عبارت جست‌وجو باید بین ۲ تا ۱۲۰ نویسه باشد.",
  GEOCODER_UNAVAILABLE: "جست‌وجوی نشانی فعلاً در دسترس نیست؛ مختصات را دستی وارد کنید.",
  GEOCODER_ERROR: "پاسخ جست‌وجوی نشانی دریافت نشد؛ دوباره تلاش کنید.",
  SCAN_IN_PROGRESS: "یک اسکن دیگر برای حساب شما در حال اجراست؛ کمی بعد دوباره تلاش کنید.",
};

export function isWithinTehranBoundary(
  latitude: number,
  longitude: number,
): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= TEHRAN_BOUNDARY.minLatitude &&
    latitude <= TEHRAN_BOUNDARY.maxLatitude &&
    longitude >= TEHRAN_BOUNDARY.minLongitude &&
    longitude <= TEHRAN_BOUNDARY.maxLongitude
  );
}

export const locationInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isDefault: z.boolean().optional().default(false),
});
export const locationPatchSchema = locationInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const settingsInputSchema = z.object({
  token: z.string().trim().min(20),
  appVersion: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+){2}$/)
    .default("1.397.50"),
});
export const snappOtpRequestSchema = z.object({
  mobile: z
    .string()
    .trim()
    .regex(/^09\d{9}$/),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  appVersion: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+){2}$/)
    .default("1.397.63"),
});
export const snappOtpVerifySchema = snappOtpRequestSchema.extend({
  otp: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/),
  udid: z.string().uuid().optional(),
});
export const scanInputSchema = z.object({
  locationId: z.string().uuid(),
  threshold: z.number().int().min(1).max(99).default(40),
  source: z
    .enum(["snappmarket", "digikalajet", "okala"])
    .default("snappmarket"),
  mode: z.enum(["partial", "full"]).default("partial"),
});
export const digikalaSettingsInputSchema = z.object({
  token: z.string().trim().min(20),
  appId: z.string().trim().min(8),
});
export const okalaSettingsInputSchema = z.object({
  token: z.string().trim().min(20),
});
export const okalaOtpRequestSchema = z.object({
  mobile: z
    .string()
    .trim()
    .regex(/^09\d{9}$/),
});
export const okalaOtpVerifySchema = z.object({
  mobile: z
    .string()
    .trim()
    .regex(/^09\d{9}$/),
  otp: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/),
});

export type LocationInput = z.infer<typeof locationInputSchema>;
export type DealState = "new" | "still_available" | "no_longer_present";
export type ScanStatus = "queued" | "running" | "succeeded" | "failed";

export interface LocationRecord extends LocationInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
export interface LocationSearchResult {
  latitude: number;
  longitude: number;
  displayName: string;
}
export interface SettingsStatus {
  tokenConfigured: boolean;
  tokenExpired: boolean;
  tokenExpiresAt: string | null;
  appVersion: string;
}
export interface ProviderSettingsStatus {
  tokenConfigured: boolean;
  tokenExpired: boolean;
  tokenExpiresAt: string | null;
}
export interface ScanRecord {
  id: string;
  locationId: string;
  locationName: string;
  threshold: number;
  source: "snappmarket" | "digikalajet" | "okala";
  mode: "partial" | "full";
  status: ScanStatus;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  vendorCount: number;
  productCount: number;
  dealCount: number;
  errorCode: string | null;
  errorMessage: string | null;
}
export interface DealRecord {
  key: string;
  scanId: string;
  productVariationId: string;
  vendorId: string;
  title: string;
  image: string | null;
  vendorTitle: string;
  vendorCode: string | null;
  categoryTitle: string | null;
  priceRials: number;
  discountRials: number;
  finalPriceRials: number;
  discountRatio: number;
  stock: number;
  state: DealState;
}

/**
 * Read-model contract for the grouped product shelf.
 *
 * Raw DealRecord rows remain the source of truth. This version is intentionally
 * conservative: the grouping key contains every product and price fact that
 * must match before vendor offers can share one visual row.
 */
export const DEAL_GROUP_KEY_VERSION = 1 as const;
export interface VendorOfferRecord {
  offerKey: string;
  productVariationId: string;
  vendorId: string;
  vendorTitle: string;
  vendorCode: string | null;
  priceRials: number;
  discountRials: number;
  finalPriceRials: number;
  discountRatio: number;
  stock: number;
  state: DealState;
}
export interface DealGroupRecord {
  key: string;
  groupKeyVersion: typeof DEAL_GROUP_KEY_VERSION;
  scanId: string;
  title: string;
  image: string | null;
  categoryTitle: string | null;
  priceRials: number;
  discountRials: number;
  finalPriceRials: number;
  discountRatio: number;
  state: DealState;
  vendors: VendorOfferRecord[];
}

/**
 * Normalize only presentation variants that are safe for exact grouping.
 * ZWNJ is treated as a word separator because feeds commonly mix it with a
 * normal space in Persian product titles; fuzzy matching is deliberately not
 * performed here.
 */
export function normalizeDealGroupText(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const normalized = value
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

/**
 * Canonicalize harmless URL spelling differences while preserving path,
 * query, and meaningful image transformations. Invalid/relative values are
 * compared as normalized strings rather than rejected.
 */
export function canonicalizeDealGroupImage(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeDealGroupText(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if (
      (url.protocol === "https:" && url.port === "443") ||
      (url.protocol === "http:" && url.port === "80")
    )
      url.port = "";
    // Fragments are client-only and do not identify a different image.
    url.hash = "";
    return url.toString();
  } catch {
    return normalized;
  }
}

const dealStateRank = (state: DealState) =>
  state === "still_available" ? 2 : state === "new" ? 1 : 0;

const preferredDeal = (a: DealRecord, b: DealRecord) => {
  const stateRank = dealStateRank(a.state) - dealStateRank(b.state);
  if (stateRank) return stateRank > 0 ? a : b;
  return a.key <= b.key ? a : b;
};

/**
 * Build the v1 grouped read projection for one provider/scan.
 *
 * `deals` can contain current rows and prior rows marked
 * `no_longer_present`, as returned by Store.deals(). Vendor identity and
 * stock are excluded from the product key, but vendor rows are retained as
 * unique chips with their individual history state.
 */
export function groupDeals(
  provider: string,
  deals: readonly DealRecord[],
): DealGroupRecord[] {
  const buckets = new Map<string, DealRecord[]>();
  for (const deal of deals) {
    const key = `v${DEAL_GROUP_KEY_VERSION}:${JSON.stringify([
      normalizeDealGroupText(provider) ?? "",
      deal.productVariationId.trim(),
      normalizeDealGroupText(deal.title) ?? "",
      canonicalizeDealGroupImage(deal.image),
      normalizeDealGroupText(deal.categoryTitle),
      deal.priceRials,
      deal.discountRials,
      deal.finalPriceRials,
      deal.discountRatio,
    ])}`;
    const rows = buckets.get(key);
    if (rows) rows.push(deal);
    else buckets.set(key, [deal]);
  }

  return [...buckets.entries()]
    .map(([key, rows]) => {
      const current = rows.filter((row) => row.state !== "no_longer_present");
      const representative = rows.reduce(preferredDeal);
      const vendorRows = new Map<string, DealRecord>();
      for (const row of rows) {
        const previous = vendorRows.get(row.vendorId);
        if (!previous) vendorRows.set(row.vendorId, row);
        else vendorRows.set(row.vendorId, preferredDeal(row, previous));
      }
      const vendors = [...vendorRows.values()]
        .map((row): VendorOfferRecord => ({
          offerKey: row.key,
          productVariationId: row.productVariationId,
          vendorId: row.vendorId,
          vendorTitle: row.vendorTitle,
          vendorCode: row.vendorCode,
          priceRials: row.priceRials,
          discountRials: row.discountRials,
          finalPriceRials: row.finalPriceRials,
          discountRatio: row.discountRatio,
          stock: row.stock,
          state: row.state,
        }))
        .sort((a, b) => {
          const aTitle = normalizeDealGroupText(a.vendorTitle) ?? "";
          const bTitle = normalizeDealGroupText(b.vendorTitle) ?? "";
          return aTitle < bTitle
            ? -1
            : aTitle > bTitle
              ? 1
              : a.vendorId < b.vendorId
                ? -1
                : a.vendorId > b.vendorId
                  ? 1
                  : 0;
        });
      const state: DealState = current.length
        ? current.some((row) => row.state === "still_available")
          ? "still_available"
          : "new"
        : "no_longer_present";
      return {
        key,
        groupKeyVersion: DEAL_GROUP_KEY_VERSION,
        scanId: representative.scanId,
        title: representative.title,
        image: representative.image,
        categoryTitle: representative.categoryTitle,
        priceRials: representative.priceRials,
        discountRials: representative.discountRials,
        finalPriceRials: representative.finalPriceRials,
        discountRatio: representative.discountRatio,
        state,
        vendors,
      } satisfies DealGroupRecord;
    })
    .sort((a, b) =>
      a.discountRatio !== b.discountRatio
        ? b.discountRatio - a.discountRatio
        : a.key < b.key
          ? -1
          : a.key > b.key
            ? 1
            : 0,
    );
}

/** SnappMarket's price fields are already expressed in tomans. */
export const toman = (amount: number) => Math.round(amount);
