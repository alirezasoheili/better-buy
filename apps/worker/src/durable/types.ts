import type { DealRecord, ScanContext, ScanRecord } from "@better-buy/shared";

export type Offer = Omit<DealRecord, "scanId" | "state">;
export const PLANNING_AUDIT_KEY = "audit:store-campaign-planning";
export type CampaignPlanningAudit = {
  complete: boolean;
  failureCode: string | null;
  omitted: {
    vendorCode: string;
    collectionId?: number;
    sectionType?: string;
    reason: string;
    fields?: string[];
  }[];
  omittedCount: number;
  truncatedCount: number;
  reasonCounts: Record<string, number>;
};
export type WorkflowParams = { scanId: string; contractVersion: 1 };
export class DurableError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 | 409 | 422 | 429 | 502 = 409
  ) {
    super(message);
  }
}
export type Unit = {
  id: string;
  kind: "market_party" | "store_campaign" | "okala_campaign";
  vendorId?: number;
  vendorCode?: string;
  collectionId?: number;
  title?: string;
  storeIds?: number[];
  firstRequest?: string;
};
export type Page = {
  offers: Offer[];
  products: string[];
  vendors: string[];
  identities: string[];
  signatures?: Record<string, string>;
  eligibility?: Record<
    string,
    { eligible: boolean; excludedReason: string | null }
  >;
  reportedTotal: number;
  rowCount: number;
  terminal: boolean;
  terminalEvidence: string | null;
  fingerprint: string;
};
export type Runtime = {
  scan_id: string;
  user_id: string;
  instance_id: string;
  contract_version: number;
  execution_kind: string;
  device_id: string;
  phase: string;
  dispatch_state: string;
  manifest_frozen: number;
  enrichment_enabled: number;
  cancel_requested: number;
  attempt_count: number;
  attempt_limit: number;
  page_limit: number;
  offer_limit: number;
  deadline_at: string;
  queued_until: string;
  heartbeat_at: string | null;
  created_at: string;
};
export type Job = { runtime: Runtime; scan: ScanRecord; context: ScanContext };
export type PageCheckpoint = Omit<Page, "offers" | "products" | "vendors">;
export interface Steps {
  do<T extends Rpc.Serializable<T>>(
    name: string,
    action: () => Promise<T>
  ): Promise<T>;
  sleep(name: string, durationMs: number): Promise<void>;
}
export interface DurableEnv {
  DB: D1Database;
  BOX_KEY: string;
  SCAN_WORKFLOW: {
    create(options: {
      id: string;
      params: WorkflowParams;
    }): Promise<WorkflowInstance>;
    get(id: string): Promise<WorkflowInstance>;
  };
  SNAPP_STORE_CAMPAIGNS_ENABLED?: string;
}
