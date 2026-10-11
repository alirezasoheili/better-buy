import type { CartLine, CartResponse, CartSource } from "@better-buy/shared";
import { productSummarySchema, vendorOfferSchema } from "@better-buy/shared";
import { Store } from "./store";
import { publishedProjection, SavedProductsError } from "./saved-products";
import {
  recommendCart,
  type CartOffer,
  type CartOfferLine,
} from "./cart-recommendations";

export class CartError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 404 | 409 | 503
  ) {
    super(code);
  }
}
type CartRow = CartLine & {
  user_id: string;
  source: CartSource;
  category_title: string | null;
};
type LocationRow = {
  id: string;
  coordinate_revision: number;
  latitude: number;
  longitude: number;
};
type ScanRow = {
  id: string;
  context_json: string | null;
  finished_at: string | null;
  created_at: string;
};
type OfferRow = {
  offer_json: string;
  conditional: number;
  presence: number;
  vendor_id: string;
};

function mapLine(row: CartRow): CartLine {
  return {
    key: row.key,
    title: row.title,
    image: row.image,
    categoryTitle: row.category_title,
    quantity: row.quantity,
  };
}
async function locationFor(
  db: D1Database,
  userId: string,
  locationId?: string
): Promise<LocationRow | null> {
  const sql = locationId
    ? "SELECT id,coordinate_revision,latitude,longitude FROM locations WHERE user_id=? AND id=?"
    : "SELECT id,coordinate_revision,latitude,longitude FROM locations WHERE user_id=? ORDER BY is_default DESC,created_at LIMIT 1";
  return db
    .prepare(sql)
    .bind(...(locationId ? [userId, locationId] : [userId]))
    .first<LocationRow>();
}
function currentContext(scan: ScanRow, location: LocationRow) {
  if (!scan.context_json) return null;
  try {
    const context = JSON.parse(scan.context_json) as {
      location?: { revision?: number; latitude?: number; longitude?: number };
      coverage?: string;
    };
    if (
      context.location?.revision !== location.coordinate_revision ||
      context.location.latitude !== location.latitude ||
      context.location.longitude !== location.longitude
    )
      return null;
    return context;
  } catch {
    return null;
  }
}
async function currentScan(
  db: D1Database,
  userId: string,
  source: CartSource,
  location: LocationRow
): Promise<{
  scan: ScanRow;
  context: NonNullable<ReturnType<typeof currentContext>>;
} | null> {
  const rows = (
    await db
      .prepare(
        "SELECT id,context_json,finished_at,created_at FROM scans WHERE user_id=? AND location_id=? AND source=? AND status='succeeded' ORDER BY finished_at DESC,created_at DESC,id DESC"
      )
      .bind(userId, location.id, source)
      .all<ScanRow>()
  ).results;
  for (const scan of rows) {
    const context = currentContext(scan, location);
    if (context) return { scan, context };
  }
  return null;
}
async function cartLines(db: D1Database, userId: string, source: CartSource) {
  const rows = (
    await db
      .prepare(
        "SELECT user_id,source,group_key AS key,title,image,category_title,quantity FROM provider_carts WHERE user_id=? AND source=? ORDER BY created_at,group_key"
      )
      .bind(userId, source)
      .all<CartRow>()
  ).results;
  return rows.map(mapLine);
}
async function offersFor(
  db: D1Database,
  userId: string,
  scanId: string,
  lines: readonly CartLine[]
): Promise<CartOfferLine[]> {
  const keys = lines.map((line) => line.key);
  if (!keys.length) return [];
  const rows = (
    await db
      .prepare(
        "SELECT group_key,summary_json FROM saved_products WHERE user_id=? AND scan_id=? AND group_key IN (SELECT value FROM json_each(?))"
      )
      .bind(userId, scanId, JSON.stringify(keys))
      .all<{ group_key: string; summary_json: string }>()
  ).results;
  const summaries = new Map(
    rows.map((row) => [
      row.group_key,
      productSummarySchema.parse(JSON.parse(row.summary_json)),
    ])
  );
  const offerRows = (
    await db
      .prepare(
        "SELECT group_key,offer_json,conditional,presence,vendor_id FROM saved_product_offers WHERE user_id=? AND scan_id=? AND group_key IN (SELECT value FROM json_each(?)) AND conditional=0 AND presence=0"
      )
      .bind(userId, scanId, JSON.stringify(keys))
      .all<OfferRow & { group_key: string }>()
  ).results;
  const byGroup = new Map<string, CartOffer[]>();
  for (const row of offerRows) {
    const offer = vendorOfferSchema.parse(JSON.parse(row.offer_json));
    if (
      offer.benefit?.kind === "conditional" ||
      offer.benefit?.applicable === false
    )
      continue;
    const current: CartOffer = {
      vendorId: offer.vendorId,
      vendorCode: offer.vendorCode,
      vendorTitle: offer.vendorTitle,
      logoUrl: offer.logoUrl ?? null,
      priceRials: Number(offer.finalPriceRials),
      stock: Number(offer.stock),
    };
    const list = byGroup.get(row.group_key) ?? [];
    list.push(current);
    byGroup.set(row.group_key, list);
  }
  return lines.map((line) => {
    const summary = summaries.get(line.key);
    const presentation = summary
      ? {
          ...line,
          title: summary.title,
          image: summary.image,
          categoryTitle: summary.categoryTitle,
        }
      : line;
    return { line: presentation, offers: byGroup.get(line.key) ?? [] };
  });
}

export async function readProviderCart(
  db: D1Database,
  userId: string,
  source: CartSource,
  locationId?: string
): Promise<CartResponse> {
  const lines = await cartLines(db, userId, source);
  const location = await locationFor(db, userId, locationId);
  if (!location) {
    if (locationId) throw new CartError("NOT_FOUND", 404);
    return {
      source,
      locationId: null,
      scanId: null,
      observedAt: null,
      coverage: "legacy_unverified",
      lines,
      recommendation: recommendCart(
        lines.map((line) => ({ line, offers: [] })),
        { scanAvailable: false }
      ),
    };
  }
  const selected = await currentScan(db, userId, source, location);
  if (!selected)
    return {
      source,
      locationId: location.id,
      scanId: null,
      observedAt: null,
      coverage: "legacy_unverified",
      lines,
      recommendation: recommendCart(
        lines.map((line) => ({ line, offers: [] })),
        { scanAvailable: false }
      ),
    };
  try {
    const published = await publishedProjection(db, userId, selected.scan.id);
    const recommendation = recommendCart(
      await offersFor(db, userId, selected.scan.id, lines)
    );
    return {
      source,
      locationId: location.id,
      scanId: selected.scan.id,
      observedAt: published.p.observed_at,
      coverage:
        selected.context.coverage === "complete"
          ? "supported_discount_feeds"
          : "legacy_unverified",
      lines,
      recommendation,
    };
  } catch (error) {
    if (
      error instanceof SavedProductsError &&
      error.code === "PROJECTION_PENDING"
    )
      throw error;
    throw error;
  }
}

async function validateOrigin(
  db: D1Database,
  userId: string,
  source: CartSource,
  scanId: string,
  groupKey: string
) {
  const store = new Store(db, userId, "");
  const scan = await store.scan(scanId);
  if (!scan || scan.source !== source) throw new CartError("NOT_FOUND", 404);
  if (scan.status !== "succeeded")
    throw new CartError("SCAN_NOT_PUBLISHED", 409);
  const location = await locationFor(db, userId, scan.locationId);
  if (
    !location ||
    !scan.context ||
    scan.context.location.revision !== location.coordinate_revision ||
    scan.context.location.latitude !== location.latitude ||
    scan.context.location.longitude !== location.longitude
  )
    throw new CartError("STALE_SCAN", 409);
  await publishedProjection(db, userId, scanId);
  const row = await db
    .prepare(
      "SELECT summary_json FROM saved_products WHERE user_id=? AND scan_id=? AND group_key=?"
    )
    .bind(userId, scanId, groupKey)
    .first<{ summary_json: string }>();
  if (!row) throw new CartError("NOT_FOUND", 404);
  const summary = productSummarySchema.parse(JSON.parse(row.summary_json));
  const eligible = await db
    .prepare(
      "SELECT 1 AS ok FROM saved_product_offers WHERE user_id=? AND scan_id=? AND group_key=? AND conditional=0 AND presence=0 AND CAST(json_extract(offer_json,'$.stock') AS REAL)>=? AND COALESCE(json_extract(offer_json,'$.benefit.kind'),'standard_discount')!='conditional' AND COALESCE(json_extract(offer_json,'$.benefit.applicable'),1)!=0 LIMIT 1"
    )
    .bind(userId, scanId, groupKey, 1)
    .first<{ ok: number }>();
  if (!eligible) throw new CartError("PRODUCT_UNAVAILABLE", 409);
  return { scan, summary };
}

export async function putCartItem(
  db: D1Database,
  userId: string,
  source: CartSource,
  groupKey: string,
  scanId: string,
  quantity: number
): Promise<void> {
  const { summary } = await validateOrigin(
    db,
    userId,
    source,
    scanId,
    groupKey
  );
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT INTO provider_carts(user_id,source,group_key,title,image,category_title,quantity,origin_scan_id,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM provider_carts WHERE user_id=? AND source=? AND group_key=?) OR (SELECT COUNT(*) FROM provider_carts WHERE user_id=? AND source=?)<24
    ON CONFLICT(user_id,source,group_key) DO UPDATE SET title=excluded.title,image=excluded.image,category_title=excluded.category_title,quantity=excluded.quantity,origin_scan_id=excluded.origin_scan_id,updated_at=excluded.updated_at`
    )
    .bind(
      userId,
      source,
      groupKey,
      summary.title,
      summary.image,
      summary.categoryTitle,
      quantity,
      scanId,
      now,
      now,
      userId,
      source,
      groupKey,
      userId,
      source
    )
    .run();
  if (!result.meta.changes) throw new CartError("CART_LIMIT", 409);
}
export async function updateCartItem(
  db: D1Database,
  userId: string,
  source: CartSource,
  groupKey: string,
  quantity: number
): Promise<void> {
  const result = await db
    .prepare(
      "UPDATE provider_carts SET quantity=?,updated_at=? WHERE user_id=? AND source=? AND group_key=?"
    )
    .bind(quantity, new Date().toISOString(), userId, source, groupKey)
    .run();
  if (!result.meta.changes) throw new CartError("NOT_FOUND", 404);
}
export async function deleteCartItem(
  db: D1Database,
  userId: string,
  source: CartSource,
  groupKey: string
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM provider_carts WHERE user_id=? AND source=? AND group_key=?"
    )
    .bind(userId, source, groupKey)
    .run();
}
