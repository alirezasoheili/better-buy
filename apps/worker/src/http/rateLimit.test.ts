import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { cleanupRateLimits, consumeRateLimit } from "./rateLimit";

describe("authenticated API quotas across callers", () => {
  it("atomically bounds starts, isolates tenants/read/cancel, and expires windows", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(
      readFileSync(
        new URL("../../migrations/0009_api_rate_limits.sql", import.meta.url),
        "utf8"
      )
    );
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: SQLInputValue[]) => ({
          first: async () => sqlite.prepare(sql).get(...args) ?? null,
          run: async () => ({ meta: sqlite.prepare(sql).run(...args) }),
        }),
      }),
    } as unknown as D1Database;
    try {
      const attempts = await Promise.all(
        Array.from({ length: 9 }, () =>
          consumeRateLimit(db, "a", "POST", "/api/scans", 65_000)
        )
      );
      expect(attempts.filter((value) => value === null)).toHaveLength(5);
      expect(attempts.filter((value) => value !== null)).toEqual([
        55, 55, 55, 55,
      ]);
      expect(
        await consumeRateLimit(db, "b", "POST", "/api/scans", 65_000)
      ).toBeNull();
      expect(
        await consumeRateLimit(db, "a", "GET", "/api/scans", 65_000)
      ).toBeNull();
      expect(
        await consumeRateLimit(db, "a", "POST", "/api/scans/id/cancel", 65_000)
      ).toBeNull();
      expect(
        await consumeRateLimit(db, "a", "POST", "/api/scans", 120_000)
      ).toBeNull();
      await cleanupRateLimits(db, 172_800_000);
      expect(
        sqlite.prepare("SELECT COUNT(*) AS count FROM api_rate_limits").get()
          ?.count
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });
});
