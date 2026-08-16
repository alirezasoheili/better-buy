import { describe, expect, it } from "vitest";
import { createHMAC } from "@better-auth/utils/hmac";
import { issueTestSession, signSessionToken } from "./test-login";

type D1Like = Parameters<typeof issueTestSession>[0];

const verify = () => createHMAC("SHA-256", "base64urlnopad");

type Row = Record<string, string | number | null>;

function makeDb() {
  const tables: Record<string, Row[]> = { user: [], session: [], locations: [] };
  const calls: string[] = [];
  return {
    tables,
    calls,
    prepare(sql: string) {
      calls.push(sql);
      return {
        bind(...args: (string | number | null)[]) {
          return {
            first: async () => {
              const tableMatch = /FROM\s+"?(\w+)"?/i.exec(sql);
              const whereMatch = /WHERE\s+"?(\w+)"?\s*=\s*\?/i.exec(sql);
              if (!tableMatch || !whereMatch) return null;
              const tableName = tableMatch[1]!;
              const whereCol = whereMatch[1]!;
              const row = tables[tableName]?.find(
                (entry) => entry[whereCol] === args[0],
              );
              return row ? { ...row } : null;
            },
            run: async () => {
              const insert = /INSERT INTO\s+"?(\w+)"?\s*\(([^)]+)\)\s*VALUES/i.exec(sql);
              if (insert) {
                const tableName = insert[1]!;
                const cols = insert[2]!.split(",").map((col) => col.trim().replace(/"/g, ""));
                const row: Row = {};
                cols.forEach((col, index) => {
                  row[col] = args[index] ?? null;
                });
                tables[tableName]?.push(row);
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
}

describe("signSessionToken", () => {
  it("produces a signature Better Auth accepts", async () => {
    const token = crypto.randomUUID();
    const signature = await signSessionToken("change-me", token);
    await expect(
      verify().verify("change-me", token, signature),
    ).resolves.toBe(true);
  });
  it("rejects a tampered signature", async () => {
    const signature = await signSessionToken("change-me", "token-a");
    await expect(
      verify().verify("change-me", "token-b", signature),
    ).resolves.toBe(false);
  });
});

describe("issueTestSession", () => {
  it("seeds a user, location and session, returning a valid signed cookie", async () => {
    const db = makeDb();
    const cookie = await issueTestSession(db as unknown as D1Like, "change-me");
    expect(cookie.startsWith("better-auth.session_token=")).toBe(true);

    const value = cookie.split(";")[0]!.split("=").slice(1).join("=");
    const [token, signature] = value.split(".");
    expect(token).toBeDefined();
    expect(signature).toBeDefined();
    await expect(verify().verify("change-me", token!, signature!)).resolves.toBe(true);

    const sessions = db.tables.session!;
    expect(db.tables.user).toHaveLength(1);
    expect(db.tables.locations).toHaveLength(1);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.token).toBe(token);
  });

  it("reuses the user and location on subsequent calls", async () => {
    const db = makeDb();
    await issueTestSession(db as unknown as D1Like, "change-me");
    await issueTestSession(db as unknown as D1Like, "change-me");

    expect(db.tables.user).toHaveLength(1);
    expect(db.tables.locations).toHaveLength(1);
    const sessions = db.tables.session!;
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.token).not.toBe(sessions[1]!.token);
  });
});
