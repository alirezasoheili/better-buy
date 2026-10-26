import handler from "./index";
import { reconcileDurableOperations } from "./durable/service";
import type { WorkerEnv } from "./http/types";
import { cleanupRateLimits } from "./http/rateLimit";
import { runWishlistSchedule } from "./wishlist-scheduler";
import { processWishlistNotifications } from "./wishlist";

// Keep the runtime entrypoint separate from the HTTP application test seam.
export { ScanWorkflow } from "./workflows/scan";
export default {
  fetch: handler.fetch,
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        if (env.SCAN_WORKFLOW)
          await reconcileDurableOperations({
            ...env,
            SCAN_WORKFLOW: env.SCAN_WORKFLOW,
          });
        await processWishlistNotifications(env);
        await runWishlistSchedule(env, event.scheduledTime);
        if (env.API_RATE_LIMITS_ENABLED === "true")
          await cleanupRateLimits(env.DB);
      })()
    );
  },
} satisfies ExportedHandler<WorkerEnv>;
