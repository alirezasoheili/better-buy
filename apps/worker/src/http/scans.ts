import { Cause, Effect, Exit, Option } from "effect";
import {
  groupDeals,
  groupDealsV2,
  scanInputSchema,
  type DealRecord,
} from "@better-buy/shared";
import { executeScan, prepareScan } from "../application/scans";
import { scanServices } from "../composition";
import { ScanValidationError } from "../domain/failures";
import { Store } from "../store";
import type { Api } from "./types";
// V1 clients retain their original three-state vocabulary.
const legacyDeals = (deals: DealRecord[]) =>
  deals.map((deal) =>
    deal.state === "current"
      ? { ...deal, state: "still_available" as const }
      : deal
  );
export function registerScans(api: Api) {
  api.get("/api/scans", async (c) =>
    c.json({
      data: await new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY).scans(),
    })
  );
  api.get("/api/scans/:id", async (c) => {
    const v = await new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY).scan(
      c.req.param("id")
    );
    return v ? c.json({ data: v }) : c.json({ error: "NOT_FOUND" }, 404);
  });
  api.get("/api/scans/:id/deals", async (c) => {
    const store = new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY);
    const scan = await store.scan(c.req.param("id"));
    if (!scan) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json({ data: legacyDeals(await store.deals(scan.id)) });
  });
  api.get("/api/scans/:id/deal-groups", async (c) => {
    const store = new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY);
    const scan = await store.scan(c.req.param("id"));
    if (!scan) return c.json({ error: "NOT_FOUND" }, 404);
    const deals = legacyDeals(await store.deals(scan.id));
    const groups = groupDeals(scan.source, deals);
    return c.json({
      data: groups,
      meta: {
        groupKeyVersion: 1,
        groupedProductCount: groups.length,
        offerCount: deals.length,
      },
    });
  });
  // S03 projection only. Server pagination/materialization belongs to S08.
  api.get("/api/scans/:id/products", async (c) => {
    const store = new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY);
    const scan = await store.scan(c.req.param("id"));
    if (!scan) return c.json({ error: "NOT_FOUND" }, 404);
    if (scan.status !== "succeeded")
      return c.json({ error: "SCAN_NOT_PUBLISHED" }, 409);
    const products = await groupDealsV2(
      scan.source,
      await store.deals(scan.id)
    );
    return c.json({
      data: products,
      meta: {
        groupKeyVersion: 2,
        historyContext: scan.context ? "verified" : "legacy_unverified",
        coverageSummary: "supported_discount_feeds",
      },
    });
  });

  api.post("/api/scans", async (c) => {
    const parsed = scanInputSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) return c.json({ error: "INVALID_INPUT" }, 400);
    const services = scanServices(
      c.env.DB,
      c.get("userId"),
      c.env.BOX_KEY,
      c.env.SNAPP_STORE_CAMPAIGNS_ENABLED === "true"
    );
    const prepared = await Effect.runPromiseExit(
      prepareScan(parsed.data).pipe(Effect.provide(services))
    );
    if (Exit.isFailure(prepared)) {
      const failure = Cause.findErrorOption(prepared.cause);
      if (Option.isSome(failure) && !Cause.hasDies(prepared.cause)) {
        const error = failure.value;
        return c.json(
          { error: error.code, message: error.message },
          error instanceof ScanValidationError ? error.status : 502
        );
      }
      console.error("Scan preparation defect");
      return c.json(
        {
          error: "UNKNOWN_ERROR",
          message: "شروع اسکن ممکن نشد؛ دوباره تلاش کنید.",
        },
        500
      );
    }
    const job = prepared.value;
    const record = await new Store(
      c.env.DB,
      c.get("userId"),
      c.env.BOX_KEY
    ).scan(job.id);
    if (!record) return c.json({ error: "NOT_FOUND" }, 404);
    // waitUntil owns this one Promise. A fiber does not extend the Worker's lifetime.
    const running = Effect.runPromiseExit(
      executeScan(job).pipe(Effect.provide(services))
    ).then((exit) => {
      if (Exit.isFailure(exit))
        console.error("Scan finalization failed", { scanId: job.id });
    });
    c.executionCtx.waitUntil(running);
    return c.json({ data: record }, 202);
  });
}
