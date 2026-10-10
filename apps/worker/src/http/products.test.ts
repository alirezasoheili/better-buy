import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import type { Api, WorkerEnv } from "./types";
import { registerPagedProducts } from "./products";
import { materializeProducts, projectionReady } from "../saved-products";
import { defaultScanContext } from "@better-buy/shared";

const databases: DatabaseSync[] = [];
function fixture() {
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
      "INSERT INTO locations(id,user_id,name,latitude,longitude,created_at,updated_at) VALUES('location','owner','Home',35.7,51.4,'2026-01-01','2026-01-01')"
    )
    .run();
  const queries: string[] = [];
  const hooks = { beforeBatch: () => {}, afterBatch: () => {} };
  const prepare = (sql: string, values: SQLInputValue[] = []) => ({
    bind: (...args: SQLInputValue[]) => prepare(sql, args),
    first: async () => {
      queries.push(sql);
      return sqlite.prepare(sql).get(...values) ?? null;
    },
    all: async () => {
      queries.push(sql);
      return { results: sqlite.prepare(sql).all(...values) };
    },
    run: async () => {
      queries.push(sql);
      return { meta: sqlite.prepare(sql).run(...values) };
    },
  });
  const db = {
    prepare,
    batch: async (statements: { run(): Promise<unknown> }[]) => {
      hooks.beforeBatch();
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        sqlite.exec("COMMIT");
        hooks.afterBatch();
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
  const app: Api = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId", c.req.header("x-user") ?? "owner");
    await next();
  });
  registerPagedProducts(app);
  const env = { DB: db, BOX_KEY: "fixture" } as WorkerEnv;
  const scan = (id = "scan", status = "succeeded", user = "owner") =>
    sqlite
      .prepare(
        "INSERT INTO scans(id,user_id,location_id,threshold,source,mode,status,created_at,finished_at) VALUES(?,?,?,40,'snappmarket','partial',?,'2026-10-10T00:00:00.000Z','2026-10-10T00:00:01.000Z')"
      )
      .run(id, user, "location", status);
  const offer = (
    product: string,
    ratio: number,
    title = "Product " + product,
    vendor = "store",
    original = 100000,
    scanId = "scan"
  ) =>
    sqlite
      .prepare(
        "INSERT INTO deals(id,scan_id,deal_key,product_variation_id,vendor_id,title,vendor_title,price_rials,discount_rials,final_price_rials,discount_ratio,stock) VALUES(?,?,?,?,?,?,?, ?,?,?,?,3)"
      )
      .run(
        scanId + vendor + product,
        scanId,
        vendor + ":" + product,
        product,
        vendor,
        title,
        "Store " + vendor,
        original,
        (original * ratio) / 100,
        original - (original * ratio) / 100,
        ratio
      );
  const get = (query = "?page=1", scanId = "scan", user = "owner") =>
    app.fetch(
      new Request(
        "http://localhost/api/scans/" + scanId + "/products" + query,
        { headers: { "x-user": user } }
      ),
      env
    );
  return { sqlite, db, app, env, scan, offer, get, queries, hooks };
}
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
describe("saved ranked product pages", () => {
  it("ranks a saved snapshot before slicing and excludes expanded offers from summaries", async () => {
    const f = fixture();
    f.scan();
    f.offer("low", 40);
    f.offer("high", 70);
    f.offer("middle", 50);
    f.offer("high", 60, "Product high", "other", 200000);
    const response = await f.get("?page=1&limit=2");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        items: {
          title: string;
          vendors?: unknown;
          bestCurrentOffer: {
            vendorId: string;
            priceRials: number;
            finalPriceRials: number;
            discountRatio: number;
          };
        }[];
        nextCursor: string;
      };
    };
    expect(body.data.items.map((i) => i.title)).toEqual([
      "Product high",
      "Product middle",
    ]);
    expect(body.data.items[0]).not.toHaveProperty("vendors");
    expect(body.data.items[0]?.bestCurrentOffer).toMatchObject({
      vendorId: "store",
      priceRials: 100000,
      finalPriceRials: 30000,
      discountRatio: 70,
    });
    expect(body.data.nextCursor).toEqual(expect.any(String));
  });
  it("normalizes Persian search and digits before slicing and binds cursors to the saved search and sort", async () => {
    const f = fixture();
    f.scan();
    f.scan("another");
    for (let n = 0; n < 60; n++) f.offer("filler" + n, 70, "Other " + n);
    f.offer("rice1", 40, "برنج كيسه ۵۰۰ گرمي");
    f.offer("rice2", 50, "برنج کیسه 500 گرمی");
    const first = (await (
      await f.get("?page=1&limit=1&q=" + encodeURIComponent("کیسه ٥٠٠"))
    ).json()) as { data: { items: { title: string }[]; nextCursor: string } };
    expect(first.data.items.map((i) => i.title)).toEqual([
      "برنج کیسه 500 گرمی",
    ]);
    const cursor = encodeURIComponent(first.data.nextCursor);
    const next = (await (
      await f.get(
        "?page=1&limit=1&q=" +
          encodeURIComponent("كيسه ۵۰۰") +
          "&cursor=" +
          cursor
      )
    ).json()) as { data: { items: { title: string }[]; nextCursor: null } };
    expect(next.data.items.map((i) => i.title)).toEqual(["برنج كيسه ۵۰۰ گرمي"]);
    expect(next.data.nextCursor).toBeNull();
    for (const query of [
      "?page=1&q=Other&cursor=",
      "?page=1&sort=price&cursor=",
    ])
      expect((await f.get(query + cursor)).status).toBe(400);
    expect(
      (
        await f.get(
          "?page=1&q=" + encodeURIComponent("کیسه 500") + "&cursor=" + cursor,
          "another"
        )
      ).status
    ).toBe(400);
    expect(
      (
        await f.get(
          "?page=1&q=" + encodeURIComponent("کیسه 500") + "&cursor=" + cursor,
          "scan",
          "other-user"
        )
      ).status
    ).toBe(400);
    expect((await f.get("?page=1&cursor=not-valid")).status).toBe(400);
  });
  it("reads bounded expanded store pages with coherent prices and rejects group cursor reuse", async () => {
    const f = fixture();
    f.scan();
    for (let n = 0; n < 25; n++)
      f.offer(
        "same",
        50,
        "Same product",
        "vendor" + String(n).padStart(2, "0"),
        100000 + n * 2000
      );
    f.offer("different", 40);
    const products = (await (await f.get()).json()) as {
      data: { items: { key: string; currentStoreOfferCount: number }[] };
    };
    const group = products.data.items.find(
      (g) => g.currentStoreOfferCount === 25
    )!;
    const path =
      "http://localhost/api/scans/scan/products/" +
      encodeURIComponent(group.key) +
      "/offers";
    const firstResponse = await f.app.fetch(new Request(path), f.env);
    expect(firstResponse.status).toBe(200);
    const first = (await firstResponse.json()) as {
      data: {
        items: {
          vendorId: string;
          priceRials: number;
          finalPriceRials: number;
        }[];
        nextCursor: string;
      };
    };
    expect(first.data.items).toHaveLength(20);
    expect(first.data.items[0]).toMatchObject({
      vendorId: "vendor00",
      priceRials: 100000,
      finalPriceRials: 50000,
    });
    const next = (await (
      await f.app.fetch(
        new Request(
          path + "?cursor=" + encodeURIComponent(first.data.nextCursor)
        ),
        f.env
      )
    ).json()) as { data: { items: { vendorId: string }[]; nextCursor: null } };
    expect(next.data.items.map((o) => o.vendorId)).toEqual([
      "vendor20",
      "vendor21",
      "vendor22",
      "vendor23",
      "vendor24",
    ]);
    expect(next.data.nextCursor).toBeNull();
    const other = products.data.items.find((g) => g.key !== group.key)!;
    expect(
      (
        await f.app.fetch(
          new Request(
            path.replace(
              encodeURIComponent(group.key),
              encodeURIComponent(other.key)
            ) +
              "?cursor=" +
              encodeURIComponent(first.data.nextCursor)
          ),
          f.env
        )
      ).status
    ).toBe(400);
    expect(
      (await f.app.fetch(new Request(path + "?limit=51"), f.env)).status
    ).toBe(400);
    expect(
      (
        await f.app.fetch(
          new Request(path.replace(encodeURIComponent(group.key), "missing")),
          f.env
        )
      ).status
    ).toBe(404);
  });
  it("keeps staged materializations invisible and isolates tenant and missing scans", async () => {
    const f = fixture();
    f.scan("staged", "running");
    f.offer("one", 50, "One", "store", 100000, "staged");
    await materializeProducts(f.db, "owner", "staged");
    expect((await f.get("?page=1", "staged")).status).toBe(409);
    f.sqlite
      .prepare("UPDATE scans SET status='cancelled' WHERE id='staged'")
      .run();
    expect((await f.get("?page=1", "staged")).status).toBe(409);
    f.scan();
    f.offer("saved", 50);
    expect((await f.get("?page=1", "scan", "other-user")).status).toBe(404);
    expect((await f.get("?page=1", "missing")).status).toBe(404);
  });
  it("uses stable keyset ties, defaults to fifty and caps product pages at one hundred", async () => {
    const f = fixture();
    f.scan();
    for (let n = 0; n < 125; n++) f.offer(String(n).padStart(3, "0"), 50);
    const first = (await (await f.get()).json()) as {
      data: { items: { key: string }[]; nextCursor: string };
    };
    expect(first.data.items).toHaveLength(50);
    const next = (await (
      await f.get(
        "?page=1&limit=100&cursor=" + encodeURIComponent(first.data.nextCursor)
      )
    ).json()) as { data: { items: { key: string }[]; nextCursor: null } };
    expect(next.data.items).toHaveLength(75);
    expect(next.data.nextCursor).toBeNull();
    expect(
      new Set([...first.data.items, ...next.data.items].map((i) => i.key)).size
    ).toBe(125);
    expect((await f.get("?page=1&limit=101")).status).toBe(400);
    expect((await f.get("?page=1&sort=arbitrary")).status).toBe(400);
  });
  it("checkpoints large legacy projections with safe read retries and never reads raw offers after ready", async () => {
    const f = fixture();
    f.scan();
    for (let n = 0; n < 450; n++) f.offer(String(n).padStart(3, "0"), 50);
    const pending = await f.get();
    expect(pending.status).toBe(409);
    expect(pending.headers.get("Retry-After")).toBe("1");
    expect(await pending.json()).toMatchObject({
      error: "PROJECTION_PENDING",
      retryable: true,
    });
    const page = await f.get();
    expect(page.status).toBe(200);
    const body = (await page.json()) as {
      data: { items: unknown[]; baseline: unknown };
    };
    expect(body.data.items).toHaveLength(50);
    expect(body.data.baseline).toEqual({
      scanId: null,
      reason: "legacy_unverified",
    });
    f.queries.length = 0;
    expect((await f.get("?page=1&q=Product&sort=price")).status).toBe(200);
    expect(f.queries.filter((q) => /FROM deals\b/.test(q))).toEqual([]);
  });
  it("compares only compatible complete history and retains historical-only groups without a current best price", async () => {
    const f = fixture();
    f.scan("prior");
    f.scan();
    const context = await defaultScanContext(
      {
        id: "location",
        name: "Frozen",
        latitude: 35.7,
        longitude: 51.4,
        isDefault: true,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      "snappmarket",
      40
    );
    context.coverage = "complete";
    for (const id of ["prior", "scan"])
      f.sqlite
        .prepare("UPDATE scans SET context_json=? WHERE id=?")
        .run(JSON.stringify(context), id);
    f.offer("stable", 40, "Stable", "store", 100000, "prior");
    f.offer("gone", 50, "Gone", "store", 100000, "prior");
    f.offer("stable", 50, "Stable");
    f.offer("new", 40, "New");
    const page = (await (await f.get()).json()) as {
      data: {
        baseline: unknown;
        items: { title: string; state: string; bestCurrentOffer: unknown }[];
      };
    };
    expect(page.data.baseline).toEqual({
      scanId: "prior",
      reason: "comparable",
    });
    expect(page.data.items.map((i) => [i.title, i.state])).toEqual([
      ["Stable", "still_available"],
      ["New", "new"],
      ["Gone", "no_longer_present"],
    ]);
    expect(page.data.items[2]?.bestCurrentOffer).toBeNull();
    f.scan("other-scope");
    context.scopeHash = "changed";
    f.sqlite
      .prepare("UPDATE scans SET context_json=? WHERE id='other-scope'")
      .run(JSON.stringify(context));
    f.offer("current", 50, "Current", "store", 100000, "other-scope");
    const different = (await (
      await f.get("?page=1", "other-scope")
    ).json()) as { data: { baseline: unknown; items: { state: string }[] } };
    expect(different.data.baseline).toEqual({
      scanId: null,
      reason: "no_comparable_baseline",
    });
    expect(different.data.items.map((i) => i.state)).toEqual(["current"]);
  });
  it("retains explicit benefit and provenance details on expanded offers, while conditional offers never drive headline ranking", async () => {
    const f = fixture();
    f.scan();
    f.offer("one", 40, "Product one");
    f.offer("one", 90, "Product one", "conditional");
    f.sqlite
      .prepare("UPDATE deals SET facts_json=? WHERE vendor_id='conditional'")
      .run(
        JSON.stringify({
          benefit: {
            kind: "conditional",
            identity: "coupon",
            applicable: null,
            terms: "Requires coupon",
          },
          provenance: ["campaign:observed"],
          observedAt: "2026-10-10T00:00:00.000Z",
        })
      );
    const page = (await (await f.get()).json()) as {
      data: {
        items: {
          key: string;
          discountRatio: number;
          conditionalOfferCount: number;
        }[];
      };
    };
    expect(page.data.items[0]).toMatchObject({
      discountRatio: 40,
      conditionalOfferCount: 1,
    });
    const offers = (await (
      await f.app.fetch(
        new Request(
          "http://localhost/api/scans/scan/products/" +
            encodeURIComponent(page.data.items[0]!.key) +
            "/offers"
        ),
        f.env
      )
    ).json()) as {
      data: { items: { benefit: unknown; provenance: unknown }[] };
    };
    expect(offers.data.items[1]).toMatchObject({
      benefit: {
        kind: "conditional",
        identity: "coupon",
        applicable: null,
        terms: "Requires coupon",
      },
      provenance: ["campaign:observed"],
    });
  });
  it("stops a checkpointed projection when cancellation commits between chunks", async () => {
    const f = fixture();
    f.scan("staged", "running");
    for (let n = 0; n < 250; n++)
      f.offer(String(n), 50, "Product " + n, "store", 100000, "staged");
    f.hooks.afterBatch = () => {
      f.sqlite
        .prepare("UPDATE scans SET status='cancelled' WHERE id='staged'")
        .run();
    };
    await expect(
      materializeProducts(f.db, "owner", "staged")
    ).rejects.toMatchObject({ code: "SCAN_NOT_PUBLISHED" });
    expect(await projectionReady(f.db, "owner", "staged")).toBe(false);
    expect((await f.get("?page=1", "staged")).status).toBe(409);
  });
  it("does not mark a final staged chunk ready if cancellation commits before its transaction", async () => {
    const f = fixture();
    f.scan("staged", "running");
    f.offer("one", 50, "One", "store", 100000, "staged");
    f.hooks.beforeBatch = () => {
      f.sqlite
        .prepare("UPDATE scans SET status='cancelled' WHERE id='staged'")
        .run();
    };
    await expect(
      materializeProducts(f.db, "owner", "staged")
    ).rejects.toMatchObject({ code: "SCAN_NOT_PUBLISHED" });
    expect(await projectionReady(f.db, "owner", "staged")).toBe(false);
  });
});
