import { afterEach, expect, it, vi } from "vitest";
import {
  retryApplicationRead,
  readRetryDelay,
  recoveryInterval,
} from "./queryPolicy";
import { RequestFailure, api } from "./api";
import { createDashboardQueryClient } from "../features/dashboard/QuerySession";
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("poll recovery does not repeat permanent failures or long Retry-After", () => {
  expect(recoveryInterval(new RequestFailure("transport", ""))).toBe(15000);
  expect(recoveryInterval(new RequestFailure("http", "", 401))).toBe(false);
  expect(
    recoveryInterval(new RequestFailure("http", "", 429, undefined, 60000))
  ).toBe(false);
  expect(recoveryInterval(new RequestFailure("invalid-response", ""))).toBe(
    false
  );
});
it.each([408, 429, 500, 502, 503, 504])(
  "retries transient HTTP %s at most twice",
  (status) => {
    const error = new RequestFailure("http", "", status);
    expect(retryApplicationRead(0, error)).toBe(true);
    expect(retryApplicationRead(1, error)).toBe(true);
    expect(retryApplicationRead(2, error)).toBe(false);
  }
);
it.each([401, 403, 400, 404, 409, 422])(
  "does not retry permanent HTTP %s",
  (status) =>
    expect(
      retryApplicationRead(0, new RequestFailure("http", "", status))
    ).toBe(false)
);
it.each(["cancelled", "invalid-response"] as const)(
  "does not retry %s",
  (kind) =>
    expect(retryApplicationRead(0, new RequestFailure(kind, ""))).toBe(false)
);
it("bounds backoff, honors short Retry-After, and declines long guidance", () => {
  expect(readRetryDelay(0, new RequestFailure("transport", ""))).toBe(1000);
  expect(readRetryDelay(1, new RequestFailure("transport", ""))).toBe(2000);
  const short = new RequestFailure("http", "", 429, undefined, 4000);
  expect(readRetryDelay(0, short)).toBe(4000);
  expect(
    retryApplicationRead(
      0,
      new RequestFailure("http", "", 429, undefined, 60000)
    )
  ).toBe(false);
  expect(
    readRetryDelay(1, new RequestFailure("http", "", 429, undefined, 60000))
  ).toBe(5000);
});
it.each([true, false])(
  "Query owns the retry count and recovery (recovers=%s)",
  async (recovers) => {
    vi.useFakeTimers();
    const client = createDashboardQueryClient();
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("transport"));
    if (recovers)
      fetcher
        .mockRejectedValueOnce(new TypeError("transport"))
        .mockResolvedValueOnce(Response.json({ data: ["saved"] }));
    const result = client
      .fetchQuery({
        queryKey: ["read"],
        queryFn: ({ signal }) => api("/api/scans", { signal }),
      })
      .then(
        (data) => ({ data }),
        (error) => ({ error })
      );
    await vi.advanceTimersByTimeAsync(6000);
    const outcome = await result;
    expect(fetcher).toHaveBeenCalledTimes(recovers ? 2 : 3);
    expect(recovers ? "data" in outcome : "error" in outcome).toBe(true);
    client.clear();
  }
);
