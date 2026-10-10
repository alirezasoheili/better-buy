import { z } from "zod";
import { Store } from "../store";
import { identityDigest } from "@better-buy/shared";

export class HistoryInputError extends Error {}
const querySchema = z.object({
  locationId: z.string().min(1).max(100).optional(),
  source: z.enum(["snappmarket", "okala", "digikalajet"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(2000).optional(),
});
const positionSchema = z
  .object({
    v: z.literal(1),
    context: z.string(),
    createdAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
    id: z.string().min(1).max(100),
  })
  .strict();
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
const decode = (value: string) =>
  Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (character) => character.charCodeAt(0)
  );

export async function readScanHistory(
  db: D1Database,
  userId: string,
  boxKey: string,
  input: Record<string, string | undefined>
) {
  const parsed = querySchema.safeParse(input);
  if (!parsed.success) throw new HistoryInputError("INVALID_INPUT");
  const query = parsed.data;
  const context = await identityDigest([
    userId,
    query.locationId ?? null,
    query.source ?? null,
  ]);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`history-v1:${boxKey}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  let before: { createdAt: string; id: string } | undefined;
  if (query.cursor) {
    try {
      const parts = query.cursor.split(".");
      if (
        parts.length !== 2 ||
        !(await crypto.subtle.verify(
          "HMAC",
          key,
          decode(parts[1]!),
          decode(parts[0]!)
        ))
      )
        throw new Error();
      const position = positionSchema.parse(
        JSON.parse(
          new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
            decode(parts[0]!)
          )
        )
      );
      if (position.context !== context) throw new Error();
      before = position;
    } catch {
      throw new HistoryInputError("INVALID_CURSOR");
    }
  }
  const store = new Store(db, userId, boxKey);
  const rows = await store.scans({
    locationId: query.locationId,
    source: query.source,
    before,
    limit: query.limit + 1,
  });
  const items = rows.slice(0, query.limit),
    last = items.at(-1);
  let nextCursor: string | null = null;
  if (rows.length > query.limit && last) {
    const position = new TextEncoder().encode(
      JSON.stringify({ v: 1, context, createdAt: last.createdAt, id: last.id })
    );
    nextCursor = `${encode(position)}.${encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, position)))}`;
  }
  const active = await store.activeScan();
  return {
    items,
    nextCursor,
    activeScan: active ? await store.scan(active.id) : null,
  };
}
