import { nearbyResponse, offersResponse, normalizeOkalaOffer } from "./model";
import { isEligibleDeal } from "../../domain/eligibility";
import type { DealRecord } from "@better-buy/shared";
import { Effect } from "effect";
import { CollectorError, type PersistenceError } from "../../domain/failures";
import { requestJson } from "../../infrastructure/http";

const bffUrl =
  "https://apigateway.okala.com/api/bff/v1/stores?fragments=carousels&platform=0";
const headers = (token: string) => ({
  accept: "application/json",
  authorization: `Bearer ${token}`,
  origin: "https://www.okala.com",
  source: "okala",
  "ui-version": "2.0",
});

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

export function collectOkala(input: {
  latitude: number;
  longitude: number;
  threshold: number;
  token: string;
  fetcher?: typeof fetch;
  onProgress?: (counts: {
    vendorCount: number;
    productCount: number;
  }) => Effect.Effect<void, PersistenceError>;
}) {
  return Effect.gen(function* () {
    const fetcher = input.fetcher ?? fetch;
    const get = (url: string, auth = true) =>
      requestJson(
        url,
        {
          headers: auth
            ? headers(input.token)
            : {
                accept: "application/json",
                origin: "https://www.okala.com",
                source: "okala",
                "ui-version": "2.0",
                "x-skip-authorization": "true",
              },
        },
        { fetcher, provider: "اکالا" }
      ).pipe(Effect.map((response) => response.body));
    const bff = yield* get(bffUrl);
    const ids = new Set<number>();
    findCarouselIds(bff, ids);
    if (!ids.size)
      return yield* Effect.fail(
        new CollectorError(
          "NO_CAMPAIGNS",
          "کمپین چندفروشگاهی فعالی در اکالا پیدا نشد"
        )
      );
    const nearby = nearbyResponse.safeParse(
      yield* get(
        `https://apigateway.okala.com/api/opex/v4/stores/nearby?latitude=${encodeURIComponent(input.latitude)}&longitude=${encodeURIComponent(input.longitude)}`
      )
    );
    if (!nearby.success || !nearby.data.success)
      return yield* Effect.fail(
        new CollectorError(
          "UPSTREAM_CHANGED",
          "ساختار فروشگاه‌های نزدیک اکالا تغییر کرده است"
        )
      );
    const storeIds = [
      ...new Set(
        nearby.data.data.stores
          .filter((s) => s.isActive && s.isServes && s.isExist)
          .map((s) => s.storeId)
      ),
    ];
    if (!storeIds.length)
      return yield* Effect.fail(
        new CollectorError(
          "NO_STORES",
          "فروشگاه سرویس‌دهنده‌ای در این مکان اکالا پیدا نشد"
        )
      );
    const rows = new Map<string, Omit<DealRecord, "scanId" | "state">>();
    let products = 0,
      completed = 0;
    for (const carouselId of ids) {
      const query = new URLSearchParams({ carouselId: String(carouselId) });
      storeIds.forEach((id) => query.append("StoreIds", String(id)));
      const payload = offersResponse.safeParse(
        yield* get(
          `https://apigateway.okala.com/api/carousel/v4/offers/multi-store?${query.toString()}`,
          false
        )
      );
      if (!payload.success || payload.data.success === false)
        return yield* Effect.fail(
          new CollectorError(
            "UPSTREAM_CHANGED",
            "ساختار پیشنهادهای اکالا تغییر کرده است"
          )
        );
      for (const entity of payload.data.entities)
        for (const item of entity.products) {
          products++;
          if (
            isEligibleDeal(
              item.discountPercent,
              item.hasQuantity,
              item.quantity,
              input.threshold
            )
          ) {
            const key = `${item.storeId}:${item.id}`;
            rows.set(key, normalizeOkalaOffer(item));
          }
        }
      completed++;
      if (input.onProgress)
        yield* input.onProgress({
          vendorCount: Math.min(storeIds.length, completed),
          productCount: products,
        });
    }
    return {
      vendorCount: storeIds.length,
      productCount: products,
      deals: [...rows.values()],
    };
  });
}
