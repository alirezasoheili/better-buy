import { betterAuth } from "better-auth";

export type AuthEnv = {
  DB: D1Database;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APP_ORIGIN?: string;
};

/** Build auth from request bindings: secrets never enter module-global state or logs. */
export function createAuth(env: AuthEnv) {
  return betterAuth({
    appName: "بهتر بخر",
    database: env.DB,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL, ...(env.APP_ORIGIN ? [env.APP_ORIGIN] : [])],
    secret: env.BETTER_AUTH_SECRET,
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    emailAndPassword: { enabled: false },
    // Keep OAuth state and PKCE in Better Auth's short-lived encrypted cookie.
    // This avoids a D1 state round-trip while retaining CSRF and PKCE validation.
    account: { storeStateStrategy: "cookie" },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      database: { generateId: () => crypto.randomUUID() },
    },
    rateLimit: { enabled: true, window: 60, max: 30 },
  });
}
