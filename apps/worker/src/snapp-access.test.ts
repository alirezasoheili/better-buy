import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signedIn: true }));
vi.mock("./auth", () => ({
  createAuth: () => ({
    api: {
      getSession: async () =>
        auth.signedIn ? { user: { id: "user-1" } } : null,
    },
  }),
}));
import { api } from "./index";
import { Store } from "./store";

const locationId = "00000000-0000-4000-8000-000000000001";
const migrations = readdirSync(new URL("../migrations/", import.meta.url))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migration = (name: string) =>
  readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8");
const databases: DatabaseSync[] = [];

// Real SQLite in memory, exposed through the D1 methods used by Store.
// Auth sessions and upstream responses are fixtures; no remote DB is accessed.
function database() {
  const sqlite = new DatabaseSync(":memory:");
  databases.push(sqlite);
  for (const name of migrations.filter((name) => !name.startsWith("0005")))
    sqlite.exec(migration(name));
  sqlite
    .prepare(
      "INSERT INTO locations(id,user_id,name,latitude,longitude,is_default,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)"
    )
    .run(
      locationId,
      "user-1",
      "خانه",
      35.7,
      51.4,
      1,
      "2026-01-01",
      "2026-01-01"
    );
  const reads: string[] = [];
  let pendingBatch: Promise<unknown> = Promise.resolve();
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: SQLInputValue[]) => ({
        first: async () => {
          reads.push(sql);
          return sqlite.prepare(sql).get(...args) ?? null;
        },
        all: async () => {
          reads.push(sql);
          return { results: sqlite.prepare(sql).all(...args) };
        },
        run: async () => ({ meta: sqlite.prepare(sql).run(...args) }),
      }),
    }),
    batch: (statements: Array<{ run: () => Promise<unknown> }>) => {
      const runBatch = async () => {
        sqlite.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements)
            results.push(await statement.run());
          sqlite.exec("COMMIT");
          return results;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      };
      const result = pendingBatch.then(runBatch);
      pendingBatch = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  } as unknown as D1Database;
  const env = {
    DB: db,
    BOX_KEY: "box-key",
    BETTER_AUTH_SECRET: "auth-secret",
    APP_ORIGIN: "http://localhost",
    ASSETS: {} as Fetcher,
  };
  return { sqlite, db, env, reads };
}

async function start(
  env: ReturnType<typeof database>["env"] & {
    SNAPP_STORE_CAMPAIGNS_ENABLED?: string;
  },
  source = "snappmarket",
  id = locationId,
  threshold = 40
) {
  const tasks: Promise<unknown>[] = [];
  const response = await api.fetch(
    new Request("http://localhost/api/scans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locationId: id, source, threshold }),
    }),
    env,
    {
      waitUntil: (task: Promise<unknown>) => {
        tasks.push(task);
      },
    } as unknown as ExecutionContext
  );
  await Promise.all(tasks);
  return response;
}

function mockOkala(failLastCampaign = false) {
  const product = {
    id: 1,
    name: "کالا",
    discountPercent: 40,
    quantity: 2,
    hasQuantity: true,
    price: 100000,
    okPrice: 60000,
    storeId: 10,
    storeName: "فروشگاه",
  };
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/nearby"))
      return Response.json({
        success: true,
        data: {
          stores: [
            { storeId: 10, isActive: true, isServes: true, isExist: true },
          ],
        },
      });
    if (u.pathname.endsWith("/multi-store")) {
      if (failLastCampaign && u.searchParams.get("carouselId") === "8")
        return new Response(null, { status: 403 });
      return Response.json({
        success: true,
        carousel: { id: 7 },
        entities: [{ storeId: 10, storeName: "فروشگاه", products: [product] }],
      });
    }
    if (u.pathname === "/api/carousel/v4/offers")
      return Response.json({
        success: true,
        carousels: [
          { id: 7, isMulti: true },
          ...(failLastCampaign ? [{ id: 8, isMulti: true }] : []),
        ],
      });
    throw new Error("Unexpected public Okala path: " + u.pathname);
  });
}

const feed = () =>
  Response.json({
    status: true,
    data: {
      total_count: 1,
      vendors: [
        {
          vendor_id: 10,
          products: [
            {
              productVariationId: 1,
              price: 100000,
              discount: 40000,
              discountRatio: 40,
              title: "کالا",
              vendorId: 10,
              vendorTitle: "فروشگاه",
              stock: 2,
            },
          ],
        },
      ],
    },
  });
const guest = () =>
  Response.json({
    status: true,
    data: { access_token: "guest-token-fixture", expires_in: 3600 },
  });

afterEach(() => {
  auth.signedIn = true;
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) db.close();
});

describe("Snapp access through authenticated scan API", () => {
  function campaignFeed() {
    let failTerminal = false;
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/token")) return guest();
        if (url.pathname.startsWith("/market-party/")) return feed();
        if (url.pathname === "/express-vendor/general/vendors-list")
          return Response.json({
            status: true,
            data: {
              count: 1,
              finalResult: [{ type: "VENDOR", data: { code: "pz91qe" } }],
            },
          });
        if (url.pathname.startsWith("/express-home/"))
          return Response.json({
            vendorInfo: {
              id: 114458,
              code: "pz91qe",
              title: "Campaign store",
              deliveryData: {
                doesDeliver: true,
                id: 114458,
                detail: { vendorId: 114458 },
              },
            },
            sections: url.pathname.endsWith("/pz91qe")
              ? [
                  {
                    type: "product-list",
                    value: 901,
                    title: "اسمارت بازار",
                    collection_type: "default",
                    config: null,
                  },
                ]
              : [],
          });
        expect(url.pathname).toBe(
          "/express-search/product-list/901/vendor/pz91qe"
        );
        const page = Number(url.searchParams.get("page"));
        if (page && failTerminal) return new Response(null, { status: 403 });
        return Response.json({
          status: true,
          data: {
            id: 901,
            type: "default",
            count: 1,
            finalResult: page
              ? []
              : [
                  {
                    type: "PRODUCT",
                    data: {
                      id: 2,
                      vendor_id: 114458,
                      document_id: "2-114458",
                      title: "Campaign product",
                      stock: 3,
                      price: 100000,
                      discount: 45000,
                      discountRatio: 45,
                    },
                  },
                ],
          },
        });
      });
    return {
      upstream,
      fail: () => {
        failTerminal = true;
      },
    };
  }
  it("publishes enrichment through the same saved products API with a frozen server manifest", async () => {
    const { env } = database();
    const enabled = { ...env, SNAPP_STORE_CAMPAIGNS_ENABLED: "true" };
    const f = campaignFeed();
    const response = await start(enabled);
    const body = (await response.json()) as { data: { id: string } };
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    expect(await store.scan(body.data.id)).toMatchObject({
      status: "succeeded",
      dealCount: 2,
      vendorCount: 2,
      productCount: 2,
      context: {
        coverage: "complete",
        effectiveThreshold: 40,
        manifest: {
          feedKinds: ["market_party", "store_campaign"],
          collectionIds: [901],
          storeIds: [114458],
          storeCampaigns: [
            { vendorId: 114458, vendorCode: "pz91qe", collectionId: 901 },
          ],
        },
      },
    });
    const callsBeforeRead = f.upstream.mock.calls.length;
    const products = await api.fetch(
      new Request(`http://localhost/api/scans/${body.data.id}/products`),
      enabled,
      {} as ExecutionContext
    );
    const saved = (await products.json()) as {
      data: { vendors: { provenance?: string[] }[] }[];
    };
    expect(saved.data).toHaveLength(2);
    expect(
      saved.data
        .flatMap((product) => product.vendors)
        .map((offer) => offer.provenance)
    ).toContainEqual(["snapp:store_campaign:114458:901"]);
    expect(f.upstream.mock.calls).toHaveLength(callsBeforeRead);
  });
  it("keeps admitted failed enrichment incomplete and preserves the prior successful feed", async () => {
    const { env, sqlite } = database();
    const enabled = { ...env, SNAPP_STORE_CAMPAIGNS_ENABLED: "true" };
    const f = campaignFeed();
    const first = await start(enabled);
    const body = (await first.json()) as { data: { id: string } };
    f.fail();
    const next = await start(enabled);
    const nextBody = (await next.json()) as { data: { id: string } };
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    expect(await store.scan(nextBody.data.id)).toMatchObject({
      status: "failed",
      errorCode: "UPSTREAM_FORBIDDEN",
      context: { coverage: "incomplete", manifest: { collectionIds: [901] } },
    });
    expect(
      sqlite
        .prepare("SELECT COUNT(*) total FROM deals WHERE scan_id=?")
        .get(nextBody.data.id)
    ).toEqual({ total: 0 });
    expect(await store.scan(body.data.id)).toMatchObject({
      status: "succeeded",
      dealCount: 2,
    });
    expect(await store.deals(body.data.id)).toHaveLength(2);
    const unpublished = await api.fetch(
      new Request(`http://localhost/api/scans/${nextBody.data.id}/products`),
      enabled,
      {} as ExecutionContext
    );
    expect(unpublished.status).toBe(409);
  });
  it("rolls back collection with the server flag while retaining enriched history", async () => {
    const { env } = database();
    const f = campaignFeed();
    const first = await start({
      ...env,
      SNAPP_STORE_CAMPAIGNS_ENABLED: "true",
    });
    const enriched = (await first.json()) as { data: { id: string } };
    const callsBeforeRollback = f.upstream.mock.calls.length;
    const rolledBack = await start({
      ...env,
      SNAPP_STORE_CAMPAIGNS_ENABLED: "false",
    });
    const baseline = (await rolledBack.json()) as { data: { id: string } };
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    expect(await store.scan(baseline.data.id)).toMatchObject({
      dealCount: 1,
      context: { manifest: { feedKinds: ["market_party"] } },
    });
    const prior = await store.scan(enriched.data.id);
    const current = await store.scan(baseline.data.id);
    expect(current?.context?.scopeHash).not.toBe(prior?.context?.scopeHash);
    expect(
      (await store.deals(baseline.data.id)).every(
        (row) => row.state === "current"
      )
    ).toBe(true);
    expect(
      f.upstream.mock.calls
        .slice(callsBeforeRollback)
        .map(([url]) => new URL(String(url)).pathname)
    ).toEqual(["/oauth2/default/token", "/market-party/35.7/51.4"]);
    expect(await store.deals(enriched.data.id)).toHaveLength(2);
  });
  it("keeps gated campaign selectors out of the automatic manifest and saved feed", async () => {
    const { env } = database();
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = new URL(String(input));
        expect(url.origin).toBe("https://svc.snapp.market");
        if (url.pathname === "/oauth2/default/token") return guest();
        if (url.pathname === "/market-party/35.7/51.4") return feed();
        throw new Error("Gated upstream path requested: " + url.pathname);
      });
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    const contexts: unknown[] = [];
    for (const selectors of [
      {},
      {
        collectionIds: [21166],
        campaignId: 21166,
        categoryId: 731217,
        upstreamUrl: "https://untrusted.example/campaign",
        manifest: {
          adapter: "snapp-campaign",
          feedKinds: ["campaign"],
          collectionIds: [21166],
        },
      },
    ]) {
      const tasks: Promise<unknown>[] = [];
      const response = await api.fetch(
        new Request("http://localhost/api/scans", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            locationId,
            source: "snappmarket",
            threshold: 40,
            ...selectors,
          }),
        }),
        env,
        {
          waitUntil: (task: Promise<unknown>) => tasks.push(task),
        } as unknown as ExecutionContext
      );
      expect(response.status).toBe(202);
      await Promise.all(tasks);
      const body = (await response.json()) as { data: { id: string } };
      const saved = await store.scan(body.data.id);
      expect(saved).toMatchObject({
        status: "succeeded",
        dealCount: 1,
        context: {
          coverage: "complete",
          manifest: {
            adapter: "snapp-market-party",
            contractVersion: 1,
            feedKinds: ["market_party"],
          },
        },
      });
      contexts.push(saved?.context);
      const callsBeforeRead = fetcher.mock.calls.length;
      const products = await api.fetch(
        new Request(
          `http://localhost/api/scans/${body.data.id}/products?collectionId=21166`
        ),
        env,
        {} as ExecutionContext
      );
      expect(products.status).toBe(200);
      expect(await products.json()).toMatchObject({
        data: [
          {
            bestCurrentOffer: { finalPriceRials: 60000, stock: 2 },
            vendors: [{ vendorId: "10" }],
          },
        ],
        meta: { groupKeyVersion: 2 },
      });
      expect(fetcher.mock.calls).toHaveLength(callsBeforeRead);
    }
    expect(contexts[1]).toEqual(contexts[0]);
    expect(
      fetcher.mock.calls.map(([input]) => new URL(String(input)).pathname)
    ).toEqual([
      "/oauth2/default/token",
      "/market-party/35.7/51.4",
      "/oauth2/default/token",
      "/market-party/35.7/51.4",
    ]);
  });

  it.each(["missing", "expired", "corrupt"])(
    "succeeds with %s legacy Snapp settings and never reads them",
    async (legacy) => {
      const { sqlite, env, reads } = database();
      if (legacy !== "missing")
        sqlite
          .prepare(
            "INSERT INTO provider_settings(user_id,provider,encrypted_token,token_expires_at,updated_at) VALUES(?,?,?,?,?)"
          )
          .run(
            "user-1",
            "snappmarket",
            "corrupt-ciphertext",
            legacy === "expired" ? "2000-01-01" : null,
            "2000-01-01"
          );
      const fetcher = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url) =>
          String(url).includes("/oauth2/default/token") ? guest() : feed()
        );
      const response = await start(env);
      expect(response.status).toBe(202);
      const body = (await response.json()) as { data: { id: string } };
      const store = new Store(env.DB, "user-1", env.BOX_KEY);
      expect(await store.scan(body.data.id)).toMatchObject({
        status: "succeeded",
        vendorCount: 1,
        productCount: 1,
        dealCount: 1,
      });
      expect(await store.deals(body.data.id)).toHaveLength(1);
      expect(reads.some((sql) => sql.includes("provider_settings"))).toBe(
        false
      );
      expect(
        fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)
      ).toEqual(["/oauth2/default/token", "/market-party/35.7/51.4"]);
      expect(
        sqlite.prepare("SELECT COUNT(*) AS c FROM provider_settings").get()?.c
      ).toBe(legacy === "missing" ? 0 : 1);
      expect(JSON.stringify(body)).not.toContain("guest-token-fixture");
    }
  );

  it.each(["guest", "feed", "incomplete"])(
    "records a failed %s request without changing the last successful scan/deals",
    async (failure) => {
      const { sqlite, env } = database();
      const store = new Store(env.DB, "user-1", env.BOX_KEY);
      const previous = await store.createScan(
        locationId,
        40,
        "snappmarket",
        "partial"
      );
      await store.succeed(previous, { vendorCount: 0, productCount: 0 }, [
        {
          key: "10:1",
          productVariationId: "1",
          vendorId: "10",
          title: "کالا",
          image: null,
          vendorTitle: "فروشگاه",
          vendorCode: null,
          categoryTitle: null,
          priceRials: 100000,
          discountRials: 40000,
          finalPriceRials: 60000,
          discountRatio: 40,
          stock: 2,
        },
      ]);
      const before = sqlite.prepare("SELECT * FROM deals").all();
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("/oauth2/default/token"))
          return failure === "guest"
            ? new Response(null, { status: 403 })
            : guest();
        return failure === "incomplete"
          ? Response.json({
              status: true,
              data: { total_count: 1, vendors: [] },
            })
          : new Response("invalid JSON fixture");
      });
      const response = await start(env);
      expect(response.status).toBe(202);
      const body = (await response.json()) as { data: { id: string } };
      expect(await store.scan(body.data.id)).toMatchObject({
        status: "failed",
        dealCount: 0,
        errorCode:
          failure === "incomplete"
            ? "INCOMPLETE_PAGINATION"
            : failure === "guest"
              ? "UPSTREAM_FORBIDDEN"
              : "UPSTREAM_INVALID_JSON",
      });
      expect(await store.scan(previous)).toMatchObject({
        status: "succeeded",
        dealCount: 1,
      });
      expect(sqlite.prepare("SELECT * FROM deals").all()).toEqual(before);
    }
  );

  it.each([
    ["POST", "/otp"],
    ["POST", "/login"],
    ["PUT", ""],
    ["GET", ""],
  ])("removes Snapp customer settings route %s %s", async (method, suffix) => {
    const { env } = database();
    const fetcher = vi.spyOn(globalThis, "fetch");
    const response = await api.fetch(
      new Request("http://localhost/api/settings/snappmarket" + suffix, {
        method,
      }),
      env,
      {} as ExecutionContext
    );
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("starts Okala with no settings and never reads credentials", async () => {
    const { env, reads } = database();
    mockOkala();
    const response = await start(env, "okala");
    expect(response.status).toBe(202);
    const body = (await response.json()) as { data: { id: string } };
    expect(
      await new Store(env.DB, "user-1", env.BOX_KEY).scan(body.data.id)
    ).toMatchObject({ status: "succeeded", dealCount: 1 });
    expect(reads.some((sql) => /provider_settings/.test(sql))).toBe(false);
  });

  it("ignores expired legacy Okala credentials without refreshing or changing them", async () => {
    const { env, sqlite, reads } = database();
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    await store.saveProvider("okala", "expired-access-token", {
      refreshToken: "refresh-fixture",
      expiresAt: "2000-01-01",
    });
    const before = sqlite.prepare("SELECT * FROM provider_settings").all();
    reads.length = 0;
    const fetcher = mockOkala();
    expect((await start(env, "okala")).status).toBe(202);
    expect(sqlite.prepare("SELECT status FROM scans").get()?.status).toBe(
      "succeeded"
    );
    expect(sqlite.prepare("SELECT * FROM provider_settings").all()).toEqual(
      before
    );
    expect(reads.some((sql) => /provider_settings/.test(sql))).toBe(false);
    expect(
      fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)
    ).toEqual([
      "/api/opex/v4/stores/nearby",
      "/api/carousel/v4/offers",
      "/api/carousel/v4/offers/multi-store",
    ]);
  });

  it.each(["snappmarket", "okala"])(
    "enforces Better Buy sign-in before %s scans or reading provider settings",
    async (source) => {
      const { env, sqlite } = database();
      auth.signedIn = false;
      const fetcher = vi.spyOn(globalThis, "fetch");
      expect((await start(env, source)).status).toBe(401);
      expect(
        (
          await api.fetch(
            new Request("http://localhost/api/settings/okala"),
            env,
            {} as ExecutionContext
          )
        ).status
      ).toBe(401);
      expect(sqlite.prepare("SELECT COUNT(*) AS c FROM scans").get()?.c).toBe(
        0
      );
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it.each(["snappmarket", "okala"])(
    "cannot scan another tenant's location with %s",
    async (source) => {
      const { env, sqlite } = database();
      sqlite.prepare("UPDATE locations SET user_id='user-2'").run();
      expect((await start(env, source)).status).toBe(404);
      expect(sqlite.prepare("SELECT COUNT(*) AS c FROM scans").get()?.c).toBe(
        0
      );
    }
  );

  it.each(["snappmarket", "okala"])(
    "preserves active scan exclusivity for credential-free %s",
    async (source) => {
      const { env } = database();
      await new Store(env.DB, "user-1", env.BOX_KEY).createScan(
        locationId,
        40,
        "snappmarket",
        "partial"
      );
      const response = await start(env, source);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: "SCAN_IN_PROGRESS",
      });
    }
  );
});

describe("scan state integrity through real SQLite", () => {
  it("adds context without rewriting legacy history, units or raw money", () => {
    const sqlite = new DatabaseSync(":memory:");
    databases.push(sqlite);
    for (const name of migrations.filter((name) => !name.startsWith("0006")))
      sqlite.exec(migration(name));
    sqlite.exec(
      "INSERT INTO locations(id,user_id,name,latitude,longitude,created_at,updated_at) VALUES('l','u','Original',35.7,51.4,'2026-01-01','2026-01-01'); INSERT INTO scans(id,user_id,location_id,threshold,source,mode,status,created_at) VALUES('s','u','l',40,'digikalajet','full','succeeded','2026-01-01'); INSERT INTO deals(id,scan_id,deal_key,product_variation_id,vendor_id,title,vendor_title,price_rials,discount_rials,final_price_rials,discount_ratio,stock) VALUES('d','s','v:p','p','v','Legacy','Store',500000,200000,300000,40,2)"
    );
    sqlite.exec(migration(migrations.find((name) => name.startsWith("0006"))!));
    expect(
      sqlite.prepare("SELECT context_json FROM scans WHERE id='s'").get()
        ?.context_json
    ).toBeNull();
    expect(
      sqlite
        .prepare("SELECT coordinate_revision FROM locations WHERE id='l'")
        .get()?.coordinate_revision
    ).toBe(1);
    expect(
      sqlite
        .prepare(
          "SELECT title,final_price_rials,facts_json FROM deals WHERE id='d'"
        )
        .get()
    ).toMatchObject({
      title: "Legacy",
      final_price_rials: 300000,
      facts_json: null,
    });
  });
  it("serves v2 differing-price products while retaining v1 and raw reads", async () => {
    const { env } = database();
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    const id = await store.createScan(locationId, 40, "snappmarket", "partial");
    const get = (suffix: string) =>
      api.fetch(
        new Request(`http://localhost/api/scans/${id}/${suffix}`),
        env,
        {} as ExecutionContext
      );
    expect((await get("products")).status).toBe(409);
    const offer = {
      key: "a:p",
      productVariationId: "p",
      vendorId: "a",
      vendorTitle: "Store A",
      vendorCode: null,
      title: "کالا ۵۰۰ گرم",
      image: null,
      categoryTitle: null,
      priceRials: 100000,
      discountRials: 40000,
      finalPriceRials: 60000,
      discountRatio: 40,
      stock: 2,
    };
    await store.succeed(id, { vendorCount: 2, productCount: 2 }, [
      offer,
      {
        ...offer,
        key: "b:p",
        vendorId: "b",
        priceRials: 120000,
        discountRials: 72000,
        finalPriceRials: 48000,
        discountRatio: 60,
      },
    ]);
    const v2 = (await (await get("products")).json()) as {
      data: Array<{
        bestCurrentOffer: { finalPriceRials: number };
        vendors: unknown[];
      }>;
    };
    expect(v2.data).toHaveLength(1);
    expect(v2.data[0]!.vendors).toHaveLength(2);
    expect(v2.data[0]!.bestCurrentOffer.finalPriceRials).toBe(48000);
    const v1 = (await (await get("deal-groups")).json()) as {
      data: Array<{ state: string }>;
    };
    expect(v1.data).toHaveLength(2);
    expect(v1.data.every((group) => group.state === "still_available")).toBe(
      true
    );
    const raw = (await (await get("deals")).json()) as { data: unknown[] };
    expect(raw.data).toHaveLength(2);
  });
  it("returns the same 404 for unknown and cross-tenant status and result reads", async () => {
    const { env } = database();
    const owner = new Store(env.DB, "user-1", env.BOX_KEY);
    const id = await owner.createScan(locationId, 40, "snappmarket", "partial");
    for (const target of ["unknown", id]) {
      if (target === id)
        await env.DB.prepare("UPDATE scans SET user_id=? WHERE id=?")
          .bind("user-2", id)
          .run();
      for (const suffix of ["", "/deals", "/deal-groups", "/products"]) {
        const response = await api.fetch(
          new Request(`http://localhost/api/scans/${target}${suffix}`),
          env,
          {} as ExecutionContext
        );
        expect(response.status).toBe(404);
      }
    }
  });
  it("freezes geographic history, skips incompatible baselines and keeps legacy facts unknown", async () => {
    const { env, sqlite } = database();
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    const offer = {
      key: "1:1",
      productVariationId: "1",
      vendorId: "1",
      title: "کالا",
      image: null,
      vendorTitle: "فروشگاه",
      vendorCode: null,
      categoryTitle: null,
      priceRials: 100000,
      discountRials: 40000,
      finalPriceRials: 60000,
      discountRatio: 40,
      stock: 2,
    };
    let order = 0;
    const snapshot = async (offers = [offer], threshold = 40) => {
      const id = await store.createScan(
        locationId,
        threshold,
        "snappmarket",
        "partial"
      );
      sqlite
        .prepare("UPDATE scans SET created_at=? WHERE id=?")
        .run(`2026-10-10T00:00:0${order++}.000Z`, id);
      await store.succeed(
        id,
        { vendorCount: 1, productCount: offers.length },
        offers
      );
      return id;
    };
    const first = await snapshot();
    expect(await store.deals(first)).toMatchObject([{ state: "current" }]);
    await store.updateLocation(locationId, { name: "نام تازه" });
    expect((await store.location(locationId))?.coordinateRevision).toBe(1);
    expect((await store.scan(first))?.locationName).toBe("خانه");
    const second = await snapshot([]);
    expect(await store.deals(second)).toMatchObject([
      { state: "no_longer_present" },
    ]);
    await store.updateLocation(locationId, { latitude: 35.71 });
    expect((await store.location(locationId))?.coordinateRevision).toBe(2);
    expect(await store.deals(await snapshot([]))).toEqual([]);
    expect(await store.deals(await snapshot([offer], 50))).toMatchObject([
      { state: "current" },
    ]);
    const changedScope = await snapshot([]);
    sqlite
      .prepare(
        "UPDATE scans SET context_json=json_set(context_json,'$.scopeHash','different') WHERE id=?"
      )
      .run(changedScope);
    expect(await store.deals(changedScope)).toEqual([]);
    sqlite.prepare("UPDATE scans SET context_json=NULL WHERE id=?").run(first);
    expect((await store.scan(first))?.context).toBeNull();
    expect(await store.deals(first)).toMatchObject([{ state: "current" }]);
  });
  it("persists and compares Okala API requests at one effective threshold without rewriting history", async () => {
    const { env } = database();
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    const legacy = await store.createScan(locationId, 20, "okala", "partial");
    await store.succeed(legacy, { vendorCount: 0, productCount: 0 }, []);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/nearby"))
        return Response.json({
          success: true,
          data: {
            stores: [10, 11].map((storeId) => ({
              storeId,
              isActive: true,
              isServes: true,
              isExist: true,
            })),
          },
        });
      if (path.endsWith("/multi-store"))
        return Response.json({
          success: true,
          entities: [
            {
              storeId: 10,
              storeName: "فروشگاه",
              products: [25, 29, 30].map((n) => ({
                id: n,
                name: "کالا",
                discountPercent: n,
                quantity: 2,
                hasQuantity: true,
                price: 100000,
                okPrice: 100000 - n * 1000,
                storeId: 10,
                storeName: "فروشگاه",
              })),
            },
            { storeId: 11, storeName: "بدون پیشنهاد", products: [] },
          ],
        });
      return Response.json({
        success: true,
        carousels: [
          { id: 7, isMulti: true },
          { id: 8, isMulti: true },
        ],
      });
    });
    const first = await start(env, "okala", locationId, 20);
    expect(first.status).toBe(202);
    const firstRecord = (
      (await first.json()) as {
        data: {
          id: string;
          threshold: number;
          context: { requestedThreshold: number; effectiveThreshold: number };
        };
      }
    ).data;
    expect(firstRecord).toMatchObject({
      threshold: 30,
      context: { requestedThreshold: 20, effectiveThreshold: 30 },
    });
    const firstId = firstRecord.id;
    expect(await store.scan(firstId)).toMatchObject({
      threshold: 30,
      status: "succeeded",
      vendorCount: 2,
      dealCount: 1,
    });
    expect(await store.deals(firstId)).toMatchObject([
      { discountRatio: 30, state: "current" },
    ]);
    const second = await start(env, "okala", locationId, 30);
    const secondId = ((await second.json()) as { data: { id: string } }).data
      .id;
    expect(await store.deals(secondId)).toMatchObject([
      { discountRatio: 30, state: "still_available" },
    ]);
    expect(await store.scan(legacy)).toMatchObject({
      threshold: 20,
      status: "succeeded",
    });
  });
  it("rejects direct reservation of another tenant's location", async () => {
    const { env, sqlite } = database();
    await expect(
      new Store(env.DB, "user-2", env.BOX_KEY).createScan(
        locationId,
        40,
        "snappmarket",
        "partial"
      )
    ).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
    expect(sqlite.prepare("SELECT COUNT(*) AS c FROM scans").get()?.c).toBe(0);
  });
  it("ignores corrupt legacy Okala ciphertext with no credential reads", async () => {
    const { env, sqlite, reads } = database();
    sqlite
      .prepare(
        "INSERT INTO provider_settings(user_id,provider,encrypted_token,updated_at) VALUES(?,?,?,?)"
      )
      .run("user-1", "okala", "bad-ciphertext", "2000-01-01");
    mockOkala();
    expect((await start(env, "okala")).status).toBe(202);
    expect(sqlite.prepare("SELECT status FROM scans").get()?.status).toBe(
      "succeeded"
    );
    expect(reads.some((sql) => /provider_settings/.test(sql))).toBe(false);
    expect(
      sqlite.prepare("SELECT encrypted_token FROM provider_settings").get()
        ?.encrypted_token
    ).toBe("bad-ciphertext");
  });
  it("rolls back all results when persistence fails and preserves the earlier successful snapshot", async () => {
    const { env, sqlite } = database();
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    const previous = await store.createScan(
      locationId,
      40,
      "snappmarket",
      "partial"
    );
    await store.succeed(previous, { vendorCount: 0, productCount: 0 }, []);
    sqlite.exec(
      "CREATE TRIGGER reject_new_deals BEFORE INSERT ON deals BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END"
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).includes("/oauth2/default/token") ? guest() : feed()
    );
    const response = await start(env);
    const body = (await response.json()) as { data: { id: string } };
    expect(await store.scan(body.data.id)).toMatchObject({
      status: "failed",
      errorCode: "PERSISTENCE_ERROR",
      dealCount: 0,
    });
    expect(await store.scan(previous)).toMatchObject({ status: "succeeded" });
    expect(sqlite.prepare("SELECT COUNT(*) AS c FROM deals").get()?.c).toBe(0);
  });
  it("ignores late progress and terminal changes after a scan is complete", async () => {
    const { env } = database();
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    const id = await store.createScan(locationId, 40, "snappmarket", "partial");
    await store.markRunning(id);
    await store.succeed(id, { vendorCount: 3, productCount: 9 }, []);
    await store.progress(id, { vendorCount: 99, productCount: 999 });
    await store.fail(id, "UNKNOWN_ERROR", "late");
    await store.markRunning(id);
    expect(await store.scan(id)).toMatchObject({
      status: "succeeded",
      vendorCount: 3,
      productCount: 9,
      errorCode: null,
    });
  });
  it("cannot write results or progress into another tenant's scan", async () => {
    const { env, sqlite } = database();
    const owner = new Store(env.DB, "user-1", env.BOX_KEY);
    const id = await owner.createScan(locationId, 40, "snappmarket", "partial");
    await owner.markRunning(id);
    const other = new Store(env.DB, "user-2", env.BOX_KEY);
    await other.progress(id, { vendorCount: 50, productCount: 50 });
    await other.succeed(id, { vendorCount: 1, productCount: 1 }, [
      {
        key: "x",
        productVariationId: "x",
        vendorId: "v",
        title: "کالا",
        image: null,
        vendorTitle: "فروشگاه",
        vendorCode: null,
        categoryTitle: null,
        priceRials: 100,
        discountRials: 50,
        finalPriceRials: 50,
        discountRatio: 50,
        stock: 1,
      },
    ]);
    expect(await owner.scan(id)).toMatchObject({
      status: "running",
      vendorCount: 0,
      productCount: 0,
    });
    expect(await other.scan(id)).toBeNull();
    expect(await other.deals(id)).toEqual([]);
    expect(sqlite.prepare("SELECT COUNT(*) AS c FROM deals").get()?.c).toBe(0);
  });
  it("enforces the unique active-scan constraint for simultaneous submissions", async () => {
    const { env, sqlite } = database();
    let release!: (response: Response) => void;
    const guestResponse = new Promise<Response>((resolve) => {
      release = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).includes("/oauth2/default/token") ? guestResponse : feed()
    );
    const tasks: Promise<unknown>[] = [];
    const request = () =>
      api.fetch(
        new Request("http://localhost/api/scans", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locationId }),
        }),
        env,
        {
          waitUntil: (task: Promise<unknown>) => {
            tasks.push(task);
          },
        } as unknown as ExecutionContext
      );
    // Both optimistic checks miss; the real unique index must still arbitrate.
    vi.spyOn(Store.prototype, "activeScan").mockResolvedValue(null);
    const responses = await Promise.all([request(), request()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      202, 409,
    ]);
    expect(sqlite.prepare("SELECT COUNT(*) AS c FROM scans").get()?.c).toBe(1);
    release(guest());
    await Promise.all(tasks);
  });
  it("retains stale-scan reconciliation and never resurrects its terminal state", async () => {
    const { env, sqlite } = database();
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    const id = await store.createScan(locationId, 40, "snappmarket", "partial");
    sqlite
      .prepare("UPDATE scans SET created_at='2000-01-01' WHERE id=?")
      .run(id);
    await store.reconcileStale();
    await store.markRunning(id);
    await store.succeed(id, { vendorCount: 1, productCount: 1 }, []);
    expect(await store.scan(id)).toMatchObject({
      status: "failed",
      errorCode: "INTERRUPTED",
    });
  });
  it("records public Okala rejection as a failed scan without mutating credentials", async () => {
    const { env, sqlite } = database();
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    await store.saveProvider("okala", "old-token", {
      refreshToken: "refresh-fixture",
      expiresAt: "2000-01-01",
    });
    const before = sqlite.prepare("SELECT * FROM provider_settings").all();
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));
    const response = await start(env, "okala");
    expect(response.status).toBe(202);
    const body = (await response.json()) as { data: { id: string } };
    expect(await store.scan(body.data.id)).toMatchObject({
      status: "failed",
      errorCode: "UPSTREAM_FORBIDDEN",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sqlite.prepare("SELECT * FROM provider_settings").all()).toEqual(
      before
    );
  });
});

describe("forward migration for obsolete Snapp credentials", () => {
  it("deletes only Snapp settings across tenants and preserves all other records", async () => {
    const { sqlite, env } = database();
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    sqlite
      .prepare(
        'INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES(?,?,?,?,?)'
      )
      .run("user-1", "User", "user@example.test", "2026-01-01", "2026-01-01");
    sqlite
      .prepare(
        "INSERT INTO account(id,userId,accountId,providerId,createdAt,updatedAt) VALUES(?,?,?,?,?,?)"
      )
      .run(
        "account-1",
        "user-1",
        "google-user",
        "google",
        "2026-01-01",
        "2026-01-01"
      );
    sqlite
      .prepare(
        "INSERT INTO session(id,userId,token,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)"
      )
      .run(
        "session-1",
        "user-1",
        "session-fixture",
        "2099-01-01",
        "2026-01-01",
        "2026-01-01"
      );
    await store.saveProvider("okala", "customer-token-fixture");
    sqlite
      .prepare(
        "INSERT INTO provider_settings(user_id,provider,encrypted_token,updated_at) VALUES(?,?,?,?)"
      )
      .run("user-1", "snappmarket", "old-token", "2000-01-01");
    sqlite
      .prepare(
        "INSERT INTO provider_settings(user_id,provider,encrypted_token,updated_at) VALUES(?,?,?,?)"
      )
      .run("user-2", "snappmarket", "old-token", "2000-01-01");
    sqlite
      .prepare(
        "INSERT INTO provider_settings(user_id,provider,encrypted_token,updated_at) VALUES(?,?,?,?)"
      )
      .run("user-2", "digikalajet", "jet-token", "2000-01-01");
    const scanId = await store.createScan(
      locationId,
      40,
      "snappmarket",
      "partial"
    );
    await store.succeed(scanId, { vendorCount: 1, productCount: 1 }, [
      {
        key: "10:1",
        productVariationId: "1",
        vendorId: "10",
        title: "کالا",
        image: null,
        vendorTitle: "فروشگاه",
        vendorCode: null,
        categoryTitle: null,
        priceRials: 100000,
        discountRials: 40000,
        finalPriceRials: 60000,
        discountRatio: 40,
        stock: 2,
      },
    ]);
    const tables = [
      "user",
      "account",
      "session",
      "locations",
      "scans",
      "deals",
    ];
    const before = tables.map((table) =>
      sqlite.prepare('SELECT * FROM "' + table + '"').all()
    );
    const otherSettings = sqlite
      .prepare(
        "SELECT * FROM provider_settings WHERE provider != 'snappmarket'"
      )
      .all();
    sqlite.exec(migration(migrations.find((name) => name.startsWith("0005"))!));
    expect(
      sqlite
        .prepare("SELECT * FROM provider_settings WHERE provider='snappmarket'")
        .all()
    ).toEqual([]);
    expect(sqlite.prepare("SELECT * FROM provider_settings").all()).toEqual(
      otherSettings
    );
    expect(
      tables.map((table) =>
        sqlite.prepare('SELECT * FROM "' + table + '"').all()
      )
    ).toEqual(before);
  });
});

describe("anonymous Okala API regressions", () => {
  it.each([
    ["PUT", "/api/settings/okala"],
    ["POST", "/api/settings/okala/otp"],
    ["POST", "/api/settings/okala/login"],
    ["POST", "/api/settings/okala/refresh"],
  ])("removes %s %s for authenticated callers", async (method, path) => {
    const { env, sqlite } = database();
    const fetcher = vi.spyOn(globalThis, "fetch");
    const response = await api.fetch(
      new Request("http://localhost" + path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: "legacy-token",
          mobile: "09120000000",
          otp: "12345",
        }),
      }),
      env,
      {} as ExecutionContext
    );
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      sqlite.prepare("SELECT COUNT(*) AS c FROM provider_settings").get()?.c
    ).toBe(0);
  });
  it("returns capability information without credential semantics or settings reads", async () => {
    const { env, reads } = database();
    const response = await api.fetch(
      new Request("http://localhost/api/settings/okala"),
      env,
      {} as ExecutionContext
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        requiresCustomerCredentials: false,
        access: "public",
        coverage: "campaign-feed",
      },
    });
    expect(reads.some((sql) => /provider_settings/.test(sql))).toBe(false);
  });
  it("a failed later campaign leaves the last successful Okala snapshot intact and adds no partial deals", async () => {
    const { env, sqlite } = database();
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    mockOkala();
    const first = await start(env, "okala");
    const previous = ((await first.json()) as { data: { id: string } }).data.id;
    const before = await store.deals(previous);
    expect(before).toHaveLength(1);
    vi.restoreAllMocks();
    mockOkala(true);
    const second = await start(env, "okala");
    const id = ((await second.json()) as { data: { id: string } }).data.id;
    expect(await store.scan(id)).toMatchObject({
      status: "failed",
      errorCode: "UPSTREAM_FORBIDDEN",
      dealCount: 0,
    });
    expect(await store.scan(previous)).toMatchObject({ status: "succeeded" });
    expect(await store.deals(previous)).toEqual(before);
    expect(
      sqlite.prepare("SELECT * FROM deals WHERE scan_id=?").all(id)
    ).toEqual([]);
  });
});
