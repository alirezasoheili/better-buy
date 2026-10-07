import { connectOkala } from "../application/provider-settings";
import { Cause, Effect, Exit, Option } from "effect";
import { loginOkala, requestOkalaOtp } from "../providers/okala/access";
import { PersistenceError } from "../domain/failures";
import {
  API_ERROR_CODES,
  API_ERROR_MESSAGES,
  okalaOtpRequestSchema,
  okalaOtpVerifySchema,
  okalaSettingsInputSchema,
} from "@better-buy/shared";
import { Store } from "../store";
import type { Api } from "./types";
export function registerSettings(api: Api) {
  api.get("/api/settings/digikalajet", (c) =>
    c.json(
      {
        error: API_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: API_ERROR_MESSAGES.PROVIDER_UNAVAILABLE,
      },
      409
    )
  );
  api.put("/api/settings/digikalajet", (c) =>
    c.json(
      {
        error: API_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: API_ERROR_MESSAGES.PROVIDER_UNAVAILABLE,
      },
      409
    )
  );
  api.get("/api/settings/okala", async (c) =>
    c.json({
      data: await new Store(
        c.env.DB,
        c.get("userId"),
        c.env.BOX_KEY
      ).okalaStatus(),
    })
  );
  api.put("/api/settings/okala", async (c) => {
    const p = okalaSettingsInputSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!p.success) return c.json({ error: "INVALID_INPUT" }, 400);
    const s = new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY);
    await s.saveProvider("okala", p.data.token);
    return c.json({ data: await s.okalaStatus() });
  });
  api.post("/api/settings/okala/otp", async (c) => {
    const parsed = okalaOtpRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) return c.json({ error: "INVALID_INPUT" }, 400);
    const result = await Effect.runPromiseExit(
      requestOkalaOtp(parsed.data.mobile)
    );
    if (Exit.isFailure(result)) {
      const error = Cause.findErrorOption(result.cause);
      return c.json(
        {
          error: "UPSTREAM_ERROR",
          message: Option.isSome(error)
            ? error.value.message
            : "ارسال کد اکالا ناموفق بود",
        },
        409
      );
    }
    return c.json({ data: { sent: true } }, 202);
  });
  api.post("/api/settings/okala/login", async (c) => {
    const parsed = okalaOtpVerifySchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) return c.json({ error: "INVALID_INPUT" }, 400);
    if (!c.env.OKALA_CLIENT_SECRET)
      return c.json(
        {
          error: "CONFIGURATION_ERROR",
          message: "کلید اتصال اکالا در Worker تنظیم نشده است.",
        },
        503
      );
    const store = new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY);
    const operation = connectOkala(
      loginOkala(
        c.env.OKALA_CLIENT_SECRET,
        parsed.data.mobile,
        parsed.data.otp
      ),
      {
        save: (credentials) =>
          Effect.tryPromise({
            try: () =>
              store.saveProvider("okala", credentials.token, credentials),
            catch: () => new PersistenceError("provider credentials"),
          }).pipe(Effect.uninterruptible),
        status: Effect.tryPromise({
          try: () => store.okalaStatus(),
          catch: () => new PersistenceError("provider status"),
        }),
      }
    );
    const result = await Effect.runPromiseExit(operation);
    if (Exit.isFailure(result)) {
      const error = Cause.findErrorOption(result.cause);
      return c.json(
        {
          error:
            Option.isSome(error) && error.value instanceof PersistenceError
              ? "PERSISTENCE_ERROR"
              : "UPSTREAM_ERROR",
          message: Option.isSome(error)
            ? error.value.message
            : "ورود اکالا ناموفق بود",
        },
        409
      );
    }
    return c.json({ data: result.value });
  });
}
