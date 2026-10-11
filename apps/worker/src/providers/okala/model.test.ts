import { describe, expect, it } from "vitest";
import {
  offersResponse,
  officialOkalaStoreLogo,
  normalizeOkalaOffer,
} from "./model";

describe("Okala provider store logos", () => {
  it("accepts explicit store logo metadata and keeps the product image separate", () => {
    const entity = offersResponse.parse({
      entities: [
        {
          storeId: 1,
          storeName: "Store One",
          storeLogoUrl: "https://cdn.example.test/store.png",
          products: [],
        },
      ],
    }).entities[0]!;
    const logoUrl = officialOkalaStoreLogo(entity);
    const result = normalizeOkalaOffer(
      {
        id: "rice",
        name: "Rice",
        discountPercent: 10,
        quantity: 3,
        hasQuantity: true,
        okPrice: 90,
        price: 100,
        storeName: "Store One",
        storeId: 1,
        imageUrl: "https://cdn.example.test/rice.png",
      },
      logoUrl
    );
    expect(result.vendorLogoUrl).toBe("https://cdn.example.test/store.png");
    expect(result.image).toBe("https://cdn.example.test/rice.png");
  });

  it("does not infer a store logo from a product image", () => {
    const entity = offersResponse.parse({
      entities: [{ storeId: 1, storeName: "Store One", products: [] }],
    }).entities[0]!;
    expect(officialOkalaStoreLogo(entity)).toBeNull();
  });
});
