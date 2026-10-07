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

export const API_ERROR_MESSAGES: Record<keyof typeof API_ERROR_CODES, string> =
  {
    OUTSIDE_TEHRAN: "فعلاً فقط امکان استفاده در شهر تهران وجود دارد.",
    PROVIDER_UNAVAILABLE: "این فروشگاه فعلاً برای اسکن جدید در دسترس نیست.",
    INVALID_SEARCH_QUERY: "عبارت جست‌وجو باید بین ۲ تا ۱۲۰ نویسه باشد.",
    GEOCODER_UNAVAILABLE:
      "جست‌وجوی نشانی فعلاً در دسترس نیست؛ مختصات را دستی وارد کنید.",
    GEOCODER_ERROR: "پاسخ جست‌وجوی نشانی دریافت نشد؛ دوباره تلاش کنید.",
    SCAN_IN_PROGRESS:
      "یک اسکن دیگر برای حساب شما در حال اجراست؛ کمی بعد دوباره تلاش کنید.",
  };

export function isWithinTehranBoundary(
  latitude: number,
  longitude: number
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
export const scanInputSchema = z.object({
  locationId: z.string().uuid(),
  threshold: z.number().int().min(1).max(99).default(40),
  source: z
    .enum(["snappmarket", "digikalajet", "okala"])
    .default("snappmarket"),
  mode: z.enum(["partial", "full"]).default("partial"),
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
