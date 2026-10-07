import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { collectOkala as collection } from "./okala";

const collectOkala = (input: Parameters<typeof collection>[0]) =>
  Effect.runPromise(collection(input));

const bff = {
  data: {
    carousels: {
      entities: [
        { id: 87001, isMulti: true },
        { id: 5, isMulti: false },
      ],
    },
  },
};
const nearby = {
  success: true,
  data: {
    stores: [
      { storeId: 1, isActive: true, isServes: true, isExist: true },
      { storeId: 2, isActive: false, isServes: true, isExist: true },
    ],
  },
};
const offers = {
  success: true,
  entities: [
    {
      storeId: 1,
      storeName: "فروشگاه",
      products: [
        {
          id: 1,
          name: "مرزی",
          discountPercent: 30,
          quantity: 1,
          hasQuantity: true,
          okPrice: 700000,
          price: 1000000,
          storeName: "فروشگاه",
          storeId: 1,
          imageUrl: null,
          storeTypeName: "سوپر",
          storeTypeId: 1,
        },
        {
          id: 1,
          name: "مرزی",
          discountPercent: 30,
          quantity: 1,
          hasQuantity: true,
          okPrice: 700000,
          price: 1000000,
          storeName: "فروشگاه",
          storeId: 1,
          imageUrl: null,
          storeTypeName: "سوپر",
          storeTypeId: 1,
        },
      ],
    },
  ],
};
describe("Okala collector", () => {
  it("uses serviceable stores, includes the 30 boundary, and deduplicates", async () => {
    let i = 0;
    const fetcher = async () =>
      new Response(JSON.stringify([bff, nearby, offers][i++]), { status: 200 });
    const result = await collectOkala({
      latitude: 35,
      longitude: 51,
      threshold: 30,
      token: "token",
      fetcher: fetcher as typeof fetch,
    });
    expect(result.vendorCount).toBe(1);
    expect(result.deals).toHaveLength(1);
    expect(result.deals[0]?.finalPriceRials).toBe(700000);
    expect(result.deals[0]?.discountRials).toBe(300000);
  });
  it("normalizes rejected authentication", async () => {
    const fetcher = async () => new Response("", { status: 401 });
    await expect(
      collectOkala({
        latitude: 35,
        longitude: 51,
        threshold: 30,
        token: "token",
        fetcher: fetcher as typeof fetch,
      })
    ).rejects.toMatchObject({ code: "AUTH_REJECTED" });
  });
});

it("does not treat a rejected nearby-store envelope as a successful empty collection", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(bff))
    .mockResolvedValueOnce(Response.json({ ...nearby, success: false }));
  await expect(
    collectOkala({
      latitude: 35.7,
      longitude: 51.4,
      threshold: 30,
      token: "fixture",
      fetcher,
    })
  ).rejects.toMatchObject({ code: "UPSTREAM_CHANGED" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("filters stock and discounts across all independent campaigns", async () => {
  const template = offers.entities[0]!.products[0]!;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        data: [
          { id: 1, isMulti: true },
          { id: 2, isMulti: true },
        ],
      })
    )
    .mockResolvedValueOnce(Response.json(nearby))
    .mockResolvedValueOnce(
      Response.json({
        entities: [
          {
            storeId: 1,
            storeName: "فروشگاه",
            products: [
              { ...template, id: 1, discountPercent: 29 },
              { ...template, id: 2, hasQuantity: false },
              { ...template, id: 3, quantity: 0 },
              { ...template, id: 4 },
            ],
          },
        ],
      })
    )
    .mockResolvedValueOnce(
      Response.json({
        entities: [
          {
            storeId: 1,
            storeName: "فروشگاه",
            products: [
              { ...template, id: 4 },
              { ...template, id: 5, discountPercent: 40 },
            ],
          },
        ],
      })
    );
  const result = await collectOkala({
    latitude: 35.7,
    longitude: 51.4,
    threshold: 30,
    token: "fixture",
    fetcher,
  });
  expect(result.deals.map((deal) => deal.key)).toEqual(["1:4", "1:5"]);
  expect(result.productCount).toBe(6);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
