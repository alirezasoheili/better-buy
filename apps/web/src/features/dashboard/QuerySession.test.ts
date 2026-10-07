import { expect, it, vi } from "vitest";
import { createDashboardQueryClient } from "./QuerySession";
import { api } from "../../lib/api";

it("keeps identical resource keys isolated between authenticated session caches", () => {
  const firstUser = createDashboardQueryClient();
  const secondUser = createDashboardQueryClient();
  firstUser.setQueryData(["locations"], [{ id: "private-location-1" }]);
  secondUser.setQueryData(["locations"], [{ id: "private-location-2" }]);
  expect(firstUser.getQueryData(["locations"])).toEqual([
    { id: "private-location-1" },
  ]);
  expect(secondUser.getQueryData(["locations"])).toEqual([
    { id: "private-location-2" },
  ]);
  firstUser.clear();
  expect(secondUser.getQueryData(["locations"])).toEqual([
    { id: "private-location-2" },
  ]);
  secondUser.clear();
});

it("aborts a retiring cache's read and does not accept its late response", async () => {
  const client = createDashboardQueryClient();
  let signal: AbortSignal | null | undefined;
  let release: (response: Response) => void = () => {
    throw new Error("request has not started");
  };
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((_url, init) => {
      signal = init?.signal;
      // Simulate a response already in transit, even after cancellation.
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
  try {
    const result = client
      .fetchQuery({
        queryKey: ["ledger", "old-user-scan"],
        queryFn: ({ signal }) =>
          api("/api/scans/old-user-scan/deals", { signal }),
      })
      .catch(() => undefined);
    client.clear();
    expect(signal?.aborted).toBe(true);
    release(Response.json({ data: [{ key: "old-user-private-offer" }] }));
    await result;
    expect(client.getQueryData(["ledger", "old-user-scan"])).toBeUndefined();
  } finally {
    fetcher.mockRestore();
    client.clear();
  }
});
