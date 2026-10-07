import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectOkala as collection } from "./okala";

const input = { latitude: 35.73, longitude: 51.42, threshold: 40 };
const store = { storeId: 11, isActive: true, isServes: true, isExist: true };
const nearby = {
  success: true,
  data: {
    stores: [
      store,
      store,
      { ...store, storeId: 12 },
      { ...store, storeId: 13, isActive: false },
      { ...store, storeId: 14, isServes: false },
      { ...store, storeId: 15, isExist: false },
    ],
  },
};
const campaigns = {
  success: true,
  carousels: [
    { id: 71, isMulti: true },
    { id: 72, isMulti: true },
    { id: 71, isMulti: true },
    { id: 1, isMulti: false },
  ],
};
const product = {
  id: 1,
  name: "مرزی",
  discountPercent: 40,
  quantity: 1,
  hasQuantity: true,
  okPrice: 600000,
  price: 1000000,
  storeName: "فروشگاه",
  storeId: 11,
  imageUrl: "https://example.test/image",
  storeTypeName: "سوپر",
};
const offers = (products = [product]) => ({
  success: true,
  carousel: { id: 71 },
  entities: [{ storeId: 11, storeName: "فروشگاه", products }],
  totalCount: 9999,
  totalPages: 1,
  hasNextPage: false,
});
function fixture(bodies: unknown[] = [nearby, campaigns, offers(), offers()]) {
  return vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(bodies.shift()));
}
const collect = (
  fetcher: typeof fetch,
  extra: Partial<Parameters<typeof collection>[0]> = {}
) => Effect.runPromise(collection({ ...input, fetcher, ...extra }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("public Okala campaign collection", () => {
  it("uses selected coordinates, repeated serviceable stores, and dynamic unique campaigns without credentials", async () => {
    const fetcher = fixture();
    const result = await collect(fetcher);
    const urls = fetcher.mock.calls.map(([url]) => new URL(String(url)));
    expect(urls.map((u) => u.pathname)).toEqual([
      "/api/opex/v4/stores/nearby",
      "/api/carousel/v4/offers",
      "/api/carousel/v4/offers/multi-store",
      "/api/carousel/v4/offers/multi-store",
    ]);
    for (const u of urls.slice(0, 2)) {
      expect(u.searchParams.get("latitude")).toBe(String(input.latitude));
      expect(u.searchParams.get("longitude")).toBe(String(input.longitude));
    }
    expect(urls[1]!.searchParams.get("pageType")).toBe("HomePage");
    for (const u of urls.slice(1))
      expect(u.searchParams.getAll("StoreIds")).toEqual(["11", "12"]);
    expect(urls.slice(2).map((u) => u.searchParams.get("carouselId"))).toEqual([
      "71",
      "72",
    ]);
    for (const [, init] of fetcher.mock.calls) {
      const headers = new Headers(init?.headers);
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("cookie")).toBe(false);
      expect(Object.fromEntries(headers)).toEqual({
        accept: "application/json",
        origin: "https://www.okala.com",
        source: "okala",
        "ui-version": "2.0",
      });
    }
    expect(result.vendorCount).toBe(2);
    expect(result.deals).toHaveLength(1);
    expect(result.deals[0]).toMatchObject({
      key: "11:1",
      priceRials: 1000000,
      finalPriceRials: 600000,
      discountRials: 400000,
      stock: 1,
      image: product.imageUrl,
      categoryTitle: "سوپر",
    });
  });
  it("preserves threshold boundaries, stock, store/product identity, and cross-campaign deduplication", async () => {
    const fetcher = fixture([
      nearby,
      campaigns,
      offers([
        { ...product, id: 2, discountPercent: 39 },
        { ...product, id: 3, hasQuantity: false },
        { ...product, id: 4, quantity: 0 },
        { ...product, id: 5, quantity: -1 },
        product,
      ]),
      offers([
        product,
        { ...product, storeId: 12 },
        { ...product, id: 6, discountPercent: 45 },
      ]),
    ]);
    const result = await collect(fetcher);
    expect(result.deals.map((d) => d.key)).toEqual(["11:1", "12:1", "11:6"]);
    expect(result.productCount).toBe(8);
    expect((await collect(fixture(), { threshold: 41 })).deals).toEqual([]);
    expect(
      (
        await collect(
          fixture([
            nearby,
            campaigns,
            offers([{ ...product, discountPercent: 30 }]),
            offers([]),
          ]),
          { threshold: 30 }
        )
      ).deals
    ).toHaveLength(1);
  });
  it.each([401, 403])(
    "reports HTTP %s as upstream public access failure without retry or login advice",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status }));
      await expect(collect(fetcher)).rejects.toMatchObject({
        code: "UPSTREAM_FORBIDDEN",
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  );
  it.each([
    [{ success: false }, "UPSTREAM_ERROR", 1],
    [{ success: true, data: {} }, "UPSTREAM_CHANGED", 1],
    [null, "UPSTREAM_CHANGED", 1],
  ])(
    "distinguishes rejected and malformed store discovery",
    async (body, code, calls) => {
      const fetcher = fixture([body]);
      await expect(collect(fetcher)).rejects.toMatchObject({ code });
      expect(fetcher).toHaveBeenCalledTimes(calls);
    }
  );
  it.each([
    { success: false },
    { success: true, hasValidationError: true, carousels: [] },
    { success: true, carousels: [{ isMulti: true, id: -1 }] },
    { success: true, carousels: [{ isMulti: true, id: 1.5 }] },
    { success: true, carousels: [{ isMulti: true, id: "71" }] },
    { success: true, carousels: [{ isMulti: true }] },
    { success: true, data: { carousels: [] } },
  ])(
    "rejects malformed or failed public campaign discovery: %j",
    async (body) => {
      const fetcher = fixture([nearby, body]);
      await expect(collect(fetcher)).rejects.toMatchObject({
        code:
          body.success === false || "hasValidationError" in body
            ? "UPSTREAM_ERROR"
            : "UPSTREAM_CHANGED",
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  );
  it.each([
    [{ success: true, data: { stores: [] } }, "NO_STORES", 1],
    [nearby, "NO_CAMPAIGNS", 2],
  ])(
    "keeps deliberate no-store/no-campaign outcomes distinct",
    async (body, code, calls) => {
      const fetcher = fixture([body, { success: true, carousels: [] }]);
      await expect(collect(fetcher)).rejects.toMatchObject({ code });
      expect(fetcher).toHaveBeenCalledTimes(calls);
    }
  );
  it.each([false, true])(
    "rejects indicated additional pages (campaigns=%s) without guessing a pagination contract",
    async (discovery) => {
      const fetcher = fixture(
        discovery
          ? [nearby, { ...campaigns, hasNextPage: true }]
          : [nearby, campaigns, { ...offers(), totalPages: 2 }]
      );
      await expect(collect(fetcher)).rejects.toMatchObject({
        code: "INCOMPLETE_PAGINATION",
      });
    }
  );
  it("fails on a later campaign instead of returning an earlier partial result", async () => {
    await expect(
      collect(fixture([nearby, campaigns, offers(), { success: false }]))
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
    await expect(
      collect(fixture([nearby, campaigns, { entities: [{}] }]))
    ).rejects.toMatchObject({ code: "UPSTREAM_CHANGED" });
  });
  it("awaits progress before the next campaign request", async () => {
    const fetcher = fixture();
    const onProgress = vi.fn(() =>
      Effect.sync(() => {
        expect(fetcher.mock.calls.length).toBe(
          onProgress.mock.calls.length + 2
        );
      })
    );
    await collect(fetcher, { onProgress });
    expect(onProgress.mock.calls).toEqual([
      [{ vendorCount: 1, productCount: 1 }],
      [{ vendorCount: 2, productCount: 2 }],
    ]);
  });
  it("retries only the failed campaign read with bounded backoff", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(nearby))
      .mockResolvedValueOnce(Response.json(campaigns))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json(offers()))
      .mockResolvedValueOnce(Response.json(offers()));
    const running = collect(fetcher);
    await vi.advanceTimersByTimeAsync(1000);
    await running;
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(fetcher.mock.calls[2]?.[0]).toBe(fetcher.mock.calls[3]?.[0]);
  });
  it("preserves invalid JSON and rate-limit failure codes", async () => {
    await expect(
      collect(vi.fn<typeof fetch>().mockResolvedValue(new Response("invalid")))
    ).rejects.toMatchObject({ code: "UPSTREAM_INVALID_JSON" });
    await expect(
      collect(
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response(null, { status: 429, headers: { "retry-after": "6" } })
          )
      )
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
  it("aborts the real public fetch on interruption", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      });
    const running = Effect.runPromise(
      collection({ ...input, fetcher }).pipe(
        Effect.timeoutOrElse({
          duration: 10,
          orElse: () => Effect.fail(new Error("cancelled")),
        })
      )
    ).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10);
    await running;
    expect(signal?.aborted).toBe(true);
  });
});
