import { describe, expect, it } from "vitest";
import { recommendCart, type CartOfferLine } from "./cart-recommendations";
import type { CartLine } from "@better-buy/shared";

const line = (key: string, quantity = 1): CartLine => ({
  key,
  title: key,
  image: null,
  categoryTitle: null,
  quantity,
});
const offer = (vendorId: string, priceRials: number, stock = 99) => ({
  vendorId,
  vendorCode: null,
  vendorTitle: vendorId,
  logoUrl: null,
  priceRials,
  stock,
});
const cartLine = (
  key: string,
  offers: ReturnType<typeof offer>[],
  quantity = 1
): CartOfferLine => ({ line: line(key, quantity), offers });

describe("cart recommendation solver", () => {
  it("minimizes stores before price, even when a multi-store split is cheaper", () => {
    const result = recommendCart([
      cartLine("a", [offer("split-1", 1), offer("single", 100)]),
      cartLine("b", [offer("split-1", 1), offer("single", 100)]),
      cartLine("c", [offer("split-2", 1), offer("single", 100)]),
    ]);
    expect(result.stores.map((store) => store.vendorId)).toEqual(["single"]);
    expect(result.totalRials).toBe(300);
    expect(result.optimal).toBe(true);
  });

  it("finds an exact two-store cover and uses the cheapest duplicate offer for each store", () => {
    const result = recommendCart([
      cartLine("a", [offer("one", 20), offer("one", 10), offer("two", 50)]),
      cartLine("b", [offer("two", 15), offer("three", 80)]),
      cartLine("c", [offer("one", 5), offer("three", 80)]),
    ]);
    expect(result.stores.map((store) => store.vendorId)).toEqual([
      "one",
      "two",
    ]);
    expect(
      result.stores
        .flatMap((store) => store.items)
        .map((item) => item.priceRials)
    ).toEqual([10, 5, 15]);
    expect(result.optimal).toBe(true);
  });

  it("escapes a four-store cheapest-per-item split when a three-store cover exists", () => {
    const result = recommendCart([
      cartLine("a", [offer("a-cheap", 1), offer("x", 10)]),
      cartLine("b", [offer("b-cheap", 1), offer("x", 10), offer("y", 10)]),
      cartLine("c", [offer("c-cheap", 1), offer("y", 10)]),
      cartLine("d", [offer("d-cheap", 1), offer("z", 10)]),
    ]);
    expect(result.stores.map((store) => store.vendorId)).toEqual([
      "a-cheap",
      "d-cheap",
      "y",
    ]);
    expect(result.totalRials).toBe(22);
    expect(result.optimal).toBe(true);
  });

  it("uses quantity-weighted cost and stable vendor ids to break equal totals", () => {
    const result = recommendCart([
      cartLine("large", [offer("a", 10), offer("b", 8)], 5),
      cartLine("small", [offer("a", 100), offer("b", 120)]),
      cartLine("tie", [offer("z", 50), offer("a", 50)]),
    ]);
    expect(result.stores.map((store) => store.vendorId)).toEqual(["a"]);
    expect(result.totalRials).toBe(200);
  });

  it("requires full quantity and reports the right missing reason", () => {
    const result = recommendCart([
      cartLine("short", [offer("one", 10, 1)], 2),
      cartLine("gone", []),
    ]);
    expect(result.status).toBe("partial");
    expect(result.missingItems.map((item) => item.reason)).toEqual([
      "insufficient_quantity",
      "missing_product",
    ]);
  });

  it("marks a budget-limited deeper search while retaining a feasible assignment", () => {
    const result = recommendCart(
      [
        cartLine("a", [offer("one", 1), offer("two", 2)]),
        cartLine("b", [offer("three", 1), offer("four", 2)]),
        cartLine("c", [offer("five", 1), offer("six", 2)]),
      ],
      { searchLimit: 1 }
    );
    expect(result.status).toBe("search_limit");
    expect(result.optimal).toBe(false);
    expect(result.stores.length).toBeGreaterThan(0);
    expect(result.searchLimit).toBe(1);
  });
});
