import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { defaultScanContext } from "@better-buy/shared";
import { registerCarts } from "./carts";
import { materializeProducts } from "../saved-products";
import type { Api, WorkerEnv } from "./types";

const databases: DatabaseSync[] = [];
async function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  databases.push(sqlite);
  for (const name of readdirSync(new URL("../../migrations", import.meta.url))
    .filter((n) => n.endsWith(".sql") && !n.startsWith("0005"))
    .sort())
    sqlite.exec(
      readFileSync(new URL("../../migrations/" + name, import.meta.url), "utf8")
    );
  sqlite
    .prepare(
      "INSERT INTO locations(id,user_id,name,latitude,longitude,is_default,created_at,updated_at) VALUES('home','owner','Home',35.7,51.4,1,'2026-01-01','2026-01-01')"
    )
    .run();
  const prepare = (sql: string, values: SQLInputValue[] = []) => ({
    bind: (...args: SQLInputValue[]) => prepare(sql, args),
    first: async <T>() =>
      (sqlite.prepare(sql).get(...values) as T | undefined) ?? null,
    all: async <T>() => ({
      results: sqlite.prepare(sql).all(...values) as T[],
    }),
    run: async () => ({ meta: sqlite.prepare(sql).run(...values) }),
  });
  const db = {
    prepare,
    batch: async (statements: { run(): Promise<unknown> }[]) =>
      Promise.all(statements.map((s) => s.run())),
  } as unknown as D1Database;
  const app: Api = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId", c.req.header("x-user") ?? "owner");
    await next();
  });
  registerCarts(app);
  const env = { DB: db, BOX_KEY: "fixture" } as WorkerEnv;
  const location = {
    id: "home",
    name: "Home",
    latitude: 35.7,
    longitude: 51.4,
    isDefault: true,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    coordinateRevision: 1,
  };
  const context = {
    ...(await defaultScanContext(location, "snappmarket", 40)),
    coverage: "complete" as const,
  };
  sqlite
    .prepare(
      "INSERT INTO scans(id,user_id,location_id,threshold,source,mode,status,created_at,finished_at,context_json) VALUES('fresh','owner','home',40,'snappmarket','partial','succeeded','2026-10-10T00:00:00.000Z','2026-10-10T00:00:01.000Z',?)"
    )
    .run(JSON.stringify(context));
  const addProduct = (
    scanId: string,
    key: string,
    vendorId = "store",
    finalPriceRials = 90,
    stock = 3
  ) => {
    const summary = {
      key,
      groupKeyVersion: 2,
      scanId,
      title: "Rice",
      image: null,
      categoryTitle: "Food",
      priceRials: 100,
      discountRials: 10,
      finalPriceRials,
      discountRatio: 10,
      state: "new",
      bestCurrentOffer: null,
      currentStoreOfferCount: 1,
      diagnostics: [],
      conditionalOfferCount: 0,
    };
    const offer = {
      benefit: {
        kind: "standard_discount",
        identity: "ordinary",
        applicable: true,
        terms: null,
      },
      offerKey: `${key}-${vendorId}`,
      productVariationId: key,
      vendorId,
      vendorTitle: vendorId,
      vendorCode: null,
      priceRials: 100,
      discountRials: 10,
      finalPriceRials,
      discountRatio: 10,
      stock,
      state: "new",
    };
    sqlite
      .prepare(
        "INSERT OR REPLACE INTO saved_products(user_id,scan_id,group_key,search_text,title_sort,presence,rank_ratio,rank_discount,rank_price,rank_price_desc,summary_json) VALUES('owner',?,?,?, 'rice',0,-10,-10,90,-90,?)"
      )
      .run(scanId, key, "rice", JSON.stringify(summary));
    sqlite
      .prepare(
        "INSERT INTO saved_product_offers(user_id,scan_id,group_key,offer_key,conditional,presence,final_price,vendor_id,offer_json) VALUES('owner',?,?,?,0,0,?,?,?)"
      )
      .run(
        scanId,
        key,
        `${key}-${vendorId}`,
        finalPriceRials,
        vendorId,
        JSON.stringify(offer)
      );
  };
  sqlite
    .prepare(
      "INSERT INTO product_projection_scans(user_id,scan_id,version,ready,cursor_product_id,baseline_reason,observed_at) VALUES('owner','fresh',2,1,'','none','2026-10-10T00:00:01.000Z')"
    )
    .run();
  addProduct("fresh", "v2:rice");
  const addScan = async (id: string, locationId: string) => {
    const row = sqlite
      .prepare(
        "SELECT id,name,latitude,longitude,is_default,created_at,updated_at,coordinate_revision FROM locations WHERE id=?"
      )
      .get(locationId) as {
      id: string;
      name: string;
      latitude: number;
      longitude: number;
      is_default: number;
      created_at: string;
      updated_at: string;
      coordinate_revision: number;
    };
    const scanContext = {
      ...(await defaultScanContext(
        {
          id: row.id,
          name: row.name,
          latitude: row.latitude,
          longitude: row.longitude,
          isDefault: Boolean(row.is_default),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          coordinateRevision: row.coordinate_revision,
        },
        "snappmarket",
        40
      )),
      coverage: "complete" as const,
    };
    sqlite
      .prepare(
        "INSERT INTO scans(id,user_id,location_id,threshold,source,mode,status,created_at,finished_at,context_json) VALUES(?, 'owner', ?,40,'snappmarket','partial','succeeded','2026-10-11T00:00:00.000Z','2026-10-11T00:00:01.000Z',?)"
      )
      .run(id, locationId, JSON.stringify(scanContext));
    sqlite
      .prepare(
        "INSERT INTO product_projection_scans(user_id,scan_id,version,ready,cursor_product_id,baseline_reason,observed_at) VALUES('owner',?,2,1,'','none','2026-10-11T00:00:01.000Z')"
      )
      .run(id);
    addProduct(id, "v2:rice");
  };
  const fetch = (path: string, init: RequestInit = {}, user = "owner") =>
    app.fetch(
      new Request("http://localhost" + path, {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-user": user,
          ...init.headers,
        },
        body: init.body,
      }),
      env
    );
  return { sqlite, db, fetch, addProduct, addScan };
}
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

describe("provider cart routes", () => {
  it("adds and reads a tenant-owned provider item with a full-quantity recommendation", async () => {
    const f = await fixture();
    const put = await f.fetch("/api/carts/snappmarket/items/v2%3Arice", {
      method: "PUT",
      body: JSON.stringify({ scanId: "fresh", quantity: 2 }),
    });
    expect(put.status).toBe(204);
    const response = await f.fetch("/api/carts/snappmarket?locationId=home");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        scanId: "fresh",
        observedAt: "2026-10-10T00:00:01.000Z",
        lines: [{ key: "v2:rice", quantity: 2 }],
        recommendation: {
          status: "complete",
          stores: [{ vendorId: "store", totalRials: 180 }],
        },
      },
    });
  });

  it("keeps carts tenant isolated and delete idempotent", async () => {
    const f = await fixture();
    await f.fetch("/api/carts/snappmarket/items/v2%3Arice", {
      method: "PUT",
      body: JSON.stringify({ scanId: "fresh", quantity: 1 }),
    });
    expect((await f.fetch("/api/carts/snappmarket", {}, "other")).status).toBe(
      200
    );
    expect(
      await (await f.fetch("/api/carts/snappmarket", {}, "other")).json()
    ).toMatchObject({ data: { lines: [] } });
    const path = "/api/carts/snappmarket/items/v2%3Arice";
    expect((await f.fetch(path, { method: "DELETE" })).status).toBe(204);
    expect((await f.fetch(path, { method: "DELETE" })).status).toBe(204);
  });

  it("rejects stale coordinates, unsupported providers and unavailable quantities", async () => {
    const f = await fixture();
    f.sqlite
      .prepare(
        "UPDATE locations SET latitude=35.8,coordinate_revision=coordinate_revision+1 WHERE id='home'"
      )
      .run();
    expect(
      (
        await f.fetch("/api/carts/snappmarket/items/v2%3Arice", {
          method: "PUT",
          body: JSON.stringify({ scanId: "fresh", quantity: 1 }),
        })
      ).status
    ).toBe(409);
    expect((await f.fetch("/api/carts/digikalajet")).status).toBe(400);
    f.sqlite
      .prepare(
        "UPDATE locations SET latitude=35.7,coordinate_revision=1 WHERE id='home'"
      )
      .run();
    expect(
      (
        await f.fetch("/api/carts/snappmarket/items/v2%3Arice", {
          method: "PUT",
          body: JSON.stringify({ scanId: "fresh", quantity: 4 }),
        })
      ).status
    ).toBe(204);
    expect(
      await (await f.fetch("/api/carts/snappmarket?locationId=home")).json()
    ).toMatchObject({
      data: {
        recommendation: {
          status: "partial",
          missingItems: [{ reason: "insufficient_quantity" }],
        },
      },
    });
  });

  it("rejects wrong-provider and foreign scan writes, and protects owner rows from foreign mutations", async () => {
    const f = await fixture();
    const path = "/api/carts/snappmarket/items/v2%3Arice";
    expect(
      (
        await f.fetch(
          path,
          {
            method: "PUT",
            body: JSON.stringify({ scanId: "fresh", quantity: 1 }),
          },
          "other"
        )
      ).status
    ).toBe(404);
    expect(
      (
        await f.fetch(path.replace("snappmarket", "okala"), {
          method: "PUT",
          body: JSON.stringify({ scanId: "fresh", quantity: 1 }),
        })
      ).status
    ).toBe(404);
    await f.fetch(path, {
      method: "PUT",
      body: JSON.stringify({ scanId: "fresh", quantity: 1 }),
    });
    expect(
      (
        await f.fetch(
          path,
          { method: "PUT", body: JSON.stringify({ quantity: 9 }) },
          "other"
        )
      ).status
    ).toBe(404);
    expect((await f.fetch(path, { method: "DELETE" }, "other")).status).toBe(
      204
    );
    expect(
      await (await f.fetch("/api/carts/snappmarket")).json()
    ).toMatchObject({ data: { lines: [{ key: "v2:rice", quantity: 1 }] } });
  });

  it("retains quantities across compatible scans and location changes, and hides stale-coordinate recommendations", async () => {
    const f = await fixture();
    await f.fetch("/api/carts/snappmarket/items/v2%3Arice", {
      method: "PUT",
      body: JSON.stringify({ scanId: "fresh", quantity: 2 }),
    });
    f.sqlite
      .prepare(
        "INSERT INTO locations(id,user_id,name,latitude,longitude,is_default,created_at,updated_at) VALUES('other-home','owner','Other',35.7,51.4,0,'2026-01-02','2026-01-02')"
      )
      .run();
    await f.addScan("fresh-new", "home");
    await f.addScan("other-scan", "other-home");
    expect(
      await (await f.fetch("/api/carts/snappmarket?locationId=home")).json()
    ).toMatchObject({
      data: { scanId: "fresh-new", lines: [{ quantity: 2 }] },
    });
    expect(
      await (
        await f.fetch("/api/carts/snappmarket?locationId=other-home")
      ).json()
    ).toMatchObject({
      data: { scanId: "other-scan", lines: [{ quantity: 2 }] },
    });
    f.sqlite
      .prepare(
        "UPDATE locations SET latitude=35.8,coordinate_revision=coordinate_revision+1 WHERE id='home'"
      )
      .run();
    expect(
      await (await f.fetch("/api/carts/snappmarket?locationId=home")).json()
    ).toMatchObject({
      data: {
        scanId: null,
        lines: [{ quantity: 2 }],
        recommendation: { status: "no_scan" },
      },
    });
  });

  it("enforces 24 distinct entries while allowing absolute updates and duplicate adds at capacity", async () => {
    const f = await fixture();
    const path = "/api/carts/snappmarket/items/v2%3Arice";
    await f.fetch(path, {
      method: "PUT",
      body: JSON.stringify({ scanId: "fresh", quantity: 1 }),
    });
    for (let n = 0; n < 23; n++)
      f.sqlite
        .prepare(
          "INSERT INTO provider_carts(user_id,source,group_key,title,image,category_title,quantity,origin_scan_id,created_at,updated_at) VALUES('owner','snappmarket',?,?,NULL,NULL,1,'fresh','x','x')"
        )
        .run(`other-${n}`, `Other ${n}`);
    expect(
      (
        await f.fetch("/api/carts/snappmarket/items/v2%3Anew", {
          method: "PUT",
          body: JSON.stringify({ scanId: "fresh", quantity: 1 }),
        })
      ).status
    ).toBe(404);
    f.addProduct("fresh", "v2:new");
    expect(
      (
        await f.fetch("/api/carts/snappmarket/items/v2%3Anew", {
          method: "PUT",
          body: JSON.stringify({ scanId: "fresh", quantity: 1 }),
        })
      ).status
    ).toBe(409);
    expect(
      (
        await f.fetch(path, {
          method: "PUT",
          body: JSON.stringify({ quantity: 7 }),
        })
      ).status
    ).toBe(204);
    expect(
      (
        await f.fetch(path, {
          method: "PUT",
          body: JSON.stringify({ scanId: "fresh", quantity: 7 }),
        })
      ).status
    ).toBe(204);
    expect(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM provider_carts WHERE user_id='owner' AND source='snappmarket'"
        )
        .get()
    ).toMatchObject({ n: 24 });
  });

  it("considers every published offer instead of truncating after fifty stores", async () => {
    const f = await fixture();
    await f.fetch("/api/carts/snappmarket/items/v2%3Arice", {
      method: "PUT",
      body: JSON.stringify({ scanId: "fresh", quantity: 1 }),
    });
    f.sqlite
      .prepare("DELETE FROM saved_product_offers WHERE group_key='v2:rice'")
      .run();
    for (let n = 0; n < 55; n++)
      f.addProduct(
        "fresh",
        "v2:rice",
        `store-${String(n).padStart(2, "0")}`,
        n === 54 ? 1 : 100 + n
      );
    const response = await f.fetch("/api/carts/snappmarket?locationId=home");
    expect(await response.json()).toMatchObject({
      data: {
        recommendation: { stores: [{ vendorId: "store-54", totalRials: 1 }] },
      },
    });
  });

  it("persists genuine vendor logo facts through projection into cart recommendations", async () => {
    const f = await fixture();
    const context = f.sqlite
      .prepare("SELECT context_json FROM scans WHERE id='fresh'")
      .get() as { context_json: string };
    f.sqlite
      .prepare(
        "INSERT INTO scans(id,user_id,location_id,threshold,source,mode,status,created_at,finished_at,context_json) VALUES('logo-scan','owner','home',40,'snappmarket','partial','succeeded','2026-10-11T00:00:00.000Z','2026-10-11T00:00:01.000Z',?)"
      )
      .run(context.context_json);
    f.sqlite
      .prepare(
        "INSERT INTO deals(id,scan_id,deal_key,product_variation_id,vendor_id,title,image,vendor_title,vendor_code,category_title,price_rials,discount_rials,final_price_rials,discount_ratio,stock,facts_json) VALUES('logo-deal','logo-scan','store:rice','rice','logo-store','Rice','https://cdn.example.test/rice.png','Logo Store','logo', 'Food',100,10,90,10,3,?)"
      )
      .run(
        JSON.stringify({
          benefit: {
            kind: "standard_discount",
            identity: "ordinary",
            applicable: true,
            terms: null,
          },
          vendorLogoUrl: "https://cdn.example.test/store.png",
        })
      );
    await materializeProducts(f.db, "owner", "logo-scan");
    const group = f.sqlite
      .prepare(
        "SELECT group_key FROM saved_products WHERE user_id='owner' AND scan_id='logo-scan'"
      )
      .get() as { group_key: string };
    await f.fetch(
      `/api/carts/snappmarket/items/${encodeURIComponent(group.group_key)}`,
      {
        method: "PUT",
        body: JSON.stringify({ scanId: "logo-scan", quantity: 1 }),
      }
    );
    expect(
      await (await f.fetch("/api/carts/snappmarket?locationId=home")).json()
    ).toMatchObject({
      data: {
        scanId: "logo-scan",
        recommendation: {
          stores: [
            {
              logoUrl: "https://cdn.example.test/store.png",
              items: [{ image: "https://cdn.example.test/rice.png" }],
            },
          ],
        },
      },
    });
  });
});
