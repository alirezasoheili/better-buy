import type { ScanRecord } from "@better-buy/shared";
import { Store } from "../store";
import type { ScanInput, ScanJob } from "../application/scans";
import { DurableRepository } from "./repository";
import { DurableError, type DurableEnv } from "./types";

type LocalEnv = Pick<
  DurableEnv,
  "DB" | "BOX_KEY" | "SNAPP_STORE_CAMPAIGNS_ENABLED"
> & { SCAN_WORKFLOW_CONCURRENCY?: string };
export async function findStartIntent(
  env: LocalEnv,
  userId: string,
  key: string
) {
  const intent = await env.DB.prepare(
    "SELECT scan_id FROM scan_start_intents WHERE user_id=? AND idempotency_key=?"
  )
    .bind(userId, key)
    .first<{ scan_id: string }>();
  return intent
    ? new Store(env.DB, userId, env.BOX_KEY).scan(intent.scan_id)
    : null;
}
export async function beginLegacyScan(
  env: LocalEnv,
  userId: string,
  input: ScanInput,
  key: string | undefined
): Promise<{ scan: ScanRecord; job: ScanJob | null }> {
  const repo = new DurableRepository(env.DB, env.BOX_KEY);
  const scan = await repo.reserve(
    userId,
    input,
    key,
    env.SNAPP_STORE_CAMPAIGNS_ENABLED === "true",
    "legacy"
  );
  const claim = await env.DB.prepare(
    "UPDATE scan_execution SET dispatch_state='dispatched' WHERE scan_id=? AND user_id=? AND execution_kind='legacy' AND dispatch_state='dispatch_pending' AND EXISTS(SELECT 1 FROM scans WHERE id=? AND status='queued')"
  )
    .bind(scan.id, userId, scan.id)
    .run();
  if (!claim.meta.changes) return { scan, job: null };
  const runtime = await repo.load(scan.id, userId);
  if (!runtime)
    throw new DurableError(
      "PERSISTENCE_ERROR",
      "Start reservation missing",
      502
    );
  const location = await new Store(env.DB, userId, env.BOX_KEY).location(
    scan.locationId
  );
  if (!location)
    throw new DurableError(
      "LOCATION_NOT_FOUND",
      "Location is unavailable",
      404
    );
  const frozen = scan.context!.location;
  return {
    scan,
    job: {
      ...input,
      id: scan.id,
      threshold: scan.threshold,
      requestedThreshold: input.threshold,
      location: {
        ...location,
        name: frozen.name,
        latitude: frozen.latitude,
        longitude: frozen.longitude,
        coordinateRevision: frozen.revision,
      },
      access: null,
    },
  };
}
export async function beginDurableScan(
  env: DurableEnv & LocalEnv,
  userId: string,
  input: ScanInput,
  key: string | undefined
) {
  const repo = new DurableRepository(env.DB, env.BOX_KEY);
  const limit = Number(env.SCAN_WORKFLOW_CONCURRENCY ?? 1);
  const scan = await repo.reserve(
    userId,
    input,
    key,
    env.SNAPP_STORE_CAMPAIGNS_ENABLED === "true",
    "workflow",
    Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 10) : 1
  );
  await reconcileDurableScan(env, userId, scan.id);
  return (await new Store(env.DB, userId, env.BOX_KEY).scan(scan.id))!;
}
export async function reconcileDurableScan(
  env: DurableEnv,
  userId: string,
  scanId: string
) {
  const repo = new DurableRepository(env.DB, env.BOX_KEY),
    job = await repo.load(scanId, userId);
  if (!job) return new Store(env.DB, userId, env.BOX_KEY).scan(scanId);
  if (
    job.runtime.execution_kind !== "workflow" ||
    (job.scan.status !== "queued" && job.scan.status !== "running")
  )
    return job.scan;
  let instance: WorkflowInstance | undefined;
  let confirmedMissing = false;
  try {
    instance = await env.SCAN_WORKFLOW.get(job.runtime.instance_id);
    await instance.status();
  } catch (error) {
    confirmedMissing =
      typeof error === "object" &&
      error !== null &&
      (("status" in error && error.status === 404) ||
        ("code" in error && error.code === "WORKFLOW_NOT_FOUND"));
    instance = undefined;
  }
  if (!instance && job.runtime.dispatch_state === "dispatch_pending") {
    try {
      instance = await env.SCAN_WORKFLOW.create({
        id: job.runtime.instance_id,
        params: { scanId, contractVersion: 1 },
      });
      await repo.dispatchState(scanId, "dispatched");
    } catch {
      try {
        instance = await env.SCAN_WORKFLOW.get(job.runtime.instance_id);
        await instance.status();
        await repo.dispatchState(scanId, "dispatched");
      } catch {
        /* Keep the dispatch intent; retry only this deterministic instance ID. */
      }
    }
  }
  if (instance) {
    try {
      const state = await instance.status();
      if (
        state.status === "errored" ||
        state.status === "terminated" ||
        state.status === "complete"
      ) {
        const current = await repo.load(scanId, userId);
        if (
          current?.scan.status === "queued" ||
          current?.scan.status === "running"
        )
          await repo.fail(scanId, "ENGINE_TERMINAL");
      } else if (
        state.status === "queued" &&
        Date.now() > Date.parse(job.runtime.queued_until)
      ) {
        await repo.fail(scanId, "DISPATCH_TIMEOUT");
        try {
          await instance.terminate();
        } catch {
          /* D1 owns terminal state. */
        }
      } else if (Date.now() > Date.parse(job.runtime.deadline_at)) {
        await repo.fail(scanId, "SCAN_BUDGET_EXCEEDED");
        try {
          await instance.terminate();
        } catch {
          /* D1 owns terminal state. */
        }
      }
    } catch {
      /* Engine status is uncertain; never fail a healthy scan based on a read error. */
    }
  } else if (
    confirmedMissing &&
    Date.now() > Date.parse(job.runtime.queued_until)
  ) {
    await repo.fail(scanId, "DISPATCH_TIMEOUT");
  }
  return new Store(env.DB, userId, env.BOX_KEY).scan(scanId);
}
export async function cancelDurableScan(
  env: DurableEnv,
  userId: string,
  scanId: string
) {
  const repo = new DurableRepository(env.DB, env.BOX_KEY),
    job = await repo.load(scanId, userId);
  if (!job) return null;
  if (job.runtime.execution_kind !== "workflow")
    throw new DurableError(
      "CANCEL_UNAVAILABLE",
      "Cancellation is unavailable for this update",
      409
    );
  const changed = await repo.cancel(scanId, userId);
  if (changed) {
    try {
      await (await env.SCAN_WORKFLOW.get(job.runtime.instance_id)).terminate();
    } catch {
      /* Cooperative writes already reject work. */
    }
  }
  return new Store(env.DB, userId, env.BOX_KEY).scan(scanId);
}
export async function reconcileDurableOperations(env: DurableEnv) {
  const { results } = await env.DB.prepare(
    "SELECT e.scan_id,e.user_id FROM scan_execution e JOIN scans s ON s.id=e.scan_id WHERE e.execution_kind='workflow' AND s.status IN ('queued','running') ORDER BY COALESCE(e.heartbeat_at,e.created_at) LIMIT 20"
  )
    .bind()
    .all<{ scan_id: string; user_id: string }>();
  for (const row of results)
    await reconcileDurableScan(env, row.user_id, row.scan_id);
}
