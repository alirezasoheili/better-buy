import { makeSignature } from "better-auth/crypto";

/** Use Better Auth's session-cookie signature format, including base64 padding. */
export async function signSessionToken(
  secret: string,
  token: string
): Promise<string> {
  return makeSignature(token, secret);
}

const TEST_EMAIL = "test@better-buy.local";

/**
 * Dev-only (DEV_MODE=true) helper that creates a signed Better Auth session cookie
 * for a fixed test user, plus a first location so the first-run dashboard renders.
 */
export async function issueTestSession(
  db: D1Database,
  secret: string
): Promise<string> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const existing = await db
    .prepare('SELECT id FROM "user" WHERE email=?')
    .bind(TEST_EMAIL)
    .first<{ id: string }>();
  let userId = existing?.id;
  if (!userId) {
    userId = crypto.randomUUID();
    await db
      .prepare(
        'INSERT INTO "user" (id,name,email,emailVerified,image,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)'
      )
      .bind(userId, "Test", TEST_EMAIL, 1, null, now, now)
      .run();
  }
  const token = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO session (id,userId,token,expiresAt,ipAddress,userAgent,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)"
    )
    .bind(sessionId, userId, token, expiresAt, null, null, now, now)
    .run();
  const existingLocation = await db
    .prepare("SELECT 1 FROM locations WHERE user_id=?")
    .bind(userId)
    .first();
  if (!existingLocation) {
    await db
      .prepare(
        "INSERT INTO locations(id,user_id,name,latitude,longitude,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)"
      )
      .bind(
        crypto.randomUUID(),
        userId,
        "تست — محل تست",
        35.7,
        51.4,
        1,
        now,
        now
      )
      .run();
  }
  const signature = await signSessionToken(secret, token);
  const value = encodeURIComponent(`${token}.${signature}`);
  return `better-auth.session_token=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`;
}
