import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { Hono } from "hono";
import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerScans } from "./scans";
import { registerPagedProducts } from "./products";
import type { Api, WorkerEnv } from "./types";
import type { ScanRecord } from "@better-buy/shared";

async function responseBody<T = ScanRecord>(response: Response) {
  return (await response.json()) as { data: T; activeScan: ScanRecord };
}

const collector = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../composition", () => ({ scanServices: () => Layer.empty }));
vi.mock("../application/scans", () => ({
  executeScan: () => {
    collector.calls++;
    return Effect.void;
  },
}));
const databases: DatabaseSync[] = [];
afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
  collector.calls = 0;
});
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  databases.push(sqlite);
  for (const name of readdirSync(new URL("../../migrations/", import.meta.url))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    sqlite.exec(
      readFileSync(new URL(`../../migrations/${name}`, import.meta.url), "utf8")
    );
  const locationId = crypto.randomUUID();
  sqlite
    .prepare(
      "INSERT INTO locations(id,user_id,name,latitude,longitude,created_at,updated_at) VALUES(?,'owner','Home',35.7,51.4,'2026-10-10','2026-10-10')"
    )
    .run(locationId);
  const prepare = (sql: string, values: SQLInputValue[] = []) => ({
    bind: (...args: SQLInputValue[]) => prepare(sql, args),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    run: async () => ({ meta: sqlite.prepare(sql).run(...values) }),
  });
  const db = {
    prepare,
    batch: async (statements: { run(): Promise<unknown> }[]) => {
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  const instances = new Set<string>();
  const creates: string[] = [],
    terminates: string[] = [];
  let loseCreateResponse = false,
    uncertainStatus = false;
  const instance = (id: string) => ({
    id,
    status: async () => {
      if (uncertainStatus) throw new Error("Transport unavailable");
      return { status: "running" };
    },
    terminate: async () => {
      terminates.push(id);
    },
  });
  const workflow = {
    get: async (id: string) => {
      if (!instances.has(id))
        throw Object.assign(new Error("Missing"), { status: 404 });
      return instance(id);
    },
    create: async ({ id }: { id: string }) => {
      creates.push(id);
      instances.add(id);
      if (loseCreateResponse) throw new Error("Response lost after dispatch");
      return instance(id);
    },
  } as unknown as NonNullable<WorkerEnv["SCAN_WORKFLOW"]>;
  const env = {
    DB: db,
    BOX_KEY: "fixture-only",
    SCAN_WORKFLOW: workflow,
    SCAN_WORKFLOW_ENABLED: "true",
    SCAN_WORKFLOW_CONCURRENCY: "1",
  } as WorkerEnv;
  const app: Api = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId", c.req.header("x-user") ?? "owner");
    await next();
  });
  registerPagedProducts(app);
  registerScans(app);
  const key = crypto.randomUUID();
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    user = "owner",
    intent = key
  ) =>
    app.fetch(
      new Request(`http://fixture/api/scans${path}`, {
        method,
        headers: {
          "x-user": user,
          "content-type": "application/json",
          "idempotency-key": intent,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
      {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as unknown as ExecutionContext
    );
  const input = {
    locationId,
    threshold: 40,
    source: "snappmarket",
    mode: "partial",
  };
  return {
    sqlite,
    env,
    request,
    key,
    input,
    creates,
    terminates,
    loseResponse: () => {
      loseCreateResponse = true;
    },
    loseStatus: () => {
      uncertainStatus = true;
    },
  };
}
describe("durable scan HTTP ownership and recovery", () => {
  it("reconciles a lost dispatch response and reuses the exact owned intent", async () => {
    const f = fixture();
    f.loseResponse();
    const started = await f.request("", "POST", f.input);
    expect(started.status).toBe(202);
    const record = (await responseBody(started)).data;
    expect(f.creates).toEqual([`scan-${record.id}`]);
    expect(
      (await responseBody<ScanRecord[]>(await f.request(`?intent=${f.key}`)))
        .data[0]!.id
    ).toBe(record.id);
    expect(
      (await responseBody(await f.request("", "POST", f.input))).data.id
    ).toBe(record.id);
    expect(f.creates).toHaveLength(1);
    const activeConflict = await f.request(
      "",
      "POST",
      f.input,
      "owner",
      crypto.randomUUID()
    );
    expect(activeConflict.status).toBe(409);
    expect((await responseBody(activeConflict)).activeScan.id).toBe(record.id);
    expect(
      (await f.request("", "POST", { ...f.input, threshold: 45 })).status
    ).toBe(409);
    expect(
      (
        await responseBody<ScanRecord[]>(
          await f.request(`?intent=${f.key}`, "GET", undefined, "other")
        )
      ).data
    ).toEqual([]);
    expect((await f.request("?intent=invalid")).status).toBe(400);
    expect((await f.request("?intent=")).status).toBe(400);
  });
  it("keeps uncertain engine status active, hides staging, and cancels with tenant guards", async () => {
    const f = fixture();
    const record = (await responseBody(await f.request("", "POST", f.input)))
      .data;
    f.loseStatus();
    expect(
      (await responseBody(await f.request(`/${record.id}`))).data.status
    ).toBe("queued");
    for (const suffix of [
      "",
      "/products?page=1",
      "/products/missing/offers",
      "/deals",
      "/deal-groups",
    ])
      expect(
        (await f.request(`/${record.id}${suffix}`, "GET", undefined, "other"))
          .status
      ).toBe(404);
    expect(
      (await f.request(`/${record.id}/cancel`, "POST", undefined, "other"))
        .status
    ).toBe(404);
    expect((await f.request(`/${record.id}/products?page=1`)).status).toBe(409);
    expect(
      (await responseBody<unknown[]>(await f.request(`/${record.id}/deals`)))
        .data
    ).toEqual([]);
    expect(
      (await responseBody(await f.request(`/${record.id}/cancel`, "POST"))).data
        .status
    ).toBe("cancelled");
    expect(
      (await responseBody(await f.request(`/${record.id}/cancel`, "POST"))).data
        .status
    ).toBe("cancelled");
    expect(f.terminates).toHaveLength(1);
    expect((await f.request(`/${record.id}/products?page=1`)).status).toBe(409);
  });
  it("rolls back to the bounded collector while retaining atomic start intents", async () => {
    const f = fixture();
    f.env.SCAN_WORKFLOW_ENABLED = "false";
    const first = await f.request("", "POST", f.input);
    expect(first.status).toBe(202);
    const scan = (await responseBody(first)).data;
    expect(scan).not.toHaveProperty("execution");
    expect(
      (await responseBody(await f.request("", "POST", f.input))).data.id
    ).toBe(scan.id);
    expect(collector.calls).toBe(1);
    expect(f.creates).toEqual([]);
    expect(
      (await f.request("", "POST", { ...f.input, threshold: 45 })).status
    ).toBe(409);
  });
  it("fails closed when durable execution is enabled without its binding", async () => {
    const f = fixture();
    delete f.env.SCAN_WORKFLOW;
    expect((await f.request("", "POST", f.input)).status).toBe(503);
    expect(collector.calls).toBe(0);
    expect(
      f.sqlite.prepare("SELECT COUNT(*) AS count FROM scans").get()?.count
    ).toBe(0);
  });
});
