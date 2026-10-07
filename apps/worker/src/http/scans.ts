import { Cause, Effect, Exit, Option } from "effect";
import { groupDeals, scanInputSchema } from "@better-buy/shared";
import { executeScan, prepareScan } from "../application/scans";
import { scanServices } from "../composition";
import { CredentialError, ScanValidationError } from "../domain/failures";
import { Store } from "../store";
import type { Api } from "./types";
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
  api.get("/api/scans/:id/deals", async (c) =>
    c.json({
      data: await new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY).deals(
        c.req.param("id")
      ),
    })
  );
  api.get("/api/scans/:id/deal-groups", async (c) => {
    const store = new Store(c.env.DB, c.get("userId"), c.env.BOX_KEY);
    const scan = await store.scan(c.req.param("id"));
    if (!scan) return c.json({ error: "NOT_FOUND" }, 404);
    const deals = await store.deals(scan.id);
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

  api.post("/api/scans", async (c) => {
    const parsed = scanInputSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) return c.json({ error: "INVALID_INPUT" }, 400);
    const services = scanServices(
      c.env.DB,
      c.get("userId"),
      c.env.BOX_KEY,
      c.env.OKALA_CLIENT_SECRET
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
          error instanceof ScanValidationError
            ? error.status
            : error instanceof CredentialError
              ? 409
              : 502
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
    // waitUntil owns this one Promise. A fiber does not extend the Worker's lifetime.
    const running = Effect.runPromiseExit(
      executeScan(job).pipe(Effect.provide(services))
    ).then((exit) => {
      if (Exit.isFailure(exit))
        console.error("Scan finalization failed", { scanId: job.id });
    });
    c.executionCtx.waitUntil(running);
    return c.json({ data: { id: job.id, status: "queued" } }, 202);
  });
}
