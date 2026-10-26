import { afterEach, expect, it, vi } from "vitest";
import {
  pushRegistration,
  pushSupported,
  removeSubscription,
  saveSubscription,
  urlBase64ToUint8Array,
} from "./push";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("decodes unpadded VAPID URL base64 into browser key bytes", () => {
  expect([...urlBase64ToUint8Array("BP_-AQ")]).toEqual([4, 255, 254, 1]);
});
it("feature detection is safe without browser APIs", () => {
  expect(pushSupported()).toBe(false);
  vi.stubGlobal("window", {
    isSecureContext: false,
    PushManager: {},
    Notification: {},
  });
  vi.stubGlobal("navigator", { serviceWorker: {} });
  expect(pushSupported()).toBe(false);
});
it("registers the root worker without asking permission", async () => {
  const register = vi.fn().mockResolvedValue({});
  const registration = { scope: "https://example.com/" };
  vi.stubGlobal("navigator", {
    serviceWorker: { register, ready: Promise.resolve(registration) },
  });
  expect(await pushRegistration()).toBe(registration);
  expect(register).toHaveBeenCalledWith("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
});
it("bounds worker activation waiting and propagates failures", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn().mockResolvedValue({}),
      ready: new Promise(() => {}),
    },
  });
  const result = expect(pushRegistration()).rejects.toThrow("طول کشید");
  await vi.advanceTimersByTimeAsync(12000);
  await result;
});
function subscription() {
  return {
    endpoint: "https://push.example/device",
    toJSON: () => ({
      endpoint: "https://push.example/device",
      keys: { p256dh: "public", auth: "auth" },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;
}
it("syncs only the exact subscription contract with session credentials", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ data: { ok: true } }));
  await saveSubscription(subscription());
  expect(fetcher).toHaveBeenCalledWith(
    "/api/push/subscriptions",
    expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({
        endpoint: "https://push.example/device",
        keys: { p256dh: "public", auth: "auth" },
      }),
    })
  );
});
it("does not unsubscribe when backend removal fails so a retry remains possible", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ error: "FAILED" }, { status: 503 })
  );
  const current = subscription();
  await expect(removeSubscription(current)).rejects.toThrow();
  expect(current.unsubscribe).not.toHaveBeenCalled();
});
it("deletes the endpoint before unsubscribing the browser", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 204 }));
  const current = subscription();
  await removeSubscription(current);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/push/subscriptions",
    expect.objectContaining({
      method: "DELETE",
      body: JSON.stringify({ endpoint: current.endpoint }),
    })
  );
  expect(current.unsubscribe).toHaveBeenCalledOnce();
});
