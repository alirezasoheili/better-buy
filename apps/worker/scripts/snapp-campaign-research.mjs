// Offline research arithmetic only. Nothing here is imported by the collector,
// manifest policy or UI; applicability must be verified before admission.
export function summarizeResearchCampaign(campaign, baselineOffers) {
  const pair = (row) => `${row.vendor_id}:${row.id}`;
  const rows = [
    ...new Map(campaign.rows.map((row) => [pair(row), row])).values(),
  ];
  const validMoney = (row) =>
    Number.isSafeInteger(row.price) &&
    Number.isSafeInteger(row.discount) &&
    row.price > 0 &&
    row.discount >= 0 &&
    row.discount <= row.price;
  // A provisional 0.5 percentage-point discrepancy guard for research counts,
  // not a shipped normalization tolerance. Preserve unrounded derived ratios.
  const ratioValid = (row) =>
    row.discountRatio == null ||
    (Number.isFinite(row.discountRatio) &&
      row.discountRatio >= 0 &&
      row.discountRatio <= 100 &&
      Math.abs(row.discountRatio - (100 * row.discount) / row.price) <= 0.5);
  const thresholdRows = rows.filter(
    (row) =>
      validMoney(row) &&
      ratioValid(row) &&
      Number.isFinite(row.stock) &&
      row.stock > 0 &&
      row.no_stock === false &&
      (row.discountRatio ?? (100 * row.discount) / row.price) >= 40
  );
  const consistent = (row) =>
    row.vendor?.id != null && String(row.vendor_id) === String(row.vendor.id);
  const trustedIdentityRows = thresholdRows.filter(consistent);
  const baseline = new Set(
    baselineOffers.map((row) => `${row.vendorId}:${row.productVariationId}`)
  );
  const overlap = trustedIdentityRows.filter((row) =>
    baseline.has(pair(row))
  ).length;
  const newOffers = trustedIdentityRows.length - overlap;
  const eligibleConflicts = thresholdRows.length - trustedIdentityRows.length;
  const snapshotComplete =
    campaign.complete === true &&
    campaign.terminal === true &&
    campaign.countStable === true &&
    campaign.rows.length === campaign.reportedCount &&
    rows.length === campaign.reportedCount;
  return {
    observedRows: campaign.rows.length,
    uniqueObservedPairs: rows.length,
    repeatedPairOccurrences: campaign.rows.length - rows.length,
    snapshotComplete,
    stockBacked40: thresholdRows.length,
    consistentVendor40: trustedIdentityRows.length,
    eligibleVendorConflicts: eligibleConflicts,
    allVendorConflicts: campaign.rows.filter((row) => !consistent(row)).length,
    apparentOverlap: overlap,
    apparentNetNew: newOffers,
    stockUnknown: rows.filter(
      (row) => !Number.isFinite(row.stock) || typeof row.no_stock !== "boolean"
    ).length,
    priceAnomalies: rows.filter((row) => !validMoney(row) || !ratioValid(row))
      .length,
    classification: eligibleConflicts
      ? "threshold_offers_with_unresolved_vendor_identity"
      : thresholdRows.length === 0
        ? snapshotComplete
          ? "zero_threshold_offers_in_complete_snapshot"
          : "zero_observed_threshold_offers_in_incomplete_snapshot"
        : newOffers > 0
          ? "threshold_offers_with_apparent_net_new"
          : snapshotComplete
            ? "threshold_offers_all_numerical_duplicates"
            : "observed_threshold_offers_all_numerical_duplicates_in_incomplete_snapshot",
    applicability: "unverified",
  };
}
