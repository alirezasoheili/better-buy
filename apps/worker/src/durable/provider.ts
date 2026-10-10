import { Effect, Cause, Exit, Option } from "effect";
import { z } from "zod";
import { requestJson } from "../infrastructure/http";
import { CollectorError } from "../domain/failures";
import { DurableError, type Steps, type Job } from "./types";
import type { DurableRepository } from "./repository";

const pwa = { client: "PWA", deviceType: "PWA", appVersion: "1.403.1" };
const headers = {
  accept: "application/json, text/plain, */*",
  origin: "https://snapp.market",
  referer: "https://snapp.market/",
  "user-agent": "Mozilla/5.0 BetterBuy/1.0",
};
const guestSchema = z.object({
  status: z.literal(true),
  data: z.object({
    access_token: z.string().min(1),
    expires_in: z.number().positive(),
  }),
});
export async function effectValue<A>(
  effect: Effect.Effect<A, CollectorError>
): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const error = Cause.findErrorOption(exit.cause);
  throw Option.isSome(error)
    ? error.value
    : new DurableError("UPSTREAM_CHANGED", "Provider processing failed");
}

/** One scan-owned access session. Never returned from a Workflow step or persisted. */
export function providerReader(
  repo: DurableRepository,
  id: string,
  steps: Steps,
  fetcher: typeof fetch = fetch
) {
  let guest: { token: string; expiresAt: number } | undefined;
  let reservationFailure: unknown;
  const physical = async (
    url: string | URL,
    init: RequestInit,
    operation: string
  ) => {
    let job: Job;
    try {
      job = await repo.check(id);
      await repo.reserveAttempt(id, operation);
    } catch (error) {
      reservationFailure = error;
      throw error;
    }
    return fetcher(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.any([
        ...(init.signal ? [init.signal] : []),
        AbortSignal.timeout(
          Math.max(
            1,
            Math.min(8_000, Date.parse(job.runtime.deadline_at) - Date.now())
          )
        ),
      ]),
    });
  };
  const attempt = async (url: URL, job: Job, operation: string) => {
    const single = async (u: URL, init: RequestInit) => {
      reservationFailure = undefined;
      try {
        return await effectValue(
          requestJson(u, init, {
            fetcher: (u, i) =>
              physical(
                u as string | URL,
                i ?? {},
                `${operation}:${i?.method === "POST" ? "access" : "get"}`
              ),
            provider: job.scan.source,
            attempts: 1,
            allow401: true,
            forbiddenCode: "UPSTREAM_FORBIDDEN",
            invalidJsonCode: "UPSTREAM_INVALID_JSON",
          })
        );
      } catch (error) {
        throw reservationFailure ?? error;
      }
    };
    if (job.scan.source === "okala")
      return single(url, {
        headers: {
          accept: "application/json",
          origin: "https://www.okala.com",
          source: "okala",
          "ui-version": "2.0",
        },
      });
    const acquire = async () => {
      const auth = new URL("https://svc.snapp.market/oauth2/default/token");
      Object.entries({ ...pwa, UDID: job.runtime.device_id }).forEach(
        ([k, v]) => auth.searchParams.set(k, v)
      );
      const at = Date.now();
      const result = await single(auth, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          data: {
            device_uid: job.runtime.device_id,
            client_id: "snappfood_pwa",
            client_secret: "snappfood_pwa_secret",
            grant_type: "client_credentials",
            scope: "mobile_v2 mobile_v1 webview",
          },
        }),
      });
      const parsed = guestSchema.safeParse(result.body);
      if (!parsed.success)
        throw new CollectorError(
          result.status === 401 ? "GUEST_AUTH_REJECTED" : "UPSTREAM_CHANGED",
          "Automatic access was rejected"
        );
      guest = {
        token: parsed.data.data.access_token,
        expiresAt: at + parsed.data.data.expires_in * 1000,
      };
      if (guest.expiresAt <= Date.now())
        throw new CollectorError(
          "GUEST_AUTH_REJECTED",
          "Automatic access expired"
        );
    };
    Object.entries({ ...pwa, UDID: job.runtime.device_id }).forEach(([k, v]) =>
      url.searchParams.set(k, v)
    );
    if (!guest || guest.expiresAt <= Date.now()) await acquire();
    let result = await single(url, {
      headers: { ...headers, authorization: `Bearer ${guest!.token}` },
    });
    if (result.status === 401 && (await repo.claimGuestRefresh(id))) {
      await acquire();
      result = await single(url, {
        headers: { ...headers, authorization: `Bearer ${guest!.token}` },
      });
    }
    if (result.status === 401)
      throw new CollectorError(
        "GUEST_AUTH_REJECTED",
        "Automatic access was rejected"
      );
    return result;
  };
  return async (url: URL, key: string): Promise<unknown> => {
    const saved = await repo.discovery(id, key);
    if (saved !== null) return saved;
    for (let ordinal = 0; ordinal < 3; ordinal++) {
      const result = await steps.do(
        `request:${key}:attempt:${ordinal}`,
        async () => {
          const cached = await repo.discovery(id, key);
          if (cached !== null) return { ok: true as const };
          try {
            const job = await repo.check(id);
            const response = await attempt(new URL(url), job, key);
            await repo.saveDiscovery(id, key, response.body);
            return { ok: true as const };
          } catch (error) {
            const current = await repo.check(id);
            if (current.runtime.attempt_count >= current.runtime.attempt_limit)
              throw new DurableError(
                "SCAN_BUDGET_EXCEEDED",
                "Outbound request budget exhausted"
              );
            if (error instanceof CollectorError)
              return {
                ok: false as const,
                code: error.code,
                message: error.message,
                retryable: error.retryable,
                delay:
                  error.retryAfterMs ?? Math.min(5000, 1000 * 2 ** ordinal),
              };
            throw error;
          }
        }
      );
      if (result.ok) {
        const body = await repo.discovery(id, key);
        if (body === null)
          throw new DurableError(
            "PERSISTENCE_ERROR",
            "Committed response is missing"
          );
        return body;
      }
      if (!result.retryable || ordinal === 2)
        throw new CollectorError(result.code, result.message, false);
      const job = await repo.check(id);
      if (result.delay > Date.parse(job.runtime.deadline_at) - Date.now())
        throw new DurableError(
          "SCAN_BUDGET_EXCEEDED",
          "Retry would exceed update deadline"
        );
      await steps.sleep(`retry:${key}:${ordinal}`, result.delay);
    }
    throw new DurableError("UNKNOWN_ERROR", "Provider request failed");
  };
}
