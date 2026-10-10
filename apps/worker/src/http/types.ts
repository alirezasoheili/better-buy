import type { AuthEnv } from "../auth";
import type { Hono } from "hono";
export type WorkerEnv = AuthEnv & {
  BOX_KEY: string;
  GEOCODER_BASE_URL?: string;
  CORS_ORIGIN?: string;
  DEV_MODE?: string;
  SNAPP_STORE_CAMPAIGNS_ENABLED?: string;
  SCAN_WORKFLOW_ENABLED?: string;
  SCAN_WORKFLOW_CONCURRENCY?: string;
  API_RATE_LIMITS_ENABLED?: string;
  SCAN_WORKFLOW?: Workflow<{ scanId: string; contractVersion: 1 }>;
  ASSETS: Fetcher;
};
export type Variables = { userId: string };

export type Api = Hono<{ Bindings: WorkerEnv; Variables: Variables }>;
