import { describe, expect, it, vi } from "vitest";
import { CollectorError } from "./collector";
import { collectWithRetry } from "./retry";

describe("scan retry with backoff", () => {
  it("retries a transient failure and succeeds on the next attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new CollectorError("NETWORK_ERROR", "موقت"))
      .mockResolvedValueOnce({ ok: true });
    const result = await collectWithRetry(fn, { baseDelayMs: 1 });
    expect(result).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("fails fast on non-transient errors", async () => {
    const fn = vi.fn().mockRejectedValue(new CollectorError("AUTH_REJECTED", "رد شد"));
    await expect(collectWithRetry(fn, { baseDelayMs: 1 })).rejects.toMatchObject({ code: "AUTH_REJECTED" });
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("gives up after maxAttempts on persistent transient errors", async () => {
    const fn = vi.fn().mockRejectedValue(new CollectorError("RATE_LIMITED", "محدود شد"));
    await expect(collectWithRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
