import { expect, it } from "vitest";
import { bestOffer } from "./presentation";
import type { DealGroupRecord, VendorOfferRecord } from "@better-buy/shared";
const offer = (
  vendorTitle: string,
  finalPriceRials: number,
  state: VendorOfferRecord["state"],
  discountRatio: number
): VendorOfferRecord => ({
  offerKey: vendorTitle,
  productVariationId: "p",
  vendorId: vendorTitle,
  vendorTitle,
  vendorCode: null,
  priceRials: 100000,
  discountRials: 100000 - finalPriceRials,
  finalPriceRials,
  discountRatio,
  stock: 3,
  state,
});
const group = (vendors: VendorOfferRecord[]): DealGroupRecord => ({
  key: "g",
  groupKeyVersion: 1,
  scanId: "s",
  title: "کالا",
  image: null,
  categoryTitle: null,
  priceRials: 100000,
  discountRials: 50000,
  finalPriceRials: 50000,
  discountRatio: 50,
  state: "new",
  vendors,
});
it("chooses the best current offer and keeps its price and discount together", () => {
  const best = bestOffer(
    group([
      offer("historical", 100, "no_longer_present", 99),
      offer("discount", 70000, "new", 60),
      offer("cheapest", 50000, "still_available", 50),
    ])
  );
  expect(best).toMatchObject({
    vendorTitle: "cheapest",
    priceRials: 100000,
    finalPriceRials: 50000,
    discountRatio: 50,
  });
});
it("retains historical prices only when every offer is historical", () => {
  expect(
    bestOffer(group([offer("old", 40000, "no_longer_present", 60)]))
  ).toMatchObject({ state: "no_longer_present", finalPriceRials: 40000 });
});
