import { z } from "zod";

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

/** SnappMarket's price fields are already expressed in tomans. */
export const toman = (amount: number) => Math.round(amount);
