import { z } from "zod";
import type { DealRecord } from "@better-buy/shared";
import { CollectorError } from "./domain/failures";

const product = z.object({
  id: z.union([z.string(), z.number()]),
  product_id: z.union([z.string(), z.number()]),
  title: z.string(),
  media: z.string().nullable().optional(),
  shop: z.object({ id: z.union([z.string(), z.number()]) }),
  category: z.object({ title: z.string() }).nullable().optional(),
  price: z.object({
    price: z.number(),
    discount: z.number(),
    discount_percentage: z.number(),
  }),
  stock: z.object({ has_stock: z.boolean() }),
});
const response = z.object({
  status: z.number(),
  data: z.object({
    result: z.array(product),
    pager: z.object({ current_page: z.number(), total_pages: z.number() }),
  }),
});
export async function collectDigikala(input: {
  threshold: number;
  mode: "partial" | "full";
  token: string;
  appId: string;
  onProgress?: (c: { vendorCount: number; productCount: number }) => void;
}) {
  const threshold = Math.max(30, input.threshold),
    max = input.mode === "full" ? 350 : 25,
    rows: Omit<DealRecord, "scanId" | "state">[] = [];
  let pages = 0,
    products = 0,
    total = 1;
  for (let page = 1; page <= Math.min(total, max); page++) {
    let res: Response;
    try {
      res = await fetch(
        `https://api.digikalajet.ir/v3/products/galaxy/?page=${page}&category_id=&business=&pageName=home`,
        {
          headers: {
            accept: "application/json, text/plain, */*",
            authorization: input.token,
            "app-id": input.appId,
            client: "superWeb",
            origin: "https://www.digikalajet.com",
            referer: "https://www.digikalajet.com/",
          },
          signal: AbortSignal.timeout(30_000),
        }
      );
    } catch {
      throw new CollectorError(
        "NETWORK_ERROR",
        "ارتباط با دیجی‌کالا جت برقرار نشد"
      );
    }
    if (res.status === 401 || res.status === 403)
      throw new CollectorError(
        "AUTH_REJECTED",
        "توکن دیجی‌کالا جت پذیرفته نشد"
      );
    if (res.status === 429)
      throw new CollectorError(
        "RATE_LIMITED",
        "دیجی‌کالا جت درخواست‌ها را محدود کرده است"
      );
    if (!res.ok)
      throw new CollectorError(
        "UPSTREAM_ERROR",
        `پاسخ ناموفق دیجی‌کالا جت (${res.status})`
      );
    const parsed = response.safeParse(await res.json());
    if (!parsed.success)
      throw new CollectorError(
        "UPSTREAM_CHANGED",
        "ساختار پاسخ دیجی‌کالا جت تغییر کرده است"
      );
    total = parsed.data.data.pager.total_pages;
    pages++;
    for (const p of parsed.data.data.result) {
      products++;
      if (p.stock.has_stock && p.price.discount_percentage >= threshold)
        rows.push({
          key: `${p.shop.id}:${p.id}`,
          productVariationId: String(p.id),
          vendorId: String(p.shop.id),
          title: p.title,
          image: p.media ?? null,
          vendorTitle: "دیجی‌کالا جت",
          vendorCode: null,
          categoryTitle: p.category?.title ?? null,
          priceRials: p.price.price,
          discountRials: p.price.discount,
          finalPriceRials: p.price.price - p.price.discount,
          discountRatio: p.price.discount_percentage,
          stock: 1,
        });
    }
    input.onProgress?.({ vendorCount: pages, productCount: products });
  }
  return { vendorCount: pages, productCount: products, deals: rows };
}
