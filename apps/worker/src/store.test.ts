import { describe, expect, it } from "vitest";
import { Store } from "./store";

type Row = Record<string, string | number | null>;

class InMemoryD1 {
  locations: Row[] = [];
  scans: Row[] = [];
  deals: Row[] = [];

  prepare(sql: string) {
    return {
      bind: (...args: Array<string | number | null>) => {
        return {
          first: async <T>() => this.first<T>(sql, args),
          all: async <T>() => ({ results: this.all<T>(sql, args) }),
          run: async () => this.run(sql, args),
        };
      },
    };
  }

  async batch(statements: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  private first<T>(sql: string, args: Array<string | number | null>) {
    if (/SELECT id FROM locations/i.test(sql)) {
      const userId = args[0];
      const id = args[1];
      return this.locations.find(
        (row) => row.user_id === userId && row.id === id,
      ) as T | undefined;
    }
    if (/SELECT COUNT\(\*\) AS c FROM locations/i.test(sql)) {
      return { c: this.locations.filter((row) => row.user_id === args[0]).length } as T;
    }
    if (/SELECT 1 FROM scans WHERE/i.test(sql)) {
      const [userId, locationId] = args;
      return this.scans.find(
        (row) =>
          row.user_id === userId &&
          row.location_id === locationId &&
          (row.status === "queued" || row.status === "running"),
      ) as T | undefined;
    }
    if (/FROM locations/i.test(sql)) {
      const userId = args[0];
      const id = args[1];
      return this.locations.find(
        (row) => row.user_id === userId && (id == null || row.id === id),
      ) as T | undefined;
    }
    if (/FROM scans s JOIN locations/i.test(sql)) {
      const userId = args[0];
      const id = args[1];
      const scan = this.scans.find(
        (row) => row.user_id === userId && row.id === id,
      );
      if (!scan) return undefined;
      const location = this.locations.find(
        (row) =>
          row.id === scan.location_id &&
          (!/l\.user_id\s*=\s*s\.user_id/i.test(sql) ||
            row.user_id === scan.user_id),
      );
      return location
        ? ({ ...scan, location_name: location.name } as T)
        : undefined;
    }
    return undefined;
  }

  private all<T>(sql: string, args: Array<string | number | null>) {
    if (/FROM locations/i.test(sql)) {
      const userId = args[0];
      return this.locations.filter((row) => row.user_id === userId) as T[];
    }
    if (/FROM scans s JOIN locations/i.test(sql)) {
      const userId = args[0];
      return this.scans.flatMap((scan) => {
        if (scan.user_id !== userId) return [];
        const location = this.locations.find(
          (row) =>
            row.id === scan.location_id &&
            (!/l\.user_id\s*=\s*s\.user_id/i.test(sql) ||
              row.user_id === scan.user_id),
        );
        return location ? [{ ...scan, location_name: location.name } as T] : [];
      });
    }
    return [] as T[];
  }

  private run(sql: string, args: Array<string | number | null>) {
    if (/DELETE FROM deals/i.test(sql)) {
      const [userId, locationId] = args;
      const scanIds = new Set(
        this.scans
          .filter((row) => row.user_id === userId && row.location_id === locationId)
          .map((row) => row.id),
      );
      const before = this.deals.length;
      this.deals = this.deals.filter((row) => !scanIds.has(row.scan_id));
      return { meta: { changes: before - this.deals.length } };
    }
    if (/DELETE FROM scans/i.test(sql)) {
      const [userId, locationId] = args;
      const before = this.scans.length;
      this.scans = this.scans.filter(
        (row) => !(row.user_id === userId && row.location_id === locationId),
      );
      return { meta: { changes: before - this.scans.length } };
    }
    if (/DELETE FROM locations/i.test(sql)) {
      const [userId, id] = args;
      const before = this.locations.length;
      this.locations = this.locations.filter(
        (row) => !(row.user_id === userId && row.id === id),
      );
      return { meta: { changes: before - this.locations.length } };
    }
    return { meta: { changes: 1 } };
  }
}

const location = (
  id: string,
  userId: string,
  name: string,
): Row => ({
  id,
  user_id: userId,
  name,
  latitude: 35.7,
  longitude: 51.4,
  is_default: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});

describe("Store location and scan read seams", () => {
  it("does not hide a user-created location because it matches the old default values", async () => {
    const db = new InMemoryD1();
    db.locations.push({
      ...location("home", "user-1", "تهران — خانه"),
      latitude: 35.7285,
      longitude: 51.309056,
    });

    const records = await new Store(
      db as unknown as D1Database,
      "user-1",
      "box-key",
    ).locations();

    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe("home");
  });

  it("joins a scan to a location owned by the same tenant", async () => {
    const db = new InMemoryD1();
    db.locations.push(
      location("shared-id", "user-2", "Other tenant"),
      location("shared-id", "user-1", "My location"),
    );
    db.scans.push({
      id: "scan-1",
      user_id: "user-1",
      location_id: "shared-id",
      threshold: 40,
      source: "snappmarket",
      mode: "partial",
      status: "succeeded",
      started_at: null,
      finished_at: "2026-01-01T00:01:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      vendor_count: 1,
      product_count: 1,
      deal_count: 1,
      error_code: null,
      error_message: null,
    });

    const record = await new Store(
      db as unknown as D1Database,
      "user-1",
      "box-key",
    ).scan("scan-1");

    expect(record?.locationName).toBe("My location");
  });

  it("cascades a location deletion through its scan history and deals", async () => {
    const db = new InMemoryD1();
    db.locations.push(
      location("home", "user-1", "Home"),
      location("office", "user-1", "Office"),
    );
    db.scans.push(
      {
        id: "scan-home",
        user_id: "user-1",
        location_id: "home",
      },
      {
        id: "scan-office",
        user_id: "user-1",
        location_id: "office",
      },
    );
    db.deals.push(
      { id: "deal-home", scan_id: "scan-home" },
      { id: "deal-office", scan_id: "scan-office" },
    );

    const result = await new Store(
      db as unknown as D1Database,
      "user-1",
      "box-key",
    ).deleteLocation("home");

    expect(result).toBe("deleted");
    expect(db.locations.map((row) => row.id)).toEqual(["office"]);
    expect(db.scans.map((row) => row.id)).toEqual(["scan-office"]);
    expect(db.deals.map((row) => row.id)).toEqual(["deal-office"]);
  });

  it("defers deletion while that location has an active scan", async () => {
    const db = new InMemoryD1();
    db.locations.push(
      location("home", "user-1", "Home"),
      location("office", "user-1", "Office"),
    );
    db.scans.push({
      id: "scan-home",
      user_id: "user-1",
      location_id: "home",
      status: "running",
    });

    const result = await new Store(
      db as unknown as D1Database,
      "user-1",
      "box-key",
    ).deleteLocation("home");

    expect(result).toBe("active");
    expect(db.locations.map((row) => row.id)).toEqual(["home", "office"]);
  });
});
