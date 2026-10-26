import { productSummarySchema } from "@better-buy/shared";
import { publishedProjection, SavedProductsError } from "./saved-products";
import { drainPushDeliveries } from "./wishlist-push";
import type { WorkerEnv } from "./http/types";

export type WishlistItem = { id: string; phrase: string; createdAt: string };
export type WishlistMatch = {
  phrase: string;
  title: string;
  price: number;
  discountPercent: number;
  url: string;
  source: string;
};

export async function readWishlist(db: D1Database, userId: string) {
  return (
    await db
      .prepare(
        "SELECT id,phrase,created_at AS createdAt FROM wishlist_items WHERE user_id=? ORDER BY created_at,id"
      )
      .bind(userId)
      .all<WishlistItem>()
  ).results;
}

export async function readNotifications(db: D1Database, userId: string) {
  const rows = (
    await db
      .prepare(
        "SELECT * FROM wishlist_notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 50"
      )
      .bind(userId)
      .all<{
        id: string;
        scan_id: string;
        location_id: string;
        title: string;
        body: string;
        matches_json: string;
        created_at: string;
        read_at: string | null;
      }>()
  ).results;
  return rows.map((row) => ({
    id: row.id,
    scanId: row.scan_id,
    locationId: row.location_id,
    title: row.title,
    body: row.body,
    matches: JSON.parse(row.matches_json) as WishlistMatch[],
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
}

export async function notifyWishlistScan(
  db: D1Database,
  userId: string,
  scanId: string,
  timestamp = Date.now()
) {
  const now = new Date(timestamp).toISOString();
  const token = crypto.randomUUID();
  const claim = await db
    .prepare(
      "INSERT INTO wishlist_scan_receipts(scan_id,lease_token,lease_until) VALUES(?,?,?) ON CONFLICT(scan_id) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until WHERE completed=0 AND lease_until<=? RETURNING scan_id"
    )
    .bind(scanId, token, new Date(timestamp + 120_000).toISOString(), now)
    .first();
  if (!claim) return;
  try {
    const { scan } = await publishedProjection(db, userId, scanId);
    const items = (
      await db
        .prepare(
          "SELECT id,phrase,tokens_json FROM wishlist_items WHERE user_id=? AND created_at<=? ORDER BY created_at,id LIMIT 30"
        )
        .bind(userId, scan.createdAt)
        .all<{ id: string; phrase: string; tokens_json: string }>()
    ).results;
    const scope = JSON.stringify([
      scan.source,
      scan.locationId,
      scan.context?.location.revision ?? null,
      scan.context?.location.latitude ?? null,
      scan.context?.location.longitude ?? null,
    ]);
    const matches: WishlistMatch[] = [];
    const observations: { itemId: string; productId: string; price: number }[] =
      [];
    for (const item of items) {
      const tokens = JSON.parse(item.tokens_json) as string[];
      const products = (
        await db
          .prepare(
            "SELECT summary_json FROM saved_products WHERE user_id=? AND scan_id=? AND presence=0 " +
              tokens.map(() => "AND instr(title_sort,?)>0 ").join("") +
              "ORDER BY rank_price,group_key LIMIT 3"
          )
          .bind(userId, scanId, ...tokens)
          .all<{ summary_json: string }>()
      ).results;
      for (const row of products) {
        const product = productSummarySchema.parse(
          JSON.parse(row.summary_json)
        );
        const offer = product.bestCurrentOffer;
        if (!offer || offer.stock <= 0) continue;
        const productId = offer.productVariationId;
        const seen = await db
          .prepare(
            "SELECT price FROM wishlist_seen WHERE user_id=? AND wishlist_id=? AND scope=? AND product_id=?"
          )
          .bind(userId, item.id, scope, productId)
          .first<{ price: number }>();
        observations.push({
          itemId: item.id,
          productId,
          price: offer.finalPriceRials,
        });
        if (seen && offer.finalPriceRials >= seen.price) continue;
        matches.push({
          phrase: item.phrase,
          title: product.title,
          price: offer.finalAmountToman ?? offer.finalPriceRials,
          discountPercent: offer.discountRatio,
          url: "/?scan=" + encodeURIComponent(scanId),
          source: scan.source,
        });
      }
    }
    const lease =
      "EXISTS(SELECT 1 FROM wishlist_scan_receipts WHERE scan_id=? AND lease_token=? AND completed=0)";
    const statements: D1PreparedStatement[] = [];
    const notificationId = "wishlist:" + scanId;
    if (matches.length) {
      const title = "پیشنهادهای فهرست علاقه‌مندی شما";
      const body = [...new Set(matches.map((match) => match.phrase))].join(
        "، "
      );
      statements.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO wishlist_notifications(id,user_id,scan_id,location_id,title,body,matches_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE " +
              lease
          )
          .bind(
            notificationId,
            userId,
            scanId,
            scan.locationId,
            title,
            body,
            JSON.stringify(matches),
            now,
            scanId,
            token
          )
      );
      statements.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO wishlist_push_deliveries(notification_id,subscription_id,user_id,next_attempt_at) SELECT ?,id,user_id,? FROM push_subscriptions WHERE user_id=? AND " +
              lease
          )
          .bind(notificationId, now, userId, scanId, token)
      );
    }
    for (const observation of observations) {
      statements.push(
        db
          .prepare(
            "INSERT INTO wishlist_seen(user_id,wishlist_id,scope,product_id,price) SELECT ?,?,?,?,? WHERE " +
              lease +
              " AND EXISTS(SELECT 1 FROM wishlist_items WHERE id=? AND user_id=?) ON CONFLICT(user_id,wishlist_id,scope,product_id) DO UPDATE SET price=excluded.price"
          )
          .bind(
            userId,
            observation.itemId,
            scope,
            observation.productId,
            observation.price,
            scanId,
            token,
            observation.itemId,
            userId
          )
      );
    }
    statements.push(
      db
        .prepare(
          "UPDATE wishlist_scan_receipts SET completed=1 WHERE scan_id=? AND lease_token=?"
        )
        .bind(scanId, token)
    );
    await db.batch(statements);
  } catch (error) {
    await db
      .prepare(
        "DELETE FROM wishlist_scan_receipts WHERE scan_id=? AND lease_token=? AND completed=0"
      )
      .bind(scanId, token)
      .run();
    throw error;
  }
}

export async function processWishlistNotifications(
  env: WorkerEnv,
  timestamp = Date.now()
) {
  const scans = (
    await env.DB.prepare(
      "SELECT s.id,s.user_id FROM scans s WHERE s.status='succeeded' AND s.source IN ('snappmarket','okala') AND s.finished_at>=? " +
        "AND EXISTS(SELECT 1 FROM wishlist_items wi WHERE wi.user_id=s.user_id AND wi.created_at<=s.created_at) " +
        "AND NOT EXISTS(SELECT 1 FROM wishlist_scan_receipts r WHERE r.scan_id=s.id AND (r.completed=1 OR r.lease_until>?)) ORDER BY s.finished_at,s.id LIMIT 2"
    )
      .bind(
        new Date(timestamp - 86_400_000).toISOString(),
        new Date(timestamp).toISOString()
      )
      .all<{ id: string; user_id: string }>()
  ).results;
  for (const scan of scans) {
    try {
      await notifyWishlistScan(env.DB, scan.user_id, scan.id, timestamp);
    } catch (error) {
      if (!(
        error instanceof SavedProductsError &&
        error.code === "PROJECTION_PENDING"
      ))
        console.error("Wishlist notification processing failed", {
          scanId: scan.id,
        });
    }
  }
  await drainPushDeliveries(env, timestamp);
}
