import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { beginDurableScan } = vi.hoisted(() => ({ beginDurableScan: vi.fn() }));
vi.mock("./durable/service", () => ({ beginDurableScan }));

import { runWishlistSchedule, tehranSlot } from "./wishlist-scheduler";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE locations(id TEXT PRIMARY KEY,user_id TEXT,name TEXT,latitude REAL,longitude REAL,coordinate_revision INTEGER);
    CREATE TABLE wishlist_preferences(user_id TEXT PRIMARY KEY,default_location_id TEXT,updated_at TEXT);
    CREATE TABLE wishlist_items(id TEXT PRIMARY KEY,user_id TEXT,phrase TEXT,normalized_phrase TEXT,created_at TEXT);`);
  sqlite.exec(readFileSync("migrations/0014_wishlist_schedule.sql", "utf8"));
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: Array<string | number | null>) {
          return {
            first: async <T>() =>
              (sqlite.prepare(sql).get(...args) as T | undefined) ?? null,
            all: async <T>() => ({
              results: sqlite.prepare(sql).all(...args) as T[],
            }),
            run: async () => ({
              meta: {
                changes: Number(sqlite.prepare(sql).run(...args).changes),
              },
            }),
          };
        },
      };
    },
  } as unknown as D1Database;
  sqlite
    .prepare("INSERT INTO locations VALUES(?,?,?,?,?,?)")
    .run("home", "u1", "Home", 35.7, 51.4, 2);
  sqlite
    .prepare("INSERT INTO wishlist_preferences VALUES(?,?,?)")
    .run("u1", "home", "now");
  sqlite
    .prepare("INSERT INTO wishlist_items VALUES(?,?,?,?,?)")
    .run("w1", "u1", "milk", "milk", "now");
  const env = {
    DB: db,
    BOX_KEY: "test",
    WISHLIST_SCHEDULE_ENABLED: "true",
    SCAN_WORKFLOW: { create: vi.fn(), get: vi.fn() },
  } as unknown as import("./http/types").WorkerEnv;
  return {
    sqlite,
    env,
    count: (table: string) =>
      Number(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n),
    states: () =>
      sqlite
        .prepare(
          "SELECT source,state,last_error,scan_id FROM wishlist_scan_schedule_jobs ORDER BY source"
        )
        .all() as {
        source: string;
        state: string;
        last_error: string | null;
        scan_id: string | null;
      }[],
  };
}

const tick = (minute: number) =>
  new Date(`2026-10-26T05:${String(minute).padStart(2, "0")}:00.000Z`);

describe("wishlist scheduler integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(tick(30));
    beginDurableScan.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("drains both providers on later ticks and retries ACTIVE_SCAN_EXISTS with the same key", async () => {
    const f = fixture();
    beginDurableScan
      .mockRejectedValueOnce(
        Object.assign(new Error("busy"), { code: "ACTIVE_SCAN_EXISTS" })
      )
      .mockResolvedValueOnce({ id: "okala-scan" })
      .mockResolvedValueOnce({ id: "snapp-scan" });
    try {
      await runWishlistSchedule(f.env, tick(30));
      expect(f.states().map(({ source, state }) => [source, state])).toEqual([
        ["okala", "pending"],
        ["snappmarket", "done"],
      ]);
      vi.setSystemTime(tick(35));
      await runWishlistSchedule(f.env, tick(35));
      expect(f.states().every((job) => job.state === "done")).toBe(true);
      expect(beginDurableScan).toHaveBeenCalledTimes(3);
      expect(beginDurableScan.mock.calls[0]?.[3]).toBe(
        beginDurableScan.mock.calls[2]?.[3]
      );
    } finally {
      f.sqlite.close();
    }
  });

  it("retries the durable service's SCAN_CAPACITY error on a later tick", async () => {
    const f = fixture();
    beginDurableScan
      .mockRejectedValueOnce(
        Object.assign(new Error("capacity"), { code: "SCAN_CAPACITY" })
      )
      .mockResolvedValue({ id: "started" });
    try {
      await runWishlistSchedule(f.env, tick(30));
      expect(f.states().some((job) => job.last_error === "SCAN_CAPACITY")).toBe(
        true
      );
      vi.setSystemTime(tick(35));
      await runWishlistSchedule(f.env, tick(35));
      expect(f.states().every((job) => job.state === "done")).toBe(true);
    } finally {
      f.sqlite.close();
    }
  });

  it("recovers an abandoned claim on a later cron tick", async () => {
    const f = fixture();
    beginDurableScan.mockResolvedValue({ id: "recovered" });
    try {
      await runWishlistSchedule(f.env, tick(30));
      f.sqlite
        .prepare(
          `UPDATE wishlist_scan_schedule_jobs SET state='running',updated_at='2026-10-26T05:31:00.000Z'
        WHERE source='okala'`
        )
        .run();
      vi.setSystemTime(tick(35));
      await runWishlistSchedule(f.env, tick(35));
      expect(f.states().every((job) => job.state === "done")).toBe(true);
      expect(beginDurableScan).toHaveBeenCalledTimes(3);
    } finally {
      f.sqlite.close();
    }
  });

  it("expires jobs once their two-hour dispatch window has elapsed", async () => {
    const f = fixture();
    beginDurableScan.mockRejectedValue(
      Object.assign(new Error("busy"), { code: "ACTIVE_SCAN_EXISTS" })
    );
    try {
      await runWishlistSchedule(f.env, tick(30));
      f.sqlite
        .prepare(
          "UPDATE wishlist_scan_schedule SET created_at='2026-10-26T03:00:00.000Z'"
        )
        .run();
      vi.setSystemTime(new Date("2026-10-26T07:31:00.000Z"));
      await runWishlistSchedule(f.env, new Date("2026-10-26T07:31:00.000Z"));
      expect(
        f
          .states()
          .every(
            (job) =>
              job.state === "skipped" && job.last_error === "schedule_expired"
          )
      ).toBe(true);
      expect(beginDurableScan).toHaveBeenCalledTimes(2);
    } finally {
      f.sqlite.close();
    }
  });

  it("drains persisted jobs on non-slot ticks and skips a changed default location", async () => {
    const f = fixture();
    beginDurableScan.mockRejectedValue(
      Object.assign(new Error("active"), { code: "SCAN_IN_PROGRESS" })
    );
    try {
      await runWishlistSchedule(f.env, tick(30));
      expect(f.count("wishlist_scan_schedule_jobs")).toBe(2);
      f.sqlite
        .prepare("INSERT INTO locations VALUES(?,?,?,?,?,?)")
        .run("work", "u1", "Work", 35.8, 51.5, 1);
      f.sqlite
        .prepare(
          "UPDATE wishlist_preferences SET default_location_id='work' WHERE user_id='u1'"
        )
        .run();
      vi.setSystemTime(tick(35));
      beginDurableScan.mockClear();
      await runWishlistSchedule(f.env, tick(35));
      expect(beginDurableScan).not.toHaveBeenCalled();
      expect(f.states().every((job) => job.state === "skipped")).toBe(true);
    } finally {
      f.sqlite.close();
    }
  });

  it("does nothing while disabled and still exposes exact Tehran slot conversion", async () => {
    const f = fixture();
    try {
      (
        f.env as unknown as { WISHLIST_SCHEDULE_ENABLED: string }
      ).WISHLIST_SCHEDULE_ENABLED = "false";
      await runWishlistSchedule(f.env, tick(30));
      expect(f.count("wishlist_scan_schedule")).toBe(0);
      expect(tehranSlot(tick(30))).toMatchObject({
        date: "2026-10-26",
        name: "morning",
      });
    } finally {
      f.sqlite.close();
    }
  });
});
