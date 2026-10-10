import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summarizeResearchCampaign } from "./snapp-campaign-research.mjs";

const evidence = JSON.parse(
  readFileSync(
    new URL(
      "../../../docs/better-buy-s05-campaign-comparison.json",
      import.meta.url
    ),
    "utf8"
  )
);
const candidate = (label) =>
  evidence.campaigns.find((row) => row.label === label);

describe("offline S05 coverage distinctions", () => {
  it("records Rani's nine apparent new identities without asserting applicability", () => {
    const rani = candidate("Rani");
    expect(summarizeResearchCampaign(rani, rani.baselineOffers)).toMatchObject({
      stockBacked40: 9,
      apparentOverlap: 0,
      apparentNetNew: 9,
      eligibleVendorConflicts: 0,
      applicability: "unverified",
      classification: "threshold_offers_with_apparent_net_new",
    });
  });

  it("distinguishes zero eligibility from eligible offers that are all numerical duplicates", () => {
    const rani = candidate("Rani");
    const allKnownPairs = rani.rows.map((row) => ({
      vendorId: String(row.vendor_id),
      productVariationId: String(row.id),
    }));
    expect(summarizeResearchCampaign(rani, allKnownPairs)).toMatchObject({
      stockBacked40: 9,
      apparentOverlap: 9,
      apparentNetNew: 0,
      classification: "threshold_offers_all_numerical_duplicates",
      applicability: "unverified",
    });
    const pril = candidate("Pril");
    expect(summarizeResearchCampaign(pril, pril.baselineOffers)).toMatchObject({
      stockBacked40: 0,
      apparentOverlap: 0,
      classification: "zero_threshold_offers_in_complete_snapshot",
    });
  });

  it("does not call an empty terminal and duplicated count a complete snapshot", () => {
    const dairy = candidate("Dairy floor-price section");
    expect(
      summarizeResearchCampaign(
        { ...dairy, complete: true },
        dairy.baselineOffers
      )
    ).toMatchObject({
      observedRows: 79,
      uniqueObservedPairs: 78,
      snapshotComplete: false,
      stockBacked40: 2,
    });
    const coffee = candidate("Coffee accompaniment section");
    expect(
      summarizeResearchCampaign(coffee, coffee.baselineOffers).classification
    ).toBe("zero_observed_threshold_offers_in_incomplete_snapshot");
  });

  it("does not generalize duplicate-only sampled rows to the entire incomplete campaign", () => {
    const dairy = candidate("Dairy floor-price section");
    const known = dairy.rows.map((row) => ({
      vendorId: String(row.vendor_id),
      productVariationId: String(row.id),
    }));
    expect(summarizeResearchCampaign(dairy, known)).toMatchObject({
      stockBacked40: 2,
      apparentOverlap: 2,
      apparentNetNew: 0,
      snapshotComplete: false,
      classification:
        "observed_threshold_offers_all_numerical_duplicates_in_incomplete_snapshot",
    });
  });

  it("quarantines conflicting vendor evidence instead of inventing a duplicate or new offer", () => {
    const rani = candidate("Rani");
    const row = rani.rows.find((r) => r.discountRatio >= 40);
    const conflict = {
      ...row,
      vendor: { ...row.vendor, id: row.vendor_id + 1 },
    };
    expect(
      summarizeResearchCampaign({ ...rani, rows: [conflict] }, [])
    ).toMatchObject({
      stockBacked40: 1,
      consistentVendor40: 0,
      eligibleVendorConflicts: 1,
      apparentNetNew: 0,
      classification: "threshold_offers_with_unresolved_vendor_identity",
    });
  });

  it("excludes unknown stock and invalid money while keeping the 40% threshold", () => {
    const rani = candidate("Rani");
    const row = rani.rows.find((r) => r.discountRatio >= 40);
    const rows = [
      { ...row, id: 1, stock: undefined },
      { ...row, id: 2, discount: row.price + 1 },
      { ...row, id: 3, discountRatio: 39, discount: row.price * 0.39 },
    ];
    expect(summarizeResearchCampaign({ ...rani, rows }, [])).toMatchObject({
      stockBacked40: 0,
      stockUnknown: 1,
      priceAnomalies: 1,
      apparentNetNew: 0,
    });
  });
});
