import { Hono } from "hono";
import { createAuth } from "./auth";
import { Store } from "./store";
import { issueTestSession } from "./test-login";
import { registerLocations } from "./http/locations";
import { registerSettings } from "./http/settings";
import { registerScans } from "./http/scans";
import { consumeRateLimit } from "./http/rateLimit";
import { registerPagedProducts } from "./http/products";
import { registerCarts } from "./http/carts";
import { registerWishlist } from "./http/wishlist";
import type { WorkerEnv, Variables } from "./http/types";
export const api = new Hono<{ Bindings: WorkerEnv; Variables: Variables }>();
// Liveness must not depend on a user session or a D1 read. Keep diagnostics
// under the authenticated /api/health route below.
api.get("/healthz", (c) => c.json({ ok: true }));

api.use("/api/*", async (c, next) => {
  if (c.req.method === "OPTIONS") c.res = c.body(null, 204);
  else await next();

  // Better Auth returns a raw Response, so apply headers after it is finalized.
  const origin = c.req.header("Origin");
  if (origin) {
    const allowed = new Set(
      [c.env.APP_ORIGIN, c.env.CORS_ORIGIN].flatMap((value) =>
        value
          ? value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : []
      )
    );
    if (allowed.has(origin)) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Vary", "Origin", { append: true });
      c.header("Access-Control-Allow-Credentials", "true");
      c.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Idempotency-Key"
      );
      c.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
      );
      c.header("Access-Control-Max-Age", "86400");
    }
  }
});

// Register auth after CORS so split-dev browsers can read responses and cookies.
api.post("/api/auth/test-login", async (c) => {
  if (c.env.DEV_MODE !== "true") return c.json({ error: "NOT_FOUND" }, 404);
  const cookie = await issueTestSession(c.env.DB, c.env.BETTER_AUTH_SECRET);
  c.header("Set-Cookie", cookie);
  return c.json({ data: { ok: true } });
});

api.on(["GET", "POST"], "/api/auth/*", (c) =>
  createAuth(c.env).handler(c.req.raw)
);

api.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth/")) return next();
  c.header("Cache-Control", "private, no-store, max-age=0");
  c.header("Pragma", "no-cache");
  c.header("Vary", "Cookie, Authorization");
  const session = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session?.user?.id)
    return c.json(
      { error: "UNAUTHENTICATED", message: "برای ادامه با گوگل وارد شوید." },
      401
    );
  c.set("userId", session.user.id);
  if (c.env.API_RATE_LIMITS_ENABLED === "true") {
    const retryAfter = await consumeRateLimit(
      c.env.DB,
      session.user.id,
      c.req.method,
      c.req.path
    );
    if (retryAfter !== null) {
      c.header("Retry-After", String(retryAfter));
      return c.json(
        {
          error: "RATE_LIMITED",
          message: "درخواست‌ها موقتاً محدود شده‌اند؛ کمی بعد دوباره تلاش کنید.",
        },
        429
      );
    }
  }
  await new Store(c.env.DB, session.user.id, c.env.BOX_KEY).reconcileStale();
  await next();
});

api.get("/api/health", (c) =>
  c.json({ ok: true, storage: "d1", signedIn: Boolean(c.get("userId")) })
);
api.get("/api/me", (c) => c.json({ data: { id: c.get("userId") } }));

registerLocations(api);
registerSettings(api);
registerPagedProducts(api);
registerCarts(api);
registerWishlist(api);
registerScans(api);
api.notFound((c) =>
  c.json({ error: "NOT_FOUND", message: "مسیر پیدا نشد." }, 404)
);

export default {
  async fetch(request, env, ctx) {
    const response = await api.fetch(request, env, ctx);
    if (
      response.status !== 404 ||
      new URL(request.url).pathname.startsWith("/api/")
    )
      return response;
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<WorkerEnv>;
