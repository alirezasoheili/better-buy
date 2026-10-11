import type { LocationRecord, ScanRecord } from "./contracts";

export interface ScanContext {
  location: {
    name: string;
    latitude: number;
    longitude: number;
    revision: number;
  };
  requestedThreshold: number;
  effectiveThreshold: number;
  policyVersion: "automatic-v1";
  manifest: {
    adapter: string;
    contractVersion: number;
    feedKinds: string[];
    collectionIds?: number[];
    storeIds?: number[];
    storeCampaigns?: {
      vendorId: number;
      vendorCode: string;
      collectionId: number;
      source?: "discounted_category";
      expectedPageSize?: number;
      maxPages?: number;
      bounded?: boolean;
    }[];
  };
  scopeHash: string;
  eligibilityVersion: 1;
  offerKeyVersion: 1;
  coverage: "pending" | "complete" | "incomplete";
}

export async function identityDigest(identity: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(identity));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

// Only the existing supported collectors are admitted. Additional adapters need
// the spec's research gates; no browser selector can expand this manifest.
export async function defaultScanContext(
  location: LocationRecord,
  source: ScanRecord["source"],
  effectiveThreshold: number,
  requestedThreshold = effectiveThreshold
): Promise<ScanContext> {
  const manifest = {
    adapter:
      source === "snappmarket"
        ? "snapp-market-party"
        : "okala-public-campaigns",
    contractVersion: 1,
    feedKinds:
      source === "snappmarket" ? ["market_party"] : ["public_campaign_feed"],
  };
  return {
    location: {
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      revision: location.coordinateRevision ?? 1,
    },
    requestedThreshold,
    effectiveThreshold,
    policyVersion: "automatic-v1",
    manifest,
    scopeHash: await identityDigest([
      source,
      manifest,
      effectiveThreshold,
      1,
      1,
    ]),
    eligibilityVersion: 1,
    offerKeyVersion: 1,
    coverage: "pending",
  };
}
