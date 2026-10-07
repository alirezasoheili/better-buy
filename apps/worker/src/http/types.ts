import type { AuthEnv } from "../auth";
import type { Hono } from "hono";
export type WorkerEnv = AuthEnv & {
  BOX_KEY: string;
  GEOCODER_BASE_URL?: string;
  CORS_ORIGIN?: string;
  DEV_MODE?: string;
  ASSETS: Fetcher;
};
export type Variables = { userId: string };

export type Api = Hono<{ Bindings: WorkerEnv; Variables: Variables }>;
