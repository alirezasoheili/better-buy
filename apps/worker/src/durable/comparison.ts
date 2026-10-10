import type { PageCheckpoint, Unit } from "./types";

/** Private audit facts. Never used to choose a campaign or mutate the feed. */
export async function readDurableComparison(
  db: D1Database,
  userId: string,
  scanId: string
) {
  const owned = await db
    .prepare(
      "SELECT e.manifest_frozen,s.status,json_extract(s.context_json,'$.coverage') AS coverage FROM scan_execution e JOIN scans s ON s.id=e.scan_id WHERE e.scan_id=? AND s.user_id=? AND e.execution_kind='workflow'"
    )
    .bind(scanId, userId)
    .first<{ manifest_frozen: number; status: string; coverage: string }>();
  if (!owned) return null;
  const units = await db
    .prepare(
      "SELECT unit_id,descriptor_json,terminal FROM scan_units WHERE scan_id=? ORDER BY unit_id"
    )
    .bind(scanId)
    .all<{ unit_id: string; descriptor_json: string; terminal: number }>();
  const pages = await db
    .prepare(
      "SELECT unit_id,metadata_json FROM scan_pages WHERE scan_id=? AND complete=1 ORDER BY unit_id,page"
    )
    .bind(scanId)
    .all<{ unit_id: string; metadata_json: string }>();
  const facts = new Map<
    string,
    Map<string, { eligible: boolean; excludedReason: string | null }>
  >();
  const rows = new Map<string, number>();
  for (const page of pages.results) {
    const checkpoint = JSON.parse(page.metadata_json) as PageCheckpoint;
    const identities = facts.get(page.unit_id) ?? new Map();
    for (const [identity, fact] of Object.entries(checkpoint.eligibility ?? {}))
      identities.set(identity, fact);
    facts.set(page.unit_id, identities);
    rows.set(page.unit_id, (rows.get(page.unit_id) ?? 0) + checkpoint.rowCount);
  }
  const baseline = new Set<string>();
  for (const row of units.results) {
    const unit = JSON.parse(row.descriptor_json) as Unit;
    if (unit.kind === "market_party")
      for (const [id, fact] of facts.get(row.unit_id) ?? [])
        if (fact.eligible) baseline.add(id);
  }
  const supplementary = new Set<string>();
  const accumulated = new Set(baseline);
  const campaigns = units.results.flatMap((row) => {
    const unit = JSON.parse(row.descriptor_json) as Unit;
    if (unit.kind !== "store_campaign") return [];
    const identities = facts.get(row.unit_id) ?? new Map();
    const eligible = [...identities]
      .filter(([, f]) => f.eligible)
      .map(([id]) => id)
      .sort();
    const excluded: Record<string, number> = {};
    for (const fact of identities.values())
      if (!fact.eligible && fact.excludedReason)
        excluded[fact.excludedReason] =
          (excluded[fact.excludedReason] ?? 0) + 1;
    eligible.forEach((id) => supplementary.add(id));
    const overlap = eligible.filter((id) => baseline.has(id)).length;
    const additional = eligible.filter((id) => !accumulated.has(id)).length;
    eligible.forEach((id) => accumulated.add(id));
    return [
      {
        unitId: unit.id,
        vendorId: unit.vendorId,
        collectionId: unit.collectionId,
        terminal: row.terminal === 1,
        rawCount: rows.get(row.unit_id) ?? 0,
        uniqueCount: identities.size,
        qualifying: eligible.length,
        eligibleIdentities: eligible,
        overlap,
        additional,
        excluded,
        outcome:
          eligible.length === 0
            ? "zero_eligible"
            : additional === 0
              ? "all_duplicates"
              : "net_new",
      },
    ];
  });
  const union = new Set([...baseline, ...supplementary]);
  return {
    scanId,
    frozen: owned.manifest_frozen === 1,
    complete:
      owned.status === "succeeded" &&
      owned.coverage === "complete" &&
      units.results.length > 0 &&
      units.results.every((u) => u.terminal === 1),
    baselineEligibleIdentities: [...baseline].sort(),
    baseline: baseline.size,
    supplementary: supplementary.size,
    overlap: [...supplementary].filter((id) => baseline.has(id)).length,
    union: union.size,
    additional: union.size - baseline.size,
    campaigns,
  };
}
