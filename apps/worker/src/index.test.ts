import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  createAuth: () => ({
    api: { getSession: async () => ({ user: { id: "user-1" } }) },
    handler: () => new Response(null, { status: 404 }),
  }),
}));

import { api } from "./index";

const env = {
  BOX_KEY: "box-key",
  BETTER_AUTH_SECRET: "auth-secret",
  OKALA_CLIENT_SECRET: "okala-secret",
  APP_ORIGIN: "http://localhost",
  ASSETS: {} as Fetcher,
  DB: {
    prepare: (sql: string) => ({
      bind: () => ({
        first: async () =>
          /FROM locations/i.test(sql)
            ? {
                id: "00000000-0000-4000-8000-000000000001",
                user_id: "user-1",
                name: "My location",
                latitude: 35.7,
                longitude: 51.4,
                is_default: 1,
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-01T00:00:00.000Z",
              }
            : null,
      }),
    }),
    batch: async () => [],
  },
} as unknown as Env;

describe("Worker API provider policy", () => {
  it("serves minimal liveness without a session or D1 read", async () => {
    const response = await api.fetch(
      new Request("http://localhost/healthz"),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects a missing or oversized address query before contacting a geocoder", async () => {
    const response = await api.fetch(
      new Request("http://localhost/api/locations/search?q=x"),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "INVALID_SEARCH_QUERY",
    });
  });

  it("returns a stable unavailable response when no geocoder is configured", async () => {
    const response = await api.fetch(
      new Request("http://localhost/api/locations/search?q=میدان%20ونک"),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "GEOCODER_UNAVAILABLE",
    });
  });

  it("filters geocoder results outside the supported Tehran boundary", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            lat: "35.757",
            lon: "51.41",
            display_name: "میدان ونک، تهران",
          },
          {
            lat: "36.26",
            lon: "59.61",
            display_name: "مشهد",
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    try {
      const response = await api.fetch(
        new Request("http://localhost/api/locations/search?q=میدان%20ونک"),
        { ...env, GEOCODER_BASE_URL: "https://geocoder.example.test/search" },
        {} as ExecutionContext,
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        data: [
          {
            latitude: 35.757,
            longitude: 51.41,
            displayName: "میدان ونک، تهران",
          },
        ],
      });
      const request = fetchSpy.mock.calls[0]?.[0];
      expect(request).toBeInstanceOf(URL);
      expect((request as URL).searchParams.get("bounded")).toBe("1");
      expect((request as URL).searchParams.get("limit")).toBe("5");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("rejects new Digikala Jet scans while keeping the historical routes separate", async () => {
    const response = await api.fetch(
      new Request("http://localhost/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId: "00000000-0000-4000-8000-000000000001",
          source: "digikalajet",
          threshold: 40,
          mode: "partial",
        }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "PROVIDER_UNAVAILABLE",
    });
  });

  it("rejects an outside-Tehran location at the API boundary", async () => {
    const response = await api.fetch(
      new Request("http://localhost/api/locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Outside",
          latitude: 36,
          longitude: 51.4,
        }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: "OUTSIDE_TEHRAN",
    });
  });

  it("validates merged PATCH coordinates before writing", async () => {
    const response = await api.fetch(
      new Request(
        "http://localhost/api/locations/00000000-0000-4000-8000-000000000001",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ latitude: 36 }),
        },
      ),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: "OUTSIDE_TEHRAN",
    });
  });

  it("rejects a scan for an existing location that is now outside Tehran", async () => {
    const response = await api.fetch(
      new Request("http://localhost/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId: "00000000-0000-4000-8000-000000000001",
          source: "snappmarket",
          threshold: 40,
          mode: "partial",
        }),
      }),
      {
        ...env,
        DB: {
          ...env.DB,
          prepare: (sql: string) => ({
            bind: () => ({
              first: async () =>
                /FROM locations/i.test(sql)
                  ? {
                      id: "00000000-0000-4000-8000-000000000001",
                      user_id: "user-1",
                      name: "Outside",
                      latitude: 36,
                      longitude: 51.4,
                      is_default: 1,
                      created_at: "2026-01-01T00:00:00.000Z",
                      updated_at: "2026-01-01T00:00:00.000Z",
                    }
                  : null,
            }),
          }),
        },
      } as typeof env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: "OUTSIDE_TEHRAN",
    });
  });

  it("serves grouped products as a read projection without changing raw deal rows", async () => {
    const scanRow = {
      id: "scan-group",
      user_id: "user-1",
      location_id: "00000000-0000-4000-8000-000000000001",
      location_name: "My location",
      threshold: 40,
      source: "snappmarket",
      mode: "partial",
      status: "succeeded",
      started_at: "2026-01-01T00:00:00.000Z",
      finished_at: "2026-01-01T00:01:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      vendor_count: 2,
      product_count: 2,
      deal_count: 2,
      error_code: null,
      error_message: null,
    };
    const rawDeal = {
      deal_key: "vendor-1:product-1",
      scan_id: "scan-group",
      product_variation_id: "product-1",
      vendor_id: "vendor-1",
      title: "ماست کم چرب",
      image: "https://cdn.example.test/maast.jpg",
      vendor_title: "فروشگاه یک",
      vendor_code: null,
      category_title: "لبنیات",
      price_rials: 100_000,
      discount_rials: 20_000,
      final_price_rials: 80_000,
      discount_ratio: 20,
      stock: 1,
    };
    const rawDeals = [
      rawDeal,
      {
        ...rawDeal,
      deal_key: "vendor-2:product-1",
      vendor_id: "vendor-2",
      vendor_title: "فروشگاه دو",
      stock: 8,
      },
    ];
    const groupedDb = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async <T>() => {
            if (/FROM scans s JOIN locations/i.test(sql)) return scanRow as T;
            if (/SELECT s\.id FROM scans/i.test(sql)) return null;
            return null;
          },
          all: async <T>() => ({
            results: (/FROM deals/i.test(sql) ? rawDeals : []) as T[],
          }),
          run: async () => ({ meta: { changes: 0 } }),
        }),
      }),
      batch: async () => [],
    } as unknown as D1Database;
    const response = await api.fetch(
      new Request("http://localhost/api/scans/scan-group/deal-groups"),
      { ...env, DB: groupedDb },
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{ vendors: Array<{ vendorTitle: string; finalPriceRials: number }> }>;
      meta: { groupedProductCount: number; offerCount: number };
    };
    expect(body.meta).toEqual({
      groupKeyVersion: 1,
      groupedProductCount: 1,
      offerCount: 2,
    });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.vendors).toHaveLength(2);
    expect(body.data[0]?.vendors).toContainEqual(expect.objectContaining({
      vendorTitle: "فروشگاه یک",
      finalPriceRials: 80_000,
    }));
  });
});
