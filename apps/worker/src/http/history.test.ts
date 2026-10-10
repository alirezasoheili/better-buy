import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { readScanHistory } from "./history";

describe("saved history cursor ownership", () => {
  it("pages tied timestamps after filtering and reports the account's other active location", async () => {
    const sqlite = new DatabaseSync(":memory:");
    for (const name of readdirSync(
      new URL("../../migrations/", import.meta.url)
    )
      .filter((name) => name.endsWith(".sql"))
      .sort())
      sqlite.exec(
        readFileSync(
          new URL(`../../migrations/${name}`, import.meta.url),
          "utf8"
        )
      );
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: SQLInputValue[]) => ({
          first: async () => sqlite.prepare(sql).get(...args) ?? null,
          all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
        }),
      }),
    } as unknown as D1Database;
    try {
      for (const [id, user] of [
        ["home", "owner"],
        ["office", "owner"],
        ["foreign", "other"],
      ] as const)
        sqlite
          .prepare(
            "INSERT INTO locations(id,user_id,name,latitude,longitude,created_at,updated_at) VALUES(?,?,?,35.7,51.4,?,?)"
          )
          .run(id, user, id, "2026-10-10T08:00:00Z", "2026-10-10T08:00:00Z");
      for (const [id, location, user, source, status] of [
        ["run-01", "home", "owner", "snappmarket", "succeeded"],
        ["run-02", "home", "owner", "snappmarket", "succeeded"],
        ["run-03", "home", "owner", "snappmarket", "succeeded"],
        ["active", "office", "owner", "okala", "running"],
        ["jet-history", "home", "owner", "digikalajet", "succeeded"],
        ["foreign-run", "foreign", "other", "snappmarket", "succeeded"],
      ] as const)
        sqlite
          .prepare(
            "INSERT INTO scans(id,user_id,location_id,threshold,source,mode,status,created_at) VALUES(?,?,?,40,?,'partial',?,?)"
          )
          .run(id, user, location, source, status, "2026-10-10T08:00:00Z");
      const query = { locationId: "home", source: "snappmarket", limit: "2" };
      const first = await readScanHistory(db, "owner", "fixture-key", query);
      expect(first.items.map((row) => row.id)).toEqual(["run-03", "run-02"]);
      expect(first.activeScan?.id).toBe("active");
      const second = await readScanHistory(db, "owner", "fixture-key", {
        ...query,
        cursor: first.nextCursor!,
      });
      expect(second.items.map((row) => row.id)).toEqual(["run-01"]);
      expect(second.nextCursor).toBeNull();
      for (const changed of [
        { ...query, source: "okala" },
        { ...query, locationId: "office" },
      ])
        await expect(
          readScanHistory(db, "owner", "fixture-key", {
            ...changed,
            cursor: first.nextCursor!,
          })
        ).rejects.toThrow("INVALID_CURSOR");
      await expect(
        readScanHistory(db, "other", "fixture-key", {
          ...query,
          cursor: first.nextCursor!,
        })
      ).rejects.toThrow("INVALID_CURSOR");
      await expect(
        readScanHistory(db, "owner", "wrong-key", {
          ...query,
          cursor: first.nextCursor!,
        })
      ).rejects.toThrow("INVALID_CURSOR");
      expect(
        (
          await readScanHistory(db, "owner", "fixture-key", {
            source: "digikalajet",
          })
        ).items[0]?.context
      ).toBeNull();
    } finally {
      sqlite.close();
    }
  });
});
