import { z } from "zod";
import type { DealRecord } from "@better-buy/shared";
import { CollectorError } from "./collector";

const store = z.object({
  storeId: z.number(),
  isActive: z.boolean(),
  isServes: z.boolean(),
  isExist: z.boolean(),
});
const nearbyResponse = z.object({
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
const offersResponse = z.object({
  carousel: z.object({ id: z.number() }).optional(),
  entities: z.array(offerEntity),
  success: z.boolean().optional(),
});

const bffUrl =
  "https://apigateway.okala.com/api/bff/v1/stores?fragments=carousels&platform=0";
const headers = (token: string) => ({
  accept: "application/json",
  authorization: `Bearer ${token}`,
  origin: "https://www.okala.com",
  source: "okala",
  "ui-version": "2.0",
});

function collectorError(status: number, provider = "اکالا") {
  if (status === 401 || status === 403)
    return new CollectorError("AUTH_REJECTED", `توکن ${provider} پذیرفته نشد`);
  if (status === 429)
    return new CollectorError(
      "RATE_LIMITED",
      `${provider} درخواست‌ها را محدود کرده است`,
    );
  return new CollectorError(
    "UPSTREAM_ERROR",
    `پاسخ ناموفق ${provider} (${status})`,
  );
}

function findCarouselIds(value: unknown, ids: Set<number>) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => findCarouselIds(item, ids));
    return;
  }
  const item = value as Record<string, unknown>;
  if (item.isMulti === true && typeof item.id === "number") ids.add(item.id);
  Object.values(item).forEach((child) => findCarouselIds(child, ids));
}

export async function collectOkala(input: {
  latitude: number;
  longitude: number;
  threshold: number;
  token: string;
  fetcher?: typeof fetch;
  onProgress?: (counts: { vendorCount: number; productCount: number }) => void;
}) {
  const fetcher = input.fetcher ?? fetch;
  const get = async (url: string, auth = true) => {
    let res: Response;
    try {
      res = await fetcher(url, {
        headers: auth
          ? headers(input.token)
          : {
              accept: "application/json",
              origin: "https://www.okala.com",
              source: "okala",
              "ui-version": "2.0",
              "x-skip-authorization": "true",
            },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new CollectorError("NETWORK_ERROR", "ارتباط با اکالا برقرار نشد");
    }
    if (!res.ok) throw collectorError(res.status);
    try {
      return await res.json();
    } catch {
      throw new CollectorError(
        "UPSTREAM_CHANGED",
        "پاسخ اکالا JSON معتبر نیست",
      );
    }
  };
  const bff = await get(bffUrl);
  const ids = new Set<number>();
  findCarouselIds(bff, ids);
  if (!ids.size)
    throw new CollectorError(
      "NO_CAMPAIGNS",
      "کمپین چندفروشگاهی فعالی در اکالا پیدا نشد",
    );
  const nearby = nearbyResponse.safeParse(
    await get(
      `https://apigateway.okala.com/api/opex/v4/stores/nearby?latitude=${encodeURIComponent(input.latitude)}&longitude=${encodeURIComponent(input.longitude)}`,
    ),
  );
  if (!nearby.success)
    throw new CollectorError(
      "UPSTREAM_CHANGED",
      "ساختار فروشگاه‌های نزدیک اکالا تغییر کرده است",
    );
  const storeIds = [
    ...new Set(
      nearby.data.data.stores
        .filter((s) => s.isActive && s.isServes && s.isExist)
        .map((s) => s.storeId),
    ),
  ];
  if (!storeIds.length)
    throw new CollectorError(
      "NO_STORES",
      "فروشگاه سرویس‌دهنده‌ای در این مکان اکالا پیدا نشد",
    );
  const rows = new Map<string, Omit<DealRecord, "scanId" | "state">>();
  let products = 0,
    completed = 0;
  for (const carouselId of ids) {
    const query = new URLSearchParams({ carouselId: String(carouselId) });
    storeIds.forEach((id) => query.append("StoreIds", String(id)));
    const payload = offersResponse.safeParse(
      await get(
        `https://apigateway.okala.com/api/carousel/v4/offers/multi-store?${query.toString()}`,
        false,
      ),
    );
    if (!payload.success || payload.data.success === false)
      throw new CollectorError(
        "UPSTREAM_CHANGED",
        "ساختار پیشنهادهای اکالا تغییر کرده است",
      );
    for (const entity of payload.data.entities)
      for (const item of entity.products) {
        products++;
        if (
          item.hasQuantity &&
          item.quantity > 0 &&
          item.discountPercent >= input.threshold
        ) {
          const key = `${item.storeId}:${item.id}`;
          rows.set(key, {
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
          });
        }
      }
    completed++;
    input.onProgress?.({
      vendorCount: Math.min(storeIds.length, completed),
      productCount: products,
    });
  }
  return {
    vendorCount: storeIds.length,
    productCount: products,
    deals: [...rows.values()],
  };
}
