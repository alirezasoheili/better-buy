import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { api } from "./index";

const databases: DatabaseSync[] = [];
const origin = "http://127.0.0.1:8787";
function setup(devMode = "true", appOrigin = origin) {
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
    APP_ORIGIN: appOrigin,
    CORS_ORIGIN: appOrigin,
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
  it("allows split-dev browsers to read login and session responses", async () => {
    const appOrigin = "http://127.0.0.1:3000";
    const { request } = setup("true", appOrigin);
    const login = await request("/api/auth/test-login", {
      method: "POST",
      headers: { Origin: appOrigin },
    });
    expect(login.status).toBe(200);
    expect(login.headers.get("access-control-allow-origin")).toBe(appOrigin);
    expect(login.headers.get("access-control-allow-credentials")).toBe("true");
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const session = await request("/api/auth/get-session", {
      headers: { Origin: appOrigin, cookie },
    });
    expect(session.status).toBe(200);
    expect(session.headers.get("access-control-allow-origin")).toBe(appOrigin);
    expect(session.headers.get("access-control-allow-credentials")).toBe(
      "true"
    );
    expect(await session.json()).not.toBeNull();
  });

  it("allows development login preflight only for the configured origin", async () => {
    const appOrigin = "http://127.0.0.1:3000";
    const { request } = setup("true", appOrigin);
    const preflight = await request("/api/auth/test-login", {
      method: "OPTIONS",
      headers: {
        Origin: appOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      appOrigin
    );
    const rejected = await request("/api/auth/get-session", {
      headers: {
        Origin: "https://untrusted.example",
      },
    });
    expect(rejected.headers.has("access-control-allow-origin")).toBe(false);
    expect(rejected.headers.has("access-control-allow-credentials")).toBe(
      false
    );
  });

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
