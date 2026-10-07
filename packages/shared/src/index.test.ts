import { describe, expect, it } from "vitest";
import {
  TEHRAN_BOUNDARY,
  groupDeals,
  isWithinTehranBoundary,
} from "./index";
import type { DealRecord } from "./index";

const deal = (overrides: Partial<DealRecord> = {}): DealRecord => ({
  key: "vendor-1:product-1",
  scanId: "scan-1",
  productVariationId: "product-1",
  vendorId: "vendor-1",
  title: "ماست کم چرب",
  image: "https://cdn.example.test/maast.jpg",
  vendorTitle: "فروشگاه یک",
  vendorCode: null,
  categoryTitle: "لبنیات",
  priceRials: 100_000,
  discountRials: 20_000,
  finalPriceRials: 80_000,
  discountRatio: 20,
  stock: 1,
  state: "new",
  ...overrides,
});

describe("Tehran location policy", () => {
  it("accepts a point inside the versioned boundary", () => {
    expect(isWithinTehranBoundary(35.7285, 51.309056)).toBe(true);
  });

  it("accepts points on the published boundary edges", () => {
    expect(
      isWithinTehranBoundary(
        TEHRAN_BOUNDARY.minLatitude,
        TEHRAN_BOUNDARY.minLongitude,
      ),
    ).toBe(true);
    expect(
      isWithinTehranBoundary(
        TEHRAN_BOUNDARY.maxLatitude,
        TEHRAN_BOUNDARY.maxLongitude,
      ),
    ).toBe(true);
  });

  it("rejects points outside Tehran and non-finite coordinates", () => {
    expect(isWithinTehranBoundary(36, 51.4)).toBe(false);
    expect(isWithinTehranBoundary(35.7, 51.8)).toBe(false);
    expect(isWithinTehranBoundary(Number.NaN, 51.4)).toBe(false);
    expect(isWithinTehranBoundary(35.7, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("versioned deal grouping", () => {
  it("groups exact offers across vendors while normalizing Persian text and ignoring stock", () => {
    const groups = groupDeals("snappmarket", [
      deal(),
      deal({
        key: "vendor-2:product-1",
        vendorId: "vendor-2",
        vendorTitle: "فروشگاه دو",
        title: "ماست  کم‌چرب",
        stock: 9,
        state: "still_available",
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.groupKeyVersion).toBe(1);
    expect(groups[0]?.state).toBe("still_available");
    expect(groups[0]?.vendors.map((vendor) => vendor.vendorId).sort()).toEqual([
      "vendor-1",
      "vendor-2",
    ]);
    expect(
      Object.fromEntries(
        groups[0]?.vendors.map((vendor) => [vendor.vendorId, vendor.stock]) ?? [],
      ),
    ).toEqual({ "vendor-1": 1, "vendor-2": 9 });
    expect(groups[0]?.vendors[0]).toMatchObject({
      priceRials: 100_000,
      discountRials: 20_000,
      finalPriceRials: 80_000,
      discountRatio: 20,
    });
  });

  it("splits groups when identity, meaningful image, category, or any price fact differs", () => {
    const groups = groupDeals("snappmarket", [
      deal(),
      deal({ key: "vendor-2:product-2", productVariationId: "product-2", vendorId: "vendor-2" }),
      deal({ key: "vendor-3:product-1", vendorId: "vendor-3", image: "https://cdn.example.test/other.jpg" }),
      deal({ key: "vendor-4:product-1", vendorId: "vendor-4", discountRials: 15_000 }),
      deal({ key: "vendor-5:product-1", vendorId: "vendor-5", categoryTitle: "نوشیدنی" }),
    ]);

    expect(groups).toHaveLength(5);
  });

  it("derives mixed vendor history without hiding removed members", () => {
    const groups = groupDeals("okala", [
      deal({ key: "vendor-1:product-1", state: "still_available" }),
      deal({
        key: "vendor-2:product-1",
        vendorId: "vendor-2",
        vendorTitle: "فروشگاه دو",
        state: "no_longer_present",
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.state).toBe("still_available");
    expect(
      Object.fromEntries(
        groups[0]?.vendors.map((vendor) => [vendor.vendorId, vendor.state]) ?? [],
      ),
    ).toEqual({
      "vendor-1": "still_available",
      "vendor-2": "no_longer_present",
    });
  });

  it("marks a group new only when all current vendor offers are new", () => {
    const groups = groupDeals("snappmarket", [
      deal({ key: "vendor-1:product-1", state: "new" }),
      deal({ key: "vendor-2:product-1", vendorId: "vendor-2", state: "still_available" }),
    ]);

    expect(groups[0]?.state).toBe("still_available");
  });

  it("does not duplicate a vendor chip when raw offers repeat", () => {
    const groups = groupDeals("snappmarket", [
      deal({ key: "vendor-1:product-1" }),
      deal({ key: "vendor-1:product-1-copy", vendorTitle: "فروشگاه یک", stock: 2 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.vendors).toHaveLength(1);
    expect(groups[0]?.vendors[0]?.offerKey).toBe("vendor-1:product-1");
  });
});
