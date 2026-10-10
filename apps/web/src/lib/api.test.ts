import { afterEach, expect, it, vi } from "vitest";
import { api, RequestFailure, retryAfterMs } from "./api";
import { scanRecordSchema } from "@better-buy/shared";
afterEach(() => vi.restoreAllMocks());
it("preserves credentials, headers and cancellation signals", async () => {
  const controller = new AbortController();
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ data: { sent: true } }));
  expect(
    await api("/api/scans", {
      method: "POST",
      signal: controller.signal,
      headers: { "x-example": "value" },
      body: JSON.stringify({ locationId: "home" }),
    })
  ).toEqual({ sent: true });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/scans",
    expect.objectContaining({
      credentials: "include",
      signal: controller.signal,
    })
  );
  expect(
    new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("content-type")
  ).toBe("application/json");
  expect(
    new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("x-example")
  ).toBe("value");
});
it("parses an empty 204 without reading a body", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 204 })
  );
  expect(
    await api("/api/locations/home", { method: "DELETE" })
  ).toBeUndefined();
});
it("retains HTTP status, application code, safe message and retry delay", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(
      { error: "SCAN_IN_PROGRESS", message: "اسکن در جریان است" },
      { status: 429, headers: { "Retry-After": "3" } }
    )
  );
  await expect(api("/api/scans")).rejects.toMatchObject({
    kind: "http",
    status: 429,
    code: "SCAN_IN_PROGRESS",
    message: "اسکن در جریان است",
    retryAfterMs: 3000,
  });
});
it("does not guess the reason for a transport failure or retry fetch", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new TypeError("TLS-private-detail"));
  await expect(api("/api/scans")).rejects.toMatchObject({
    kind: "transport",
    message: expect.not.stringContaining("TLS"),
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  new Response("bad JSON"),
  Response.json({ data: { status: "bogus" } }),
  Response.json({ something: [] }),
])("rejects invalid JSON, envelopes and schemas", async (response) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
  await expect(
    api("/api/scans/id", undefined, scanRecordSchema.parse)
  ).rejects.toMatchObject({ kind: "invalid-response" });
});
it("keeps a non-JSON error body an HTTP failure without exposing it", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("private upstream body", { status: 503 })
  );
  await expect(api("/api/scans")).rejects.toMatchObject({
    kind: "http",
    status: 503,
    message: expect.not.stringContaining("private"),
  });
});
it.each(["fetch", "body"])(
  "preserves cancellation during %s",
  async (phase) => {
    const controller = new AbortController();
    if (phase === "fetch")
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new DOMException("aborted", "AbortError")
      );
    else {
      const response = Response.json({ data: [] });
      vi.spyOn(response, "json").mockImplementation(async () => {
        controller.abort();
        throw new DOMException("body aborted", "AbortError");
      });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    }
    await expect(
      api("/api/scans", { signal: controller.signal })
    ).rejects.toMatchObject({ kind: "cancelled" });
  }
);
it("rejects a late body after signal cancellation even if fetch ignores the signal", async () => {
  const controller = new AbortController();
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    controller.abort();
    return Response.json({ data: [] });
  });
  await expect(
    api("/api/scans", { signal: controller.signal })
  ).rejects.toMatchObject({ kind: "cancelled" });
});
it("classifies body-stream failures as transport and parses Retry-After dates", async () => {
  const response = Response.json({ data: [] });
  vi.spyOn(response, "json").mockRejectedValue(new TypeError("stream"));
  vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
  await expect(api("/api/scans")).rejects.toBeInstanceOf(RequestFailure);
  expect(
    retryAfterMs(
      "Thu, 08 Oct 2026 08:00:03 GMT",
      Date.parse("2026-10-08T08:00:00Z")
    )
  ).toBe(3000);
  expect(retryAfterMs("bad")).toBeUndefined();
});
