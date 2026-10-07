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
  for (const name of migrations.slice(0, -1)) sqlite.exec(migration(name));
  sqlite
    .prepare("INSERT INTO locations VALUES(?,?,?,?,?,?,?,?)")
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
    OKALA_CLIENT_SECRET: "okala-secret",
    APP_ORIGIN: "http://localhost",
    ASSETS: {} as Fetcher,
  };
  return { sqlite, db, env, reads };
}

async function start(
  env: ReturnType<typeof database>["env"],
  source = "snappmarket",
  id = locationId
) {
  const tasks: Promise<unknown>[] = [];
  const response = await api.fetch(
    new Request("http://localhost/api/scans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locationId: id, source, threshold: 40 }),
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

  it("still requires Okala customer credentials", async () => {
    const { env } = database();
    const fetcher = vi.spyOn(globalThis, "fetch");
    const response = await start(env, "okala");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "TOKEN_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves Okala expired-credential refresh and encrypted settings", async () => {
    const { env } = database();
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    await store.saveProvider("okala", "expired-access-token", {
      refreshToken: "refresh-fixture",
      expiresAt: "2000-01-01",
    });
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        if (String(url).endsWith("/accounts/tokens"))
          return Response.json({
            access_token: "renewed-okala-token",
            refresh_token: "renewed-refresh",
            expires_in: 3600,
          });
        return new Response(null, { status: 403 }); // collection fails independently of renewal
      });
    expect((await start(env, "okala")).status).toBe(202);
    expect(await store.credentials("okala")).toMatchObject({
      token: "renewed-okala-token",
      refreshToken: "renewed-refresh",
    });
    expect(
      fetcher.mock.calls.every(
        ([url]) => new URL(String(url)).hostname === "apigateway.okala.com"
      )
    ).toBe(true);
  });

  it("enforces Better Buy sign-in before scanning or reading provider settings", async () => {
    const { env, sqlite } = database();
    auth.signedIn = false;
    const fetcher = vi.spyOn(globalThis, "fetch");
    expect((await start(env)).status).toBe(401);
    expect(
      (
        await api.fetch(
          new Request("http://localhost/api/settings/okala"),
          env,
          {} as ExecutionContext
        )
      ).status
    ).toBe(401);
    expect(sqlite.prepare("SELECT COUNT(*) AS c FROM scans").get()?.c).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("cannot scan another tenant's location", async () => {
    const { env, sqlite } = database();
    sqlite.prepare("UPDATE locations SET user_id='user-2'").run();
    expect((await start(env)).status).toBe(404);
    expect(sqlite.prepare("SELECT COUNT(*) AS c FROM scans").get()?.c).toBe(0);
  });

  it("preserves active scan exclusivity for credential-free Snapp", async () => {
    const { env } = database();
    await new Store(env.DB, "user-1", env.BOX_KEY).createScan(
      locationId,
      40,
      "snappmarket",
      "partial"
    );
    const response = await start(env);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "SCAN_IN_PROGRESS" });
  });
});

describe("scan state integrity through real SQLite", () => {
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
  it("maps corrupt Okala ciphertext to a safe reconnect failure without upstream access", async () => {
    const { env, sqlite } = database();
    sqlite
      .prepare(
        "INSERT INTO provider_settings(user_id,provider,encrypted_token,updated_at) VALUES(?,?,?,?)"
      )
      .run("user-1", "okala", "bad-ciphertext", "2000-01-01");
    const fetcher = vi.spyOn(globalThis, "fetch");
    const response = await start(env, "okala");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "AUTH_EXPIRED" });
    expect(fetcher).not.toHaveBeenCalled();
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
  it("does not repeat a failed Okala refresh or mutate its stored credentials", async () => {
    const { env } = database();
    const store = new Store(env.DB, "user-1", env.BOX_KEY);
    await store.saveProvider("okala", "old-token", {
      refreshToken: "refresh-fixture",
      expiresAt: "2000-01-01",
    });
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));
    const response = await start(env, "okala");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "AUTH_EXPIRED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await store.credentials("okala")).toMatchObject({
      token: "old-token",
      refreshToken: "refresh-fixture",
    });
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
    sqlite.exec(migration(migrations.at(-1)!));
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
