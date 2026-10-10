import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { api } from "./index";

const databases: DatabaseSync[] = [];
const origin = "http://127.0.0.1:8787";
function setup(devMode = "true") {
  const sqlite = new DatabaseSync(":memory:");
  databases.push(sqlite);
  for (const file of readdirSync(new URL("../migrations/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    sqlite.exec(
      readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8")
    );
  }
  function statement(sql: string, args: SQLInputValue[] = []) {
    return {
      bind: (...values: SQLInputValue[]) => statement(sql, values),
      first: async () => sqlite.prepare(sql).get(...args) ?? null,
      all: async () => ({
        results: sqlite.prepare(sql).all(...args),
        success: true,
        meta: {},
      }),
      run: async () => ({
        success: true,
        meta: sqlite.prepare(sql).run(...args),
      }),
    };
  }
  const db = {
    prepare: (sql: string) => statement(sql),
    exec: async (sql: string) => sqlite.exec(sql),
    batch: async (statements: ReturnType<typeof statement>[]) =>
      Promise.all(statements.map((s) => s.all())),
  } as unknown as D1Database;
  const env = {
    DB: db,
    ASSETS: {} as Fetcher,
    BOX_KEY: "local-integration-box-key",
    BETTER_AUTH_SECRET: "local-integration-secret-at-least-32-characters",
    BETTER_AUTH_URL: origin,
    APP_ORIGIN: origin,
    CORS_ORIGIN: origin,
    GOOGLE_CLIENT_ID: "fixture.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "fixture",
    DEV_MODE: devMode,
  };
  const request = (path: string, init?: RequestInit) =>
    api.fetch(new Request(origin + path, init), env);
  return { sqlite, request };
}
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

describe("development login with the real Better Auth session reader", () => {
  it("accepts the issued browser cookie for session reads and protected application routes", async () => {
    const { request } = setup();
    const login = await request("/api/auth/test-login", { method: "POST" });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const session = await request("/api/auth/get-session", {
      headers: { cookie },
    });
    expect(session.status).toBe(200);
    const body = (await session.json()) as {
      user: { id: string };
      session: { userId: string };
    };
    expect(body).not.toBeNull();
    expect(body.session.userId).toBe(body.user.id);
    const me = await request("/api/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ data: { id: body.user.id } });
  });

  it("rejects a tampered cookie and requests without a session", async () => {
    const { request } = setup();
    const login = await request("/api/auth/test-login", { method: "POST" });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const [name, value] = [
      cookie.slice(0, cookie.indexOf("=")),
      cookie.slice(cookie.indexOf("=") + 1),
    ];
    const tampered = `${name}=${encodeURIComponent("tampered." + decodeURIComponent(value).split(".").at(-1))}`;
    const session = await request("/api/auth/get-session", {
      headers: { cookie: tampered },
    });
    expect(await session.json()).toBeNull();
    expect(
      (await request("/api/me", { headers: { cookie: tampered } })).status
    ).toBe(401);
    expect((await request("/api/me")).status).toBe(401);
  });

  it("keeps development login unavailable when DEV_MODE is disabled", async () => {
    const { request, sqlite } = setup("false");
    const login = await request("/api/auth/test-login", { method: "POST" });
    expect(login.status).toBe(404);
    expect(login.headers.has("set-cookie")).toBe(false);
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM "user"').get()!.count
    ).toBe(0);
  });
});
