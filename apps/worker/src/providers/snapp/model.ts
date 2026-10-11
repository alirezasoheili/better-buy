import { z } from "zod";
import type { DealRecord } from "@better-buy/shared";
import { isEligibleDeal } from "../../domain/eligibility";
const productSchema = z
  .object({
    productVariationId: z.union([z.string(), z.number()]),
    price: z.number().nonnegative(),
    discountRatio: z.number(),
    title: z.string(),
    discount: z.number().nonnegative().default(0),
    image: z.string().nullable().optional(),
    main_image: z.string().nullable().optional(),
    vendorCode: z.string().nullable().optional(),
    vendorId: z.union([z.string(), z.number()]),
    vendorTitle: z.string(),
    menu_category_title: z.string().nullable().optional(),
    stock: z.number().default(0),
    is_out_of_stock: z.boolean().default(false),
  })
  .passthrough();
export const vendorSchema = z
  .object({
    vendor_id: z.union([z.string(), z.number()]),
    products: z.array(productSchema),
  })
  .passthrough();
export const responseSchema = z.object({
  status: z.boolean(),
  data: z.object({
    total_count: z.number().int().nonnegative(),
    vendors: z.array(vendorSchema),
  }),
});

export type SnappVendor = z.infer<typeof vendorSchema>;
function officialStoreLogo(vendor: SnappVendor): string | null {
  const raw = vendor as Record<string, unknown>;
  for (const key of [
    "logoUrl",
    "storeLogoUrl",
    "logo_url",
    "store_logo_url",
    "logo",
  ]) {
    const value = raw[key];
    if (typeof value !== "string") continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:")
        return url.toString();
    } catch {
      /* Ignore malformed provider metadata. */
    }
  }
  return null;
}
export function normalizeSnappDeals(
  vendors: Iterable<SnappVendor>,
  vendorCount: number,
  threshold: number
): {
  vendorCount: number;
  productCount: number;
  deals: Omit<DealRecord, "scanId" | "state">[];
} {
  const products = new Map<string, z.infer<typeof productSchema>>();
  const vendorLogos = new Map<string, string | null>();
  for (const vendor of vendors) {
    vendorLogos.set(String(vendor.vendor_id), officialStoreLogo(vendor));
    for (const p of vendor.products)
      products.set(`${p.vendorId}:${p.productVariationId}`, p);
  }
  const deals = [...products.entries()]
    .filter(([, p]) =>
      isEligibleDeal(p.discountRatio, !p.is_out_of_stock, p.stock, threshold)
    )
    .map(([key, p]) => ({
      key,
      productVariationId: String(p.productVariationId),
      vendorId: String(p.vendorId),
      title: p.title,
      image: p.image ?? p.main_image ?? null,
      vendorTitle: p.vendorTitle,
      vendorCode: p.vendorCode ?? null,
      vendorLogoUrl: vendorLogos.get(String(p.vendorId)) ?? null,
      categoryTitle: p.menu_category_title ?? null,
      priceRials: p.price,
      discountRials: p.discount,
      finalPriceRials: Math.max(0, p.price - p.discount),
      discountRatio: p.discountRatio,
      stock: p.stock,
    }));
  return { vendorCount, productCount: products.size, deals };
}
