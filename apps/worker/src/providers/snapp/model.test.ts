import { describe, expect, it } from "vitest";
import { normalizeSnappDeals, type SnappVendor } from "./model";

describe("Snapp provider store logos", () => {
  it("keeps a store logo separate from the product image", () => {
    const vendors: SnappVendor[] = [
      {
        vendor_id: "store-1",
        logoUrl: "https://cdn.example.test/store.png",
        products: [
          {
            productVariationId: "rice",
            price: 100,
            discountRatio: 10,
            title: "Rice",
            discount: 10,
            image: "https://cdn.example.test/rice.png",
            vendorCode: "one",
            vendorId: "store-1",
            vendorTitle: "Store One",
            stock: 3,
            is_out_of_stock: false,
          },
        ],
      } as SnappVendor,
    ];
    const result = normalizeSnappDeals(vendors, 1, 0).deals[0]!;
    expect(result.vendorLogoUrl).toBe("https://cdn.example.test/store.png");
    expect(result.image).toBe("https://cdn.example.test/rice.png");
  });

  it("never uses a product image as an absent store logo", () => {
    const vendors: SnappVendor[] = [
      {
        vendor_id: "store-1",
        products: [
          {
            productVariationId: "rice",
            price: 100,
            discountRatio: 10,
            title: "Rice",
            discount: 10,
            image: "https://cdn.example.test/rice.png",
            vendorId: "store-1",
            vendorTitle: "Store One",
            stock: 3,
            is_out_of_stock: false,
          },
        ],
      },
    ];
    expect(normalizeSnappDeals(vendors, 1, 0).deals[0]).toMatchObject({
      vendorLogoUrl: null,
      image: "https://cdn.example.test/rice.png",
    });
  });
});
