import { afterEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import { requestJson, retryAfterMs } from "./http";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("individual upstream request policy", () => {
  it("retries an individual GET with exponential backoff", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const result = Effect.runPromise(
      requestJson(
        "https://fixture.test/page/2",
        {},
        { provider: "fixture", fetcher }
      )
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ body: { ok: true } });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(
      Array(3).fill("https://fixture.test/page/2")
    );
  });
  it.each([401, 403, 400])("does not retry status %s", async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status }));
    await expect(
      Effect.runPromise(
        requestJson(
          "https://fixture.test",
          {},
          { provider: "fixture", fetcher }
        )
      )
    ).rejects.toMatchObject({ retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("never retries an authentication mutation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      Effect.runPromise(
        requestJson(
          "https://fixture.test/token",
          { method: "POST" },
          { provider: "fixture", fetcher }
        )
      )
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("honors Retry-After rather than retrying early", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "retry-after": "3" } })
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const result = Effect.runPromise(
      requestJson("https://fixture.test", {}, { provider: "fixture", fetcher })
    );
    await vi.advanceTimersByTimeAsync(2999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("fails when Retry-After cannot fit the execution budget", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 429, headers: { "retry-after": "60" } })
      );
    await expect(
      Effect.runPromise(
        requestJson(
          "https://fixture.test",
          {},
          { provider: "fixture", fetcher }
        )
      )
    ).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 60000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("aborts the actual fetch on a request timeout", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        signal = init?.signal ?? undefined;
        signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const result = Effect.runPromise(
      requestJson(
        "https://fixture.test",
        {},
        { provider: "fixture", fetcher, timeoutMs: 50, attempts: 1 }
      )
    );
    const assertion = expect(result).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });
  it("aborts response-body consumption when its timeout expires", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher: typeof fetch = async (_url, init) => {
      signal = init?.signal ?? undefined;
      return new Response(
        new ReadableStream({
          start(controller) {
            signal?.addEventListener("abort", () =>
              controller.error(new Error("aborted"))
            );
          },
        })
      );
    };
    const result = Effect.runPromise(
      requestJson(
        "https://fixture.test",
        {},
        { provider: "fixture", fetcher, timeoutMs: 50, attempts: 1 }
      )
    );
    const assertion = expect(result).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });
  it("external interruption cancels the fetch without retrying", async () => {
    let signal: AbortSignal | undefined;
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
          controller.abort();
        })
    );
    const exit = await Effect.runPromiseExit(
      requestJson("https://fixture.test", {}, { provider: "fixture", fetcher }),
      { signal: controller.signal }
    );
    expect(exit._tag).toBe("Failure");
    expect(signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("parses Retry-After dates and rejects invalid guidance", () => {
    const now = Date.parse("2026-10-07T12:00:00Z");
    expect(retryAfterMs("Wed, 07 Oct 2026 12:00:02 GMT", now)).toBe(2000);
    expect(retryAfterMs("-1", now)).toBeUndefined();
    expect(retryAfterMs("nonsense", now)).toBeUndefined();
  });
});
