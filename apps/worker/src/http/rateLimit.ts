// D1's single atomic statement enforces the limit across Worker isolates.
// Saved reads never consume provider budget; starts have a smaller quota.
export async function consumeRateLimit(
  db: D1Database,
  userId: string,
  method: string,
  path: string,
  timestamp = Date.now()
): Promise<number | null> {
  const bucket =
    method === "POST" && path === "/api/scans"
      ? "start"
      : method === "POST" && /^\/api\/scans\/[^/]+\/cancel$/.test(path)
        ? "cancel"
        : "read";
  const limit = bucket === "start" ? 5 : bucket === "cancel" ? 10 : 120;
  const window = Math.floor(timestamp / 60_000) * 60_000;
  const result = await db
    .prepare(
      "INSERT INTO api_rate_limits(user_id,bucket,window_start,requests) VALUES(?,?,?,1) ON CONFLICT(user_id,bucket,window_start) DO UPDATE SET requests=requests+1 WHERE requests < ? RETURNING requests"
    )
    .bind(userId, bucket, window, limit)
    .first<{ requests: number }>();
  return result
    ? null
    : Math.max(1, Math.ceil((window + 60_000 - timestamp) / 1000));
}

export async function cleanupRateLimits(
  db: D1Database,
  timestamp = Date.now()
) {
  await db
    .prepare(
      "DELETE FROM api_rate_limits WHERE rowid IN (SELECT rowid FROM api_rate_limits WHERE window_start < ? LIMIT 1000)"
    )
    .bind(timestamp - 86_400_000)
    .run();
}
