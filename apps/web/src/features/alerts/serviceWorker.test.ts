import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([]);
  runInNewContext(
    readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8"),
    {
      URL,
      self: {
        location: { origin: "https://better-buy.example" },
        registration: { showNotification },
        clients: { matchAll, openWindow },
        addEventListener: (name: string, handler: (event: unknown) => void) => {
          handlers[name] = handler;
        },
      },
    }
  );
  return {
    handlers: {
      push: handlers.push!,
      notificationclick: handlers.notificationclick!,
      fetch: handlers.fetch,
    },
    showNotification,
    openWindow,
    matchAll,
  };
}
describe("push service worker", () => {
  it.each([
    "https://evil.example/",
    "//evil.example/",
    "javascript:alert(1)",
    undefined,
  ])(
    "defaults untrusted or missing push URLs to the inbox (%s)",
    async (url) => {
      const current = worker();
      let pending: Promise<unknown> | undefined;
      current.handlers.push({
        data: { json: () => ({ title: "بهتر بخر", body: "پیشنهاد", url }) },
        waitUntil: (promise: Promise<unknown>) => {
          pending = promise;
        },
      });
      await pending;
      expect(current.showNotification).toHaveBeenCalledWith(
        "بهتر بخر",
        expect.objectContaining({
          dir: "rtl",
          data: { url: "https://better-buy.example/?inbox=1" },
        })
      );
      expect(current.handlers.fetch).toBeUndefined();
    }
  );
  it("keeps the server notification deep link", () => {
    const current = worker();
    current.handlers.push({
      data: { json: () => ({ url: "/?notification=notice-1" }) },
      waitUntil: vi.fn(),
    });
    expect(current.showNotification.mock.calls[0]![1].data.url).toBe(
      "https://better-buy.example/?notification=notice-1"
    );
  });
  it("handles malformed payloads with a useful default", () => {
    const current = worker();
    current.handlers.push({
      data: {
        json: () => {
          throw new Error("bad json");
        },
      },
      waitUntil: vi.fn(),
    });
    expect(current.showNotification).toHaveBeenCalledWith(
      "بهتر بخر",
      expect.objectContaining({ body: expect.any(String) })
    );
  });
  it("revalidates stored click URLs and never opens an external origin", async () => {
    const current = worker();
    let pending: Promise<unknown> | undefined;
    const close = vi.fn();
    current.handlers.notificationclick({
      notification: { data: { url: "https://evil.example/" }, close },
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
    expect(close).toHaveBeenCalledOnce();
    expect(current.openWindow).toHaveBeenCalledWith(
      "https://better-buy.example/?inbox=1"
    );
  });
  it("focuses an existing matching window instead of opening a duplicate", async () => {
    const current = worker();
    const focus = vi.fn();
    current.matchAll.mockResolvedValue([
      { url: "https://better-buy.example/?notification=notice-1", focus },
    ]);
    let pending: Promise<unknown> | undefined;
    current.handlers.notificationclick({
      notification: {
        data: { url: "/?notification=notice-1" },
        close: vi.fn(),
      },
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
    expect(focus).toHaveBeenCalledOnce();
    expect(current.openWindow).not.toHaveBeenCalled();
  });
});
