import { z } from "zod";
import { locationInputSchema } from "./validation";
const count = z.number().int().nonnegative();
const date = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const state = z.enum(["new", "still_available", "no_longer_present"]);
const prices = {
  priceRials: z.number().nonnegative(),
  discountRials: z.number().nonnegative(),
  finalPriceRials: z.number().nonnegative(),
  discountRatio: z.number(),
};
export const locationRecordSchema = locationInputSchema.extend({
  id: z.string().min(1),
  createdAt: date,
  updatedAt: date,
});
export const scanRecordSchema = z.object({
  id: z.string().min(1),
  locationId: z.string().min(1),
  locationName: z.string(),
  threshold: z.number(),
  source: z.enum(["snappmarket", "okala", "digikalajet"]),
  mode: z.enum(["partial", "full"]),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  createdAt: date,
  startedAt: date.nullable(),
  finishedAt: date.nullable(),
  vendorCount: count,
  productCount: count,
  dealCount: count,
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
const vendorOfferSchema = z.object({
  offerKey: z.string(),
  productVariationId: z.string(),
  vendorId: z.string(),
  vendorTitle: z.string(),
  vendorCode: z.string().nullable(),
  ...prices,
  stock: z.number(),
  state,
});
export const dealRecordSchema = vendorOfferSchema
  .omit({ offerKey: true })
  .extend({
    key: z.string(),
    scanId: z.string(),
    title: z.string(),
    image: z.string().nullable(),
    categoryTitle: z.string().nullable(),
  });
export const dealGroupSchema = z.object({
  key: z.string(),
  groupKeyVersion: z.literal(1),
  scanId: z.string(),
  title: z.string(),
  image: z.string().nullable(),
  categoryTitle: z.string().nullable(),
  ...prices,
  state,
  vendors: z.array(vendorOfferSchema).min(1),
});
export const locationsReadSchema = z.array(locationRecordSchema);
export const scansReadSchema = z.array(scanRecordSchema);
export const dealsReadSchema = z.array(dealRecordSchema);
export const groupsReadSchema = z.array(dealGroupSchema);
export const scanStartedSchema = z.object({
  id: z.string().min(1),
  status: z.literal("queued"),
});
export const locationSearchReadSchema = z.array(
  z.object({
    latitude: z.number().finite(),
    longitude: z.number().finite(),
    displayName: z.string(),
  })
);
