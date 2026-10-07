import { z } from "zod";
import type { DealRecord } from "@better-buy/shared";
const store = z.object({
  storeId: z.number(),
  isActive: z.boolean(),
  isServes: z.boolean(),
  isExist: z.boolean(),
});
export const nearbyResponse = z.object({
  success: z.boolean(),
  data: z.object({ stores: z.array(store) }),
});
const product = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
  discountPercent: z.number(),
  quantity: z.number(),
  hasQuantity: z.boolean(),
  okPrice: z.number(),
  price: z.number(),
  storeName: z.string(),
  storeId: z.number(),
  imageUrl: z.string().nullable().optional(),
  storeTypeName: z.string().nullable().optional(),
  storeTypeId: z.number().nullable().optional(),
});
const offerEntity = z.object({
  storeId: z.number(),
  storeName: z.string(),
  products: z.array(product),
});
export const offersResponse = z.object({
  carousel: z.object({ id: z.number() }).optional(),
  entities: z.array(offerEntity),
  success: z.boolean().optional(),
});

export type OkalaProduct = z.infer<typeof product>;
export function normalizeOkalaOffer(
  item: OkalaProduct
): Omit<DealRecord, "scanId" | "state"> {
  const key = `${item.storeId}:${item.id}`;
  return {
    key,
    productVariationId: String(item.id),
    vendorId: String(item.storeId),
    title: item.name,
    image: item.imageUrl ?? null,
    vendorTitle: item.storeName,
    vendorCode: null,
    categoryTitle: item.storeTypeName ?? null,
    priceRials: item.price,
    discountRials: Math.max(0, item.price - item.okPrice),
    finalPriceRials: item.okPrice,
    discountRatio: item.discountPercent,
    stock: item.quantity,
  };
}
