import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { readDurableComparison } from "./comparison";
import { Store } from "../store";
import { DurableRepository } from "./repository";
import type { Page, Unit } from "./types";
import { providerReader } from "./provider";
import { runDurableScan } from "./runner";
import {
  beginLegacyScan,
  reconcileDurableScan,
  beginDurableScan,
  reconcileDurableOperations,
} from "./service";

const databases: DatabaseSync[] = [];
function database() {
  const sqlite = new DatabaseSync(":memory:");
  databases.push(sqlite);
  for (const name of readdirSync("migrations")
    .filter((n) => n.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(`migrations/${name}`, "utf8"));
  const wrap = (sql: string, args: (string | number | null)[] = []) => ({
    bind: (...v: (string | number | null)[]) => wrap(sql, v),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => ({
      success: true,
      meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) },
    }),
  });
  const db = {
    prepare: (sql: string) => wrap(sql),
    batch: async (statements: { run: () => Promise<unknown> }[]) => {
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const stmt of statements) result.push(await stmt.run());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  return { db, sqlite };
}
afterEach(() => databases.splice(0).forEach((d) => d.close()));
describe("durable scan persistence", () => {
  it("cleanup progresses beyond its bounded first batch without erasing history or successful data", async () => {
    const { db, sqlite } = database(),
      store = new Store(db, "tenant", "key"),
      repo = new DurableRepository(db, "key");
    const location = await store.createLocation({
      name: "Fixture",
      latitude: 35.7,
      longitude: 51.4,
    });
    const input = {
      locationId: location!.id,
      source: "snappmarket" as const,
      threshold: 40,
      mode: "partial" as const,
    };
    for (let i = 0; i < 22; i++) {
      const scan = await repo.reserve(
        "tenant",
        input,
        crypto.randomUUID(),
        false
      );
      await repo.saveDiscovery(scan.id, "fixture", { fixture: true });
      await repo.cancel(scan.id, "tenant");
      sqlite
        .prepare("UPDATE scans SET finished_at=? WHERE id=?")
        .run("2026-01-01T00:00:00.000Z", scan.id);
      if (i === 21)
        sqlite
          .prepare("UPDATE scans SET status='succeeded' WHERE id=?")
          .run(scan.id);
    }
    const env = {
      DB: db,
      BOX_KEY: "key",
      SCAN_WORKFLOW: {
        get: async () => {
          throw new Error("must not reach engine");
        },
        create: async () => {
          throw new Error("must not dispatch");
        },
      },
    };
    await reconcileDurableOperations(env);
    expect(
      sqlite.prepare("SELECT COUNT(*) AS n FROM scan_discovery").get()
    ).toMatchObject({ n: 2 });
    await reconcileDurableOperations(env);
    expect(
      sqlite.prepare("SELECT COUNT(*) AS n FROM scan_discovery").get()
    ).toMatchObject({ n: 1 });
    await reconcileDurableOperations(env);
    expect(
      sqlite.prepare("SELECT COUNT(*) AS n FROM scans").get()
    ).toMatchObject({ n: 22 });
    expect(
      sqlite.prepare("SELECT COUNT(*) AS n FROM scan_start_intents").get()
    ).toMatchObject({ n: 22 });
  });
  it("comparison measures incremental union contributions and requires publication for completeness", async () => {
    const { db } = database(),
      store = new Store(db, "tenant", "key"),
      repo = new DurableRepository(db, "key");
    const location = await store.createLocation({
      name: "Fixture",
      latitude: 35.7,
      longitude: 51.4,
    });
    const scan = await repo.reserve(
      "tenant",
      {
        locationId: location!.id,
        source: "snappmarket",
        threshold: 40,
        mode: "partial",
      },
      crypto.randomUUID(),
      false
    );
    await repo.started(scan.id);
    const units: Unit[] = [
      { id: "baseline", kind: "market_party" },
      { id: "campaign-a", kind: "store_campaign" },
      { id: "campaign-b", kind: "store_campaign" },
      { id: "campaign-c", kind: "store_campaign" },
    ];
    await repo.freeze(scan.id, units, scan.context!.manifest);
    const eligible = { eligible: true, excludedReason: null };
    const excluded = { eligible: false, excludedReason: "BELOW_THRESHOLD" };
    for (const [index, unit] of units.entries()) {
      const eligibility: NonNullable<Page["eligibility"]> =
        index === 0
          ? { "1:1": eligible }
          : index === 1
            ? { "1:1": eligible, "1:2": eligible, "1:3": excluded }
            : index === 2
              ? { "1:2": eligible }
              : { "1:3": excluded };
      const identities = Object.keys(eligibility);
      await repo.stage(scan.id, unit, 0, {
        offers: [],
        products: identities,
        vendors: ["1"],
        identities,
        eligibility,
        rowCount: identities.length,
        reportedTotal: identities.length,
        terminal: true,
        terminalEvidence: "fixture_terminal",
        fingerprint: unit.id,
      });
    }
    expect(await readDurableComparison(db, "tenant", scan.id)).toMatchObject({
      complete: false,
      baseline: 1,
      supplementary: 2,
      overlap: 1,
      union: 2,
      additional: 1,
      campaigns: [
        {
          overlap: 1,
          additional: 1,
          outcome: "net_new",
          excluded: { BELOW_THRESHOLD: 1 },
        },
        { overlap: 0, additional: 0, outcome: "all_duplicates" },
        { qualifying: 0, additional: 0, outcome: "zero_eligible" },
      ],
    });
    await repo.cancel(scan.id, "tenant");
    expect(await readDurableComparison(db, "tenant", scan.id)).toMatchObject({
      complete: false,
    });
  });

  it("one 401 guest refresh is persisted across an ephemeral session resume", async () => {
    const { db } = database(),
      store = new Store(db, "tenant", "key"),
      repo = new DurableRepository(db, "key");
    const location = await store.createLocation({
      name: "Fixture",
      latitude: 35.7,
      longitude: 51.4,
    });
    const scan = await repo.reserve(
      "tenant",
      {
        locationId: location!.id,
        source: "snappmarket",
        threshold: 40,
        mode: "partial",
      },
      crypto.randomUUID(),
      false
    );
    let access = 0,
      gets = 0;
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes("oauth2")) {
        access++;
        return Response.json({
          status: true,
          data: { access_token: "fixture", expires_in: 1000 },
        });
      }
      gets++;
      return gets === 2
        ? Response.json({ fixture: true })
        : Response.json({ error: "expired" }, { status: 401 });
    };
    const steps = {
      do: async <T extends Rpc.Serializable<T>>(
        _n: string,
        a: () => Promise<T>
      ) => a(),
      sleep: async () => {},
    };
    const url = new URL("https://svc.snapp.market/fixture");
    expect(
      await providerReader(repo, scan.id, steps, fetcher)(url, "first-page")
    ).toEqual({ fixture: true });
    expect(access).toBe(2);
    await expect(
      providerReader(repo, scan.id, steps, fetcher)(url, "second-page")
    ).rejects.toMatchObject({ code: "GUEST_AUTH_REJECTED" });
    expect(access).toBe(3);
    expect(gets).toBe(3);
    expect((await repo.load(scan.id))!.runtime.attempt_count).toBe(6);
  });
  it("reuses a tenant start intent and rejects changed input without another reservation", async () => {
    const { db } = database(),
      store = new Store(db, "tenant", "key"),
      repo = new DurableRepository(db, "key");
    const loc = await store.createLocation({
      name: "Fixture",
      latitude: 35.7,
      longitude: 51.4,
    });
    const input = {
      locationId: loc!.id,
      source: "snappmarket" as const,
      threshold: 40,
      mode: "partial" as const,
    };
    const key = crypto.randomUUID();
    const first = await repo.reserve("tenant", input, key, false);
    expect((await repo.reserve("tenant", input, key, false)).id).toBe(first.id);
    await expect(
      repo.reserve("tenant", { ...input, threshold: 50 }, key, false)
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("global durable admission and physical retry reservations remain bounded across tenants", async () => {
    const { db, sqlite } = database(),
      repo = new DurableRepository(db, "key");
    const input = async (user: string) => {
      const location = await new Store(db, user, "key").createLocation({
        name: "Fixture",
        latitude: 35.7,
        longitude: 51.4,
      });
      return {
        locationId: location!.id,
        source: "snappmarket" as const,
        threshold: 40,
        mode: "partial" as const,
      };
    };
    const a = await input("a"),
      b = await input("b");
    const first = await repo.reserve("a", a, crypto.randomUUID(), false);
    await expect(
      repo.reserve("b", b, crypto.randomUUID(), false)
    ).rejects.toMatchObject({ code: "SCAN_CAPACITY", status: 429 });
    expect(
      sqlite.prepare("SELECT COUNT(*) AS n FROM scans").get()
    ).toMatchObject({ n: 1 });
    await repo.reserveAttempt(first.id, "get-page");
    await repo.reserveAttempt(first.id, "get-page");
    await repo.reserveAttempt(first.id, "get-page");
    await expect(
      repo.reserveAttempt(first.id, "get-page")
    ).rejects.toMatchObject({ code: "SCAN_BUDGET_EXCEEDED" });
    expect((await repo.load(first.id))!.runtime.attempt_count).toBe(3);
    sqlite
      .prepare("UPDATE scan_execution SET attempt_limit=3 WHERE scan_id=?")
      .run(first.id);
    await expect(
      repo.reserveAttempt(first.id, "another-page")
    ).rejects.toMatchObject({ code: "SCAN_BUDGET_EXCEEDED" });
    await repo.cancel(first.id, "a");
    await expect(
      repo.reserveAttempt(first.id, "another-page")
    ).rejects.toMatchObject({ code: "TERMINAL_SCAN" });
    expect(
      (await repo.reserve("b", b, crypto.randomUUID(), false)).status
    ).toBe("queued");
  });
  it("replays staged pages without inflated counts, rejects conflicting content and never publishes unfinished units", async () => {
    const { db, sqlite } = database(),
      store = new Store(db, "tenant", "key"),
      repo = new DurableRepository(db, "key");
    sqlite.exec(
      "CREATE TABLE IF NOT EXISTS product_projection_scans(user_id TEXT,scan_id TEXT PRIMARY KEY,ready INTEGER)"
    );
    const loc = await store.createLocation({
      name: "Fixture",
      latitude: 35.7,
      longitude: 51.4,
    });
    const scan = await repo.reserve(
      "tenant",
      {
        locationId: loc!.id,
        source: "snappmarket",
        threshold: 40,
        mode: "partial",
      },
      crypto.randomUUID(),
      false
    );
    await repo.started(scan.id);
    const unit: Unit = { id: "baseline", kind: "market_party" };
    await repo.freeze(
      scan.id,
      [unit, { id: "extra", kind: "store_campaign" }],
      scan.context!.manifest
    );
    const offer = {
      key: "1:2",
      productVariationId: "2",
      vendorId: "1",
      title: "Milk 1 L",
      image: null,
      vendorTitle: "Shop",
      vendorCode: null,
      categoryTitle: null,
      priceRials: 100000,
      discountRials: 50000,
      finalPriceRials: 50000,
      discountRatio: 50,
      stock: 2,
    };
    const page: Page = {
      offers: [offer],
      products: ["1:2"],
      vendors: ["1"],
      identities: ["1"],
      rowCount: 1,
      reportedTotal: 1,
      terminal: true,
      terminalEvidence: "verified_total",
      fingerprint: "first",
    };
    await repo.stage(scan.id, unit, 0, page);
    await repo.stage(scan.id, unit, 0, page);
    expect(await store.deals(scan.id)).toEqual([]);
    expect(await store.scan(scan.id)).toMatchObject({
      status: "running",
      vendorCount: 1,
      productCount: 1,
      dealCount: 1,
    });
    await expect(
      repo.stage(scan.id, unit, 0, {
        ...page,
        offers: [{ ...offer, stock: 3 }],
      })
    ).rejects.toMatchObject({ code: "INCOMPLETE_PAGINATION" });
    await expect(repo.publish(scan.id)).rejects.toMatchObject({
      code: "INCOMPLETE_PAGINATION",
    });
    await repo.cancel(scan.id, "tenant");
    await expect(
      repo.stage(scan.id, { id: "extra", kind: "store_campaign" }, 0, page)
    ).rejects.toMatchObject({ code: "TERMINAL_SCAN" });
    expect(await store.scan(scan.id)).toMatchObject({ status: "cancelled" });
    expect(await store.deals(scan.id)).toEqual([]);
  });
  it("a resumed chunk ledger finishes the same page without duplicates, then publishes all completed units", async () => {
    const { db, sqlite } = database(),
      store = new Store(db, "tenant", "key"),
      repo = new DurableRepository(db, "key");
    sqlite.exec(
      "CREATE TABLE IF NOT EXISTS product_projection_scans(user_id TEXT,scan_id TEXT PRIMARY KEY,ready INTEGER)"
    );
    const loc = await store.createLocation({
      name: "Fixture",
      latitude: 35.7,
      longitude: 51.4,
    });
    const scan = await repo.reserve(
      "tenant",
      {
        locationId: loc!.id,
        source: "snappmarket",
        threshold: 40,
        mode: "partial",
      },
      crypto.randomUUID(),
      false
    );
    await repo.started(scan.id);
    const unit: Unit = { id: "baseline", kind: "market_party" };
    await repo.freeze(scan.id, [unit], scan.context!.manifest);
    const page: Page = {
      offers: Array.from({ length: 25 }, (_, n) => ({
        key: `1:${n}`,
        productVariationId: String(n),
        vendorId: "1",
        title: `Product ${n}`,
        image: null,
        vendorTitle: "Shop",
        vendorCode: null,
        categoryTitle: null,
        priceRials: 100000,
        discountRials: 50000,
        finalPriceRials: 50000,
        discountRatio: 50,
        stock: 2,
      })),
      products: Array.from({ length: 25 }, (_, n) => `1:${n}`),
      vendors: ["1"],
      identities: ["1"],
      rowCount: 1,
      reportedTotal: 1,
      terminal: true,
      terminalEvidence: "verified_total",
      fingerprint: "first",
    };
    const batch = db.batch.bind(db);
    let calls = 0;
    db.batch = async (statements) => {
      if (++calls === 2) throw new Error("simulated runtime interruption");
      return batch(statements);
    };
    await expect(repo.stage(scan.id, unit, 0, page)).rejects.toThrow(
      "interruption"
    );
    expect(await repo.checkpoint(scan.id, unit.id, 0)).toBeNull();
    db.batch = batch;
    await repo.stage(scan.id, unit, 0, page);
    expect(await store.scan(scan.id)).toMatchObject({
      dealCount: 25,
      productCount: 25,
      vendorCount: 1,
    });
    sqlite
      .prepare(
        "INSERT INTO product_projection_scans(user_id,scan_id,ready,baseline_reason,observed_at) VALUES(?,?,1,'scope_mismatch','2026-10-10T00:00:00.000Z')"
      )
      .run("tenant", scan.id);
    await repo.publish(scan.id);
    expect(await store.deals(scan.id)).toHaveLength(25);
    const another = new DurableRepository(db, "key");
    expect(await another.load(scan.id, "another")).toBeNull();
  });
  it("collects real provider pages with persisted retry attempts and preserves committed pages on replay", async () => {
    const { db, sqlite } = database(),
      store = new Store(db, "tenant", "key"),
      repo = new DurableRepository(db, "key");
    sqlite.exec(
      "CREATE TABLE IF NOT EXISTS product_projection_scans(user_id TEXT,scan_id TEXT PRIMARY KEY,ready INTEGER)"
    );
    const loc = await store.createLocation({
      name: "Fixture",
      latitude: 35.7,
      longitude: 51.4,
    });
    const scan = await repo.reserve(
      "tenant",
      {
        locationId: loc!.id,
        source: "snappmarket",
        threshold: 40,
        mode: "partial",
      },
      crypto.randomUUID(),
      false
    );
    let requests = 0,
      pageRequests = 0;
    const devices = new Set<string>();
    const fetcher: typeof fetch = async (input) => {
      requests++;
      const url = new URL(String(input));
      devices.add(url.searchParams.get("UDID")!);
      if (url.pathname.includes("oauth2"))
        return Response.json({
          status: true,
          data: { access_token: "fixture-only", expires_in: 1000 },
        });
      if (++pageRequests === 1)
        return new Response(null, {
          status: 503,
          headers: { "retry-after": "0" },
        });
      const p = Number(url.searchParams.get("page"));
      return Response.json({
        status: true,
        data: {
          total_count: 2,
          vendors: [
            {
              vendor_id: p + 1,
              products: [
                {
                  vendorId: p + 1,
                  productVariationId: p + 10,
                  price: 100000,
                  discount: 50000,
                  discountRatio: 50,
                  title: `Milk ${p}`,
                  vendorTitle: "Store",
                  stock: 3,
                },
              ],
            },
          ],
        },
      });
    };
    const outputs: unknown[] = [];
    const steps = {
      do: async <T extends Rpc.Serializable<T>>(
        _name: string,
        action: () => Promise<T>
      ) => {
        const value = await action();
        outputs.push(value);
        return value;
      },
      sleep: async () => {},
    };
    const materialize = async () => {
      await db
        .prepare(
          "INSERT INTO product_projection_scans(user_id,scan_id,ready,baseline_reason,observed_at) VALUES(?,?,1,'scope_mismatch','2026-10-10T00:00:00.000Z')"
        )
        .bind("tenant", scan.id)
        .run();
    };
    await runDurableScan(
      { scanId: scan.id, contractVersion: 1 },
      { repository: repo, steps, fetcher, materialize }
    );
    expect(await store.scan(scan.id)).toMatchObject({
      status: "succeeded",
      vendorCount: 2,
      productCount: 2,
      dealCount: 2,
    });
    expect(requests).toBe(4);
    expect(devices.size).toBe(1);
    expect((await repo.load(scan.id))!.runtime.attempt_count).toBe(4);
    expect(JSON.stringify(outputs)).not.toContain("fixture-only");
    expect(JSON.stringify(outputs)).not.toContain("priceRials");
    await runDurableScan(
      { scanId: scan.id, contractVersion: 1 },
      { repository: repo, steps, fetcher, materialize }
    );
    expect(requests).toBe(4);
  });
  it("uncertain engine reads and the legacy stale policy do not fail a healthy durable update", async () => {
    const { db, sqlite } = database(),
      store = new Store(db, "tenant", "key"),
      repo = new DurableRepository(db, "key");
    const loc = await store.createLocation({
      name: "Fixture",
      latitude: 35.7,
      longitude: 51.4,
    });
    const scan = await repo.reserve(
      "tenant",
      {
        locationId: loc!.id,
        source: "snappmarket",
        threshold: 40,
        mode: "partial",
      },
      crypto.randomUUID(),
      false
    );
    await repo.started(scan.id);
    await repo.dispatchState(scan.id, "dispatched");
    sqlite
      .prepare("UPDATE scans SET created_at=? WHERE id=?")
      .run(new Date(Date.now() - 30 * 60_000).toISOString(), scan.id);
    sqlite
      .prepare("UPDATE scan_execution SET queued_until=? WHERE scan_id=?")
      .run(new Date(Date.now() - 20 * 60_000).toISOString(), scan.id);
    await store.reconcileStale();
    await reconcileDurableScan(
      {
        DB: db,
        BOX_KEY: "key",
        SCAN_WORKFLOW: {
          get: async () => {
            throw new Error("network unavailable");
          },
          create: async () => {
            throw new Error("network unavailable");
          },
        },
      },
      "tenant",
      scan.id
    );
    expect(await store.scan(scan.id)).toMatchObject({ status: "running" });
  });
  it("legacy rollback reuses the same start intent and executes once with frozen coordinates", async () => {
    const { db } = database(),
      store = new Store(db, "tenant", "key");
    const loc = await store.createLocation({
      name: "Fixture",
      latitude: 35.7,
      longitude: 51.4,
    });
    const input = {
        locationId: loc!.id,
        source: "okala" as const,
        threshold: 20,
        mode: "partial" as const,
      },
      key = crypto.randomUUID();
    const first = await beginLegacyScan(
      { DB: db, BOX_KEY: "key" },
      "tenant",
      input,
      key
    );
    expect(first.job).toMatchObject({
      threshold: 30,
      location: { latitude: 35.7, longitude: 51.4 },
    });
    const repeated = await beginLegacyScan(
      { DB: db, BOX_KEY: "key" },
      "tenant",
      input,
      key
    );
    expect(repeated.scan!.id).toBe(first.scan!.id);
    expect(repeated.job).toBeNull();
  });
  it("campaign raw totals allow exact repeated identities while conflicts fail incomplete", async () => {
    for (const conflict of [false, true]) {
      const { db, sqlite } = database(),
        store = new Store(db, "tenant", "key"),
        repo = new DurableRepository(db, "key");
      sqlite.exec(
        "CREATE TABLE IF NOT EXISTS product_projection_scans(user_id TEXT,scan_id TEXT PRIMARY KEY,ready INTEGER)"
      );
      const loc = await store.createLocation({
        name: "Fixture",
        latitude: 35.7,
        longitude: 51.4,
      });
      const scan = await repo.reserve(
        "tenant",
        {
          locationId: loc!.id,
          source: "snappmarket",
          threshold: 40,
          mode: "partial",
        },
        crypto.randomUUID(),
        false
      );
      await repo.started(scan.id);
      const unit: Unit = {
        id: "campaign",
        kind: "store_campaign",
        vendorId: 9,
        vendorCode: "shop",
        collectionId: 12,
        title: "Store",
      };
      await repo.freeze(scan.id, [unit], {
        ...scan.context!.manifest,
        feedKinds: ["store_campaign"],
        storeCampaigns: [{ vendorId: 9, vendorCode: "shop", collectionId: 12 }],
      });
      const product = (id: number, price = 100000) => ({
        id,
        vendor_id: 9,
        document_id: `${id}-9`,
        title: `Product ${id}`,
        price,
        discount: price / 2,
        discountRatio: 50,
        stock: 1,
        no_stock: false,
      });
      const fetcher: typeof fetch = async (input) => {
        const url = new URL(String(input));
        if (url.pathname.includes("oauth2"))
          return Response.json({
            status: true,
            data: { access_token: "fixture", expires_in: 1000 },
          });
        const p = Number(url.searchParams.get("page"));
        const rows =
          p === 0
            ? [product(1), product(2)]
            : p === 1
              ? [product(2, conflict ? 200000 : 100000), product(3)]
              : [];
        return Response.json({
          data: {
            id: 12,
            type: "default",
            count: 4,
            finalResult: rows.map((data) => ({ type: "PRODUCT", data })),
          },
        });
      };
      const steps = {
        do: async <T extends Rpc.Serializable<T>>(
          _n: string,
          a: () => Promise<T>
        ) => a(),
        sleep: async () => {},
      };
      await runDurableScan(
        { scanId: scan.id, contractVersion: 1 },
        {
          repository: repo,
          steps,
          fetcher,
          materialize: async () => {
            await db
              .prepare(
                "INSERT INTO product_projection_scans(user_id,scan_id,ready,baseline_reason,observed_at) VALUES(?,?,1,'scope_mismatch','2026-10-10T00:00:00.000Z')"
              )
              .bind("tenant", scan.id)
              .run();
          },
        }
      );
      expect(await store.scan(scan.id)).toMatchObject(
        conflict
          ? { status: "failed", errorCode: "INCOMPLETE_PAGINATION" }
          : { status: "succeeded", productCount: 3, dealCount: 3 }
      );
      if (conflict) expect(await store.deals(scan.id)).toEqual([]);
      else {
        expect(
          await readDurableComparison(db, "tenant", scan.id)
        ).toMatchObject({
          baseline: 0,
          supplementary: 3,
          union: 3,
          additional: 3,
          campaigns: [
            {
              rawCount: 4,
              uniqueCount: 3,
              qualifying: 3,
              overlap: 0,
              additional: 3,
              outcome: "net_new",
            },
          ],
        });
        expect(await readDurableComparison(db, "other", scan.id)).toBeNull();
      }
    }
  });
  it("Okala durable units preserve threshold normalization and reject unverified additional pages", async () => {
    for (const hasNextPage of [false, true]) {
      const { db, sqlite } = database(),
        store = new Store(db, "tenant", "key"),
        repo = new DurableRepository(db, "key");
      sqlite.exec(
        "CREATE TABLE IF NOT EXISTS product_projection_scans(user_id TEXT,scan_id TEXT PRIMARY KEY,ready INTEGER)"
      );
      const loc = await store.createLocation({
        name: "Fixture",
        latitude: 35.7,
        longitude: 51.4,
      });
      const scan = await repo.reserve(
        "tenant",
        {
          locationId: loc!.id,
          source: "okala",
          threshold: 20,
          mode: "partial",
        },
        crypto.randomUUID(),
        false
      );
      const fetcher: typeof fetch = async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/nearby"))
          return Response.json({
            success: true,
            data: {
              stores: [
                { storeId: 5, isActive: true, isExist: true, isServes: true },
              ],
            },
          });
        if (url.pathname.endsWith("/multi-store"))
          return Response.json({
            carousel: { id: 7 },
            hasNextPage,
            entities: [
              {
                storeId: 5,
                storeName: "Store",
                products: [
                  {
                    id: 2,
                    storeId: 5,
                    name: "Milk 1 L",
                    storeName: "Store",
                    price: 10000,
                    okPrice: 7000,
                    discountPercent: 30,
                    hasQuantity: true,
                    quantity: 1,
                  },
                ],
              },
            ],
          });
        return Response.json({
          success: true,
          carousels: [{ isMulti: true, id: 7 }],
        });
      };
      const steps = {
        do: async <T extends Rpc.Serializable<T>>(
          _n: string,
          a: () => Promise<T>
        ) => a(),
        sleep: async () => {},
      };
      await runDurableScan(
        { scanId: scan.id, contractVersion: 1 },
        {
          repository: repo,
          steps,
          fetcher,
          materialize: async () => {
            await db
              .prepare(
                "INSERT INTO product_projection_scans(user_id,scan_id,ready,baseline_reason,observed_at) VALUES(?,?,1,'scope_mismatch','2026-10-10T00:00:00.000Z')"
              )
              .bind("tenant", scan.id)
              .run();
          },
        }
      );
      expect(await store.scan(scan.id)).toMatchObject(
        hasNextPage
          ? {
              status: "failed",
              errorCode: "INCOMPLETE_PAGINATION",
              threshold: 30,
            }
          : { status: "succeeded", threshold: 30, dealCount: 1 }
      );
    }
  });
  it("ambiguous dispatch uses the same deterministic instance and a terminal scan is never recreated", async () => {
    const { db } = database(),
      store = new Store(db, "tenant", "key"),
      repo = new DurableRepository(db, "key");
    const loc = await store.createLocation({
      name: "Fixture",
      latitude: 35.7,
      longitude: 51.4,
    });
    const ids: string[] = [],
      payloads: unknown[] = [];
    let created = false;
    const instance = {
      status: async () => ({ status: "queued" }),
      terminate: async () => {},
    } as unknown as WorkflowInstance;
    const env = {
      DB: db,
      BOX_KEY: "key",
      SCAN_WORKFLOW: {
        get: async (id: string) => {
          ids.push(id);
          if (!created)
            throw Object.assign(new Error("missing"), { status: 404 });
          return instance;
        },
        create: async (options: { id: string; params: unknown }) => {
          ids.push(options.id);
          payloads.push(options.params);
          created = true;
          throw new Error("response lost");
        },
      },
    };
    const key = crypto.randomUUID(),
      input = {
        locationId: loc!.id,
        source: "snappmarket" as const,
        threshold: 40,
        mode: "partial" as const,
      };
    const first = await beginDurableScan(env, "tenant", input, key);
    await beginDurableScan(env, "tenant", input, key);
    expect(new Set(ids).size).toBe(1);
    expect(payloads).toEqual([{ scanId: first.id, contractVersion: 1 }]);
    await repo.cancel(first.id, "tenant");
    await reconcileDurableScan(env, "tenant", first.id);
    expect(payloads).toHaveLength(1);
  });
});
