import { Hono } from "hono";
import { createAuth } from "./auth";
import { Store } from "./store";
import { issueTestSession } from "./test-login";
import { registerLocations } from "./http/locations";
import { registerSettings } from "./http/settings";
import { registerScans } from "./http/scans";
import type { WorkerEnv, Variables } from "./http/types";
export const api = new Hono<{ Bindings: WorkerEnv; Variables: Variables }>();
api.post("/api/auth/test-login", async (c) => {
  if (c.env.DEV_MODE !== "true") return c.json({ error: "NOT_FOUND" }, 404);
  const cookie = await issueTestSession(c.env.DB, c.env.BETTER_AUTH_SECRET);
  c.header("Set-Cookie", cookie);
  return c.json({ data: { ok: true } });
});

api.on(["GET", "POST"], "/api/auth/*", (c) =>
  createAuth(c.env).handler(c.req.raw)
);

// Liveness must not depend on a user session or a D1 read. Keep diagnostics
// under the authenticated /api/health route below.
api.get("/healthz", (c) => c.json({ ok: true }));

api.use("/api/*", async (c, next) => {
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
      c.header("Vary", "Origin");
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      c.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
      );
      c.header("Access-Control-Max-Age", "86400");
    }
  }
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});

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
  await new Store(c.env.DB, session.user.id, c.env.BOX_KEY).reconcileStale();
  await next();
});

api.get("/api/health", (c) =>
  c.json({ ok: true, storage: "d1", signedIn: Boolean(c.get("userId")) })
);
api.get("/api/me", (c) => c.json({ data: { id: c.get("userId") } }));

registerLocations(api);
registerSettings(api);
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
