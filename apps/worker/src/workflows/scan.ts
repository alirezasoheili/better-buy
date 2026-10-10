import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { DurableRepository } from "../durable/repository";
import { runDurableScan } from "../durable/runner";
import { materializeProducts } from "../saved-products";
import type { WorkflowParams, Steps } from "../durable/types";
import type { WorkerEnv } from "../http/types";
import { DurableError } from "../durable/types";
import { CollectorError } from "../domain/failures";

export class ScanWorkflow extends WorkflowEntrypoint<
  WorkerEnv,
  WorkflowParams
> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const steps: Steps = {
      do: (name, action) =>
        step.do(
          name,
          {
            retries: { limit: 2, delay: "1 second", backoff: "exponential" },
            timeout: "1 minute",
          },
          async () => {
            try {
              return await action();
            } catch (error) {
              if (
                error instanceof DurableError ||
                error instanceof CollectorError
              )
                throw Object.assign(new NonRetryableError(error.code), {
                  code: error.code,
                });
              throw error;
            }
          }
        ),
      sleep: (name, duration) => step.sleep(name, duration),
    };
    return runDurableScan(event.payload, {
      repository: new DurableRepository(this.env.DB, this.env.BOX_KEY),
      steps,
      materialize: (userId, scanId) =>
        materializeProducts(this.env.DB, userId, scanId),
    });
  }
}
