import handler from "./index";
import { reconcileDurableOperations } from "./durable/service";
import type { WorkerEnv } from "./http/types";
import { cleanupRateLimits } from "./http/rateLimit";

// Keep the runtime entrypoint separate from the HTTP application test seam.
export { ScanWorkflow } from "./workflows/scan";
export default {
  fetch: handler.fetch,
  async scheduled(_event, env, ctx) {
    if (env.API_RATE_LIMITS_ENABLED === "true")
      ctx.waitUntil(cleanupRateLimits(env.DB));
    // Rollback stops new durable starts; existing intents still need recovery.
    if (env.SCAN_WORKFLOW) {
      ctx.waitUntil(
        reconcileDurableOperations({ ...env, SCAN_WORKFLOW: env.SCAN_WORKFLOW })
      );
    }
  },
} satisfies ExportedHandler<WorkerEnv>;
