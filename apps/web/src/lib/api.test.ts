import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => vi.restoreAllMocks());
it("includes the authenticated session and cancellation signal for all API calls", async () => {
  const controller = new AbortController();
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ data: { sent: true } }));
  expect(
    await api("/api/scans", {
      method: "POST",
      signal: controller.signal,
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
});
it("handles successful empty DELETE responses", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 204 })
  );
  expect(
    await api("/api/locations/home", { method: "DELETE" })
  ).toBeUndefined();
});
it("reports the server's safe Persian error message", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(
      { error: "SCAN_IN_PROGRESS", message: "اسکن در جریان است" },
      { status: 409 }
    )
  );
  await expect(api("/api/scans")).rejects.toThrow("اسکن در جریان است");
});
