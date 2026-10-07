import { z } from "zod";
import type { DealRecord } from "@better-buy/shared";
const identifier = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const pagination = {
  pageIndex: z.number().int().nonnegative().optional(),
  pageSize: z.number().int().nonnegative().optional(),
  totalCount: z.number().int().nonnegative().optional(),
  totalPages: z.number().int().nonnegative().optional(),
  hasNextPage: z.boolean().optional(),
};
const store = z.object({
  storeId: identifier,
  isActive: z.boolean(),
  isServes: z.boolean(),
  isExist: z.boolean(),
});
export const nearbyResponse = z.object({
  success: z.boolean(),
  data: z.object({ stores: z.array(store) }),
});
export const campaignsResponse = z.object({
  success: z.boolean(),
  carousels: z.array(
    z.discriminatedUnion("isMulti", [
      z.object({ isMulti: z.literal(true), id: identifier }),
      z.object({ isMulti: z.literal(false) }),
    ])
  ),
  ...pagination,
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
  ...pagination,
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
