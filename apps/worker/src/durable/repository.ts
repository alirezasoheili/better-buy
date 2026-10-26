import {
  defaultScanContext,
  identityDigest,
  isWithinTehranBoundary,
  type ScanContext,
  type ScanRecord,
} from "@better-buy/shared";
import type { ScanInput } from "../application/scans";
import { Store } from "../store";
import { terminalScanArtifactStatements } from "../scan-artifacts";
import {
  DurableError,
  type Job,
  type Page,
  type PageCheckpoint,
  type Runtime,
  type Unit,
  type Offer,
  PLANNING_AUDIT_KEY,
  type CampaignPlanningAudit,
} from "./types";
export { DurableError } from "./types";

const iso = () => new Date().toISOString();
const active =
  "EXISTS (SELECT 1 FROM scans s JOIN scan_execution e ON e.scan_id=s.id WHERE s.id=? AND s.user_id=? AND s.status IN ('queued','running') AND e.cancel_requested=0)";
// Money, stock, and presentation stay together. Priority is only a time tie-break;
// a stable feed identity makes equal-priority ties independent of stage order.
const retainedObservation = `(
  COALESCE(json_extract(deals.facts_json,'$.observedAt'),'') > COALESCE(json_extract(excluded.facts_json,'$.observedAt'),'')
  OR (COALESCE(json_extract(deals.facts_json,'$.observedAt'),'') = COALESCE(json_extract(excluded.facts_json,'$.observedAt'),'') AND (
    COALESCE(json_extract(deals.facts_json,'$.observationPriority'),0) > COALESCE(json_extract(excluded.facts_json,'$.observationPriority'),0)
    OR (COALESCE(json_extract(deals.facts_json,'$.observationPriority'),0) = COALESCE(json_extract(excluded.facts_json,'$.observationPriority'),0)
      AND COALESCE(json_extract(deals.facts_json,'$.observationFeed'),'') <= COALESCE(json_extract(excluded.facts_json,'$.observationFeed'),''))
  ))
)`;
export class DurableRepository {
  constructor(
    readonly db: D1Database,
    readonly boxKey: string
  ) {}
  async reserve(
    userId: string,
    input: ScanInput,
    key: string | undefined,
    enrichment: boolean,
    kind = "workflow",
    concurrency = 1
  ): Promise<ScanRecord> {
    if (
      key &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        key
      )
    )
      throw new DurableError(
        "INVALID_IDEMPOTENCY_KEY",
        "Start intent must be a UUID",
        400
      );
    const fingerprint = await identityDigest([
      input.locationId,
      input.source,
      input.threshold,
      input.mode,
    ]);
    const store = new Store(this.db, userId, this.boxKey);
    const existing = async () => {
      if (!key) return null;
      const intent = await this.db
        .prepare(
          "SELECT fingerprint,scan_id FROM scan_start_intents WHERE user_id=? AND idempotency_key=?"
        )
        .bind(userId, key)
        .first<{ fingerprint: string; scan_id: string }>();
      if (!intent) return null;
      if (intent.fingerprint !== fingerprint)
        throw new DurableError(
          "IDEMPOTENCY_CONFLICT",
          "This start intent belongs to another request",
          409
        );
      return store.scan(intent.scan_id);
    };
    const prior = await existing();
    if (prior) return prior;
    if (input.source === "digikalajet")
      throw new DurableError(
        "PROVIDER_UNAVAILABLE",
        "Provider is unavailable",
        409
      );
    const location = await store.location(input.locationId);
    if (!location)
      throw new DurableError(
        "LOCATION_NOT_FOUND",
        "Location is unavailable",
        404
      );
    if (!isWithinTehranBoundary(location.latitude, location.longitude))
      throw new DurableError(
        "OUTSIDE_TEHRAN",
        "Location is outside supported delivery area",
        422
      );
    const current = await store.activeScan();
    if (current) throw new DurableError("SCAN_IN_PROGRESS", current.id, 409);
    const threshold =
      input.source === "okala"
        ? Math.max(30, input.threshold)
        : input.threshold;
    const context = await defaultScanContext(
      location,
      input.source,
      threshold,
      input.threshold
    );
    const id = crypto.randomUUID(),
      at = iso();
    const statements = [
      this.db
        .prepare(
          "INSERT INTO scans(id,user_id,location_id,threshold,source,mode,status,created_at,context_json) SELECT ?,?,?,?,?,?,'queued',?,? WHERE EXISTS(SELECT 1 FROM locations WHERE id=? AND user_id=? AND coordinate_revision=? AND latitude=? AND longitude=?) AND (?='legacy' OR (SELECT COUNT(*) FROM scan_execution e JOIN scans s ON s.id=e.scan_id WHERE e.execution_kind='workflow' AND s.status IN ('queued','running')) < ?)"
        )
        .bind(
          id,
          userId,
          input.locationId,
          threshold,
          input.source,
          input.mode,
          at,
          JSON.stringify(context),
          location.id,
          userId,
          location.coordinateRevision ?? 1,
          location.latitude,
          location.longitude,
          kind,
          concurrency
        ),
      this.db
        .prepare(
          "INSERT INTO scan_execution(scan_id,user_id,execution_kind,instance_id,device_id,enrichment_enabled,attempt_limit,deadline_at,queued_until,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)"
        )
        .bind(
          id,
          userId,
          kind,
          `scan-${id}`,
          crypto.randomUUID(),
          enrichment ? 1 : 0,
          input.source === "snappmarket" && enrichment ? 40 : 250,
          new Date(Date.now() + 15 * 60_000).toISOString(),
          new Date(Date.now() + 10 * 60_000).toISOString(),
          at
        ),
    ];
    if (key)
      statements.push(
        this.db
          .prepare(
            "INSERT INTO scan_start_intents(user_id,idempotency_key,fingerprint,scan_id) VALUES(?,?,?,?)"
          )
          .bind(userId, key, fingerprint, id)
      );
    try {
      await this.db.batch(statements);
    } catch (error) {
      const raced = await existing();
      if (raced) return raced;
      const uniqueActiveConflict =
        error instanceof Error &&
        /UNIQUE constraint failed:\s*scans\.user_id/.test(error.message);
      if (uniqueActiveConflict || (await store.activeScan()))
        throw new DurableError(
          "SCAN_IN_PROGRESS",
          "An update is already active",
          409
        );
      if (kind === "workflow") {
        const n = await this.db
          .prepare(
            "SELECT COUNT(*) AS count FROM scan_execution e JOIN scans s ON s.id=e.scan_id WHERE e.execution_kind='workflow' AND s.status IN ('queued','running')"
          )
          .bind()
          .first<{ count: number }>();
        if ((n?.count ?? 0) >= concurrency)
          throw new DurableError(
            "SCAN_CAPACITY",
            "Updates are at capacity; try again shortly",
            429
          );
      }
      throw error;
    }
    const scan = await store.scan(id);
    if (!scan)
      throw new DurableError(
        "LOCATION_NOT_FOUND",
        "Location changed during start",
        404
      );
    return scan;
  }
  async load(id: string, userId?: string): Promise<Job | null> {
    const runtime = await this.db
      .prepare(
        "SELECT * FROM scan_execution WHERE scan_id=?" +
          (userId ? " AND user_id=?" : "")
      )
      .bind(...(userId ? [id, userId] : [id]))
      .first<Runtime>();
    if (!runtime) return null;
    const scan = await new Store(this.db, runtime.user_id, this.boxKey).scan(
      id
    );
    if (!scan?.context) return null;
    return { runtime, scan, context: scan.context };
  }
  async check(id: string) {
    const job = await this.load(id);
    if (!job) throw new DurableError("NOT_FOUND", "Unknown update", 404);
    if (job.scan.status !== "queued" && job.scan.status !== "running")
      throw new DurableError("TERMINAL_SCAN", "Update is already terminal");
    if (job.runtime.cancel_requested)
      throw new DurableError("CANCELLED", "Update was cancelled");
    if (Date.now() > Date.parse(job.runtime.deadline_at))
      throw new DurableError(
        "SCAN_BUDGET_EXCEEDED",
        "Update deadline exceeded"
      );
    return job;
  }
  async started(id: string) {
    const job = await this.check(id);
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE scans SET status='running',started_at=COALESCE(started_at,?) WHERE id=? AND user_id=? AND status='queued'"
        )
        .bind(iso(), id, job.runtime.user_id),
      this.db
        .prepare(
          "UPDATE scan_execution SET phase='planning',heartbeat_at=?,dispatch_state='dispatched' WHERE scan_id=?"
        )
        .bind(iso(), id),
    ]);
  }
  async heartbeat(id: string, phase: string) {
    const job = await this.check(id);
    await this.db
      .prepare(
        `UPDATE scan_execution SET heartbeat_at=?,phase=? WHERE scan_id=? AND ${active}`
      )
      .bind(iso(), phase, id, id, job.runtime.user_id)
      .run();
  }
  async reserveAttempt(id: string, operation: string) {
    const job = await this.check(id);
    const ordinal = job.runtime.attempt_count + 1;
    const result = await this.db.batch([
      this.db
        .prepare(
          `UPDATE scan_execution SET attempt_count=attempt_count+1,heartbeat_at=? WHERE scan_id=? AND attempt_count=? AND attempt_count < attempt_limit AND (SELECT COUNT(*) FROM scan_attempts WHERE scan_id=? AND operation=?) < 3 AND ${active}`
        )
        .bind(
          iso(),
          id,
          job.runtime.attempt_count,
          id,
          operation,
          id,
          job.runtime.user_id
        ),
      this.db
        .prepare(
          `INSERT INTO scan_attempts(scan_id,operation,ordinal,reserved_at) SELECT ?,?,attempt_count,? FROM scan_execution WHERE scan_id=? AND attempt_count=? AND ${active}`
        )
        .bind(id, operation, iso(), id, ordinal, id, job.runtime.user_id),
    ]);
    if (!result[0]?.meta.changes)
      throw new DurableError(
        "SCAN_BUDGET_EXCEEDED",
        "Outbound request budget exhausted"
      );
    console.info("Durable request reserved", {
      scanId: id,
      operation,
      attempt: ordinal,
    });
  }
  async claimGuestRefresh(id: string) {
    const job = await this.check(id);
    const result = await this.db
      .prepare(
        `UPDATE scan_execution SET guest_401_refreshed=1 WHERE scan_id=? AND guest_401_refreshed=0 AND ${active}`
      )
      .bind(id, id, job.runtime.user_id)
      .run();
    return result.meta.changes === 1;
  }
  async discovery(id: string, key: string) {
    const row = await this.db
      .prepare(
        "SELECT body_json FROM scan_discovery WHERE scan_id=? AND request_key=?"
      )
      .bind(id, key)
      .first<{ body_json: string }>();
    return row ? (JSON.parse(row.body_json) as unknown) : null;
  }
  async discoveryObservedAt(id: string, key: string) {
    const row = await this.db
      .prepare(
        "SELECT observed_at FROM scan_discovery WHERE scan_id=? AND request_key=?"
      )
      .bind(id, key)
      .first<{ observed_at: string | null }>();
    return row?.observed_at ?? null;
  }
  async savePlanningAudit(
    id: string,
    omitted: CampaignPlanningAudit["omitted"],
    failureCode: string | null = null
  ) {
    const reasonCounts: Record<string, number> = {};
    const safe = omitted.map((entry) => {
      const prefix = entry.reason.split(":")[0] ?? "";
      const reason = /^[A-Z_]{1,80}$/.test(prefix)
        ? prefix
        : "UNKNOWN_CANDIDATE_OMISSION";
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
      const fields =
        reason === "HOME_SCHEMA"
          ? (entry.reason.split(":")[1] ?? "")
              .trim()
              .split(",")
              .filter(
                (field) =>
                  /^(vendorInfo|sections|data)(\.[A-Za-z0-9_]+)*$/.test(
                    field
                  ) && field.length <= 120
              )
              .slice(0, 8)
          : [];
      return {
        vendorCode: /^[a-zA-Z0-9]{1,64}$/.test(entry.vendorCode)
          ? entry.vendorCode
          : "",
        reason,
        ...(Number.isSafeInteger(entry.collectionId) && entry.collectionId! > 0
          ? { collectionId: entry.collectionId }
          : {}),
        ...(entry.sectionType &&
        /^[a-z][a-z0-9_-]{0,47}$/.test(entry.sectionType)
          ? { sectionType: entry.sectionType }
          : {}),
        ...(fields.length ? { fields } : {}),
      };
    });
    const safeFailureCode =
      failureCode === null
        ? null
        : /^[A-Z_]{1,80}$/.test(failureCode)
          ? failureCode
          : "UNKNOWN_DISCOVERY_FAILURE";
    const audit: CampaignPlanningAudit = {
      complete: safeFailureCode === null,
      failureCode: safeFailureCode,
      omitted: safe.slice(0, 100),
      omittedCount: safe.length,
      truncatedCount: Math.max(0, safe.length - 100),
      reasonCounts,
    };
    await this.saveDiscovery(id, PLANNING_AUDIT_KEY, audit);
  }
  async saveDiscovery(
    id: string,
    key: string,
    body: unknown,
    observedAt = iso()
  ) {
    const job = await this.check(id);
    const value = JSON.stringify(body);
    if (value.length > 1_500_000)
      throw new DurableError(
        "SCAN_BUDGET_EXCEEDED",
        "Provider response exceeds bounded size"
      );
    const r = await this.db
      .prepare(
        `INSERT INTO scan_discovery(scan_id,request_key,body_json,observed_at) SELECT ?,?,?,? WHERE ${active} ON CONFLICT(scan_id,request_key) DO NOTHING`
      )
      .bind(id, key, value, observedAt, id, job.runtime.user_id)
      .run();
    if (!r.meta.changes && !(await this.discovery(id, key)))
      throw new DurableError("CANCELLED", "Response commit rejected");
  }
  async units(id: string) {
    const { results } = await this.db
      .prepare(
        "SELECT descriptor_json FROM scan_units WHERE scan_id=? ORDER BY unit_id"
      )
      .bind(id)
      .all<{ descriptor_json: string }>();
    return results.map((r) => JSON.parse(r.descriptor_json) as Unit);
  }
  async freeze(id: string, units: Unit[], manifest: ScanContext["manifest"]) {
    const job = await this.check(id);
    if (job.runtime.manifest_frozen) {
      return;
    }
    const context = {
      ...job.context,
      manifest,
      scopeHash: await identityDigest([
        job.scan.source,
        manifest,
        job.scan.threshold,
        1,
        1,
      ]),
    };
    const statements = units.map((unit) =>
      this.db
        .prepare(
          `INSERT INTO scan_units(scan_id,unit_id,descriptor_json) SELECT ?,?,? WHERE ${active} ON CONFLICT DO NOTHING`
        )
        .bind(id, unit.id, JSON.stringify(unit), id, job.runtime.user_id)
    );
    statements.push(
      this.db
        .prepare(
          `UPDATE scans SET context_json=? WHERE id=? AND user_id=? AND ${active}`
        )
        .bind(
          JSON.stringify(context),
          id,
          job.runtime.user_id,
          id,
          job.runtime.user_id
        ),
      this.db
        .prepare(
          `UPDATE scan_execution SET manifest_frozen=1,phase='collecting',heartbeat_at=? WHERE scan_id=? AND ${active}`
        )
        .bind(iso(), id, id, job.runtime.user_id)
    );
    const result = await this.db.batch(statements);
    if (!result.at(-1)?.meta.changes)
      throw new DurableError("CANCELLED", "Manifest freeze rejected");
  }
  async checkpoint(
    id: string,
    unitId: string,
    page: number
  ): Promise<PageCheckpoint | null> {
    const row = await this.db
      .prepare(
        "SELECT metadata_json FROM scan_pages WHERE scan_id=? AND unit_id=? AND page=? AND complete=1"
      )
      .bind(id, unitId, page)
      .first<{ metadata_json: string }>();
    return row ? (JSON.parse(row.metadata_json) as PageCheckpoint) : null;
  }
  async pages(id: string, unitId: string) {
    const { results } = await this.db
      .prepare(
        "SELECT metadata_json FROM scan_pages WHERE scan_id=? AND unit_id=? AND complete=1 ORDER BY page"
      )
      .bind(id, unitId)
      .all<{ metadata_json: string }>();
    return results.map((r) => JSON.parse(r.metadata_json) as PageCheckpoint);
  }
  async stage(id: string, unit: Unit, page: number, data: Page) {
    const job = await this.check(id),
      digest = await identityDigest({
        ...data,
        offers: data.offers.map(({ observedAt, ...offer }) => offer),
      }),
      existing = await this.db
        .prepare(
          "SELECT digest,complete FROM scan_pages WHERE scan_id=? AND unit_id=? AND page=?"
        )
        .bind(id, unit.id, page)
        .first<{ digest: string; complete: number }>();
    if (existing && existing.digest !== digest)
      throw new DurableError(
        "INCOMPLETE_PAGINATION",
        "Committed page content changed"
      );
    if (existing?.complete) return;
    const count = await this.db
      .prepare("SELECT COUNT(*) AS count FROM scan_pages WHERE scan_id=?")
      .bind(id)
      .first<{ count: number }>();
    if (!existing && (count?.count ?? 0) >= job.runtime.page_limit)
      throw new DurableError("SCAN_BUDGET_EXCEEDED", "Page budget exhausted");
    const { offers, products, vendors, ...metadata } = data;
    // Each bounded chunk commits observations and its ledger together. Empty pages have one empty chunk.
    const rows: { kind: string; identity: string; offer?: Offer }[] = [
      ...offers.map((offer) => ({ kind: "offer", identity: offer.key, offer })),
      ...products.map((identity) => ({ kind: "product", identity })),
      ...vendors.map((identity) => ({ kind: "vendor", identity })),
      ...data.identities.map((identity) => ({
        kind: `unit:${unit.id}`,
        identity,
      })),
    ];
    const chunks = Math.max(1, Math.ceil(rows.length / 20));
    await this.db
      .prepare(
        `INSERT INTO scan_pages(scan_id,unit_id,page,digest,metadata_json,expected_chunks) SELECT ?,?,?,?,?,? WHERE ${active} ON CONFLICT DO NOTHING`
      )
      .bind(
        id,
        unit.id,
        page,
        digest,
        JSON.stringify(metadata),
        chunks,
        id,
        job.runtime.user_id
      )
      .run();
    for (let chunk = 0; chunk < chunks; chunk++) {
      await this.check(id);
      const previous = await this.db
        .prepare(
          "SELECT digest FROM scan_chunks WHERE scan_id=? AND unit_id=? AND page=? AND chunk=?"
        )
        .bind(id, unit.id, page, chunk)
        .first();
      if (previous) continue;
      const statements: D1PreparedStatement[] = [];
      for (const row of rows.slice(chunk * 20, (chunk + 1) * 20)) {
        if (row.offer) {
          const o = row.offer;
          const priority = unit.kind === "market_party" ? 100 : 50;
          const facts = JSON.stringify({
            benefit: o.benefit ?? {
              kind: "standard_discount",
              identity: "ordinary",
              applicable: true,
              terms: null,
            },
            observedAt: o.observedAt ?? iso(),
            provenance: o.provenance ?? [unit.kind],
            observationPriority: priority,
            observationFeed: unit.id,
          });
          statements.push(
            this.db
              .prepare(
                `INSERT INTO deals(id,scan_id,deal_key,product_variation_id,vendor_id,title,image,vendor_title,vendor_code,category_title,price_rials,discount_rials,final_price_rials,discount_ratio,stock,facts_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${active} ON CONFLICT(scan_id,deal_key) DO UPDATE SET title=CASE WHEN ${retainedObservation} THEN deals.title ELSE excluded.title END,image=CASE WHEN ${retainedObservation} THEN deals.image ELSE excluded.image END,vendor_title=CASE WHEN ${retainedObservation} THEN deals.vendor_title ELSE excluded.vendor_title END,vendor_code=CASE WHEN ${retainedObservation} THEN deals.vendor_code ELSE excluded.vendor_code END,category_title=CASE WHEN ${retainedObservation} THEN deals.category_title ELSE excluded.category_title END,price_rials=CASE WHEN ${retainedObservation} THEN deals.price_rials ELSE excluded.price_rials END,discount_rials=CASE WHEN ${retainedObservation} THEN deals.discount_rials ELSE excluded.discount_rials END,final_price_rials=CASE WHEN ${retainedObservation} THEN deals.final_price_rials ELSE excluded.final_price_rials END,discount_ratio=CASE WHEN ${retainedObservation} THEN deals.discount_ratio ELSE excluded.discount_ratio END,stock=CASE WHEN ${retainedObservation} THEN deals.stock ELSE excluded.stock END,facts_json=json_set(CASE WHEN ${retainedObservation} THEN deals.facts_json ELSE excluded.facts_json END,'$.provenance',json((SELECT json_group_array(value) FROM (SELECT value FROM json_each(deals.facts_json,'$.provenance') UNION SELECT value FROM json_each(excluded.facts_json,'$.provenance') ORDER BY value))),'$.conflictingPriceTuple',json(CASE WHEN COALESCE(json_extract(deals.facts_json,'$.conflictingPriceTuple'),0)=1 OR deals.price_rials<>excluded.price_rials OR deals.discount_rials<>excluded.discount_rials OR deals.final_price_rials<>excluded.final_price_rials OR deals.discount_ratio<>excluded.discount_ratio THEN 'true' ELSE 'false' END))`
              )
              .bind(
                crypto.randomUUID(),
                id,
                o.key,
                o.productVariationId,
                o.vendorId,
                o.title,
                o.image,
                o.vendorTitle,
                o.vendorCode,
                o.categoryTitle,
                o.priceRials,
                o.discountRials,
                o.finalPriceRials,
                o.discountRatio,
                o.stock,
                facts,
                id,
                job.runtime.user_id
              )
          );
        } else
          statements.push(
            this.db
              .prepare(
                `INSERT INTO scan_observations(scan_id,kind,identity) SELECT ?,?,? WHERE ${active} ON CONFLICT DO NOTHING`
              )
              .bind(id, row.kind, row.identity, id, job.runtime.user_id)
          );
      }
      statements.push(
        this.db
          .prepare(
            `INSERT INTO scan_chunks(scan_id,unit_id,page,chunk,digest) SELECT ?,?,?,?,? WHERE ${active}`
          )
          .bind(id, unit.id, page, chunk, digest, id, job.runtime.user_id)
      );
      const result = await this.db.batch(statements);
      if (!result.at(-1)?.meta.changes)
        throw new DurableError("CANCELLED", "Chunk commit rejected");
    }
    const eligible = await this.db
      .prepare("SELECT COUNT(*) AS count FROM deals WHERE scan_id=?")
      .bind(id)
      .first<{ count: number }>();
    if ((eligible?.count ?? 0) > job.runtime.offer_limit)
      throw new DurableError(
        "SCAN_BUDGET_EXCEEDED",
        "Eligible offer budget exhausted"
      );
    const result = await this.db.batch([
      this.db
        .prepare(
          `UPDATE scan_pages SET complete=1 WHERE scan_id=? AND unit_id=? AND page=? AND expected_chunks=(SELECT COUNT(*) FROM scan_chunks WHERE scan_id=? AND unit_id=? AND page=?) AND ${active}`
        )
        .bind(id, unit.id, page, id, unit.id, page, id, job.runtime.user_id),
      this.db
        .prepare(
          `UPDATE scan_units SET terminal=?,terminal_evidence=? WHERE scan_id=? AND unit_id=? AND EXISTS(SELECT 1 FROM scan_pages WHERE scan_id=? AND unit_id=? AND page=? AND complete=1) AND ${active}`
        )
        .bind(
          data.terminal ? 1 : 0,
          data.terminalEvidence,
          id,
          unit.id,
          id,
          unit.id,
          page,
          id,
          job.runtime.user_id
        ),
      this.db
        .prepare(
          `UPDATE scans SET vendor_count=(SELECT COUNT(*) FROM scan_observations WHERE scan_id=? AND kind='vendor'),product_count=(SELECT COUNT(*) FROM scan_observations WHERE scan_id=? AND kind='product'),deal_count=(SELECT COUNT(*) FROM deals WHERE scan_id=?) WHERE id=? AND user_id=? AND ${active}`
        )
        .bind(id, id, id, id, job.runtime.user_id, id, job.runtime.user_id),
    ]);
    if (!result[0]?.meta.changes)
      throw new DurableError(
        "INCOMPLETE_PAGINATION",
        "Page chunks are not complete"
      );
    await this.heartbeat(id, "collecting");
  }
  async publish(id: string) {
    const job = await this.check(id);
    const publishedAt = iso();
    const result = await this.db.batch([
      this.db
        .prepare(
          `UPDATE scans SET status='succeeded',finished_at=?,context_json=json_set(context_json,'$.coverage',CASE WHEN EXISTS(SELECT 1 FROM scan_pages WHERE scan_id=scans.id AND json_extract(metadata_json,'$.terminalEvidence')='bounded_partial_scope') THEN 'incomplete' ELSE 'complete' END) WHERE id=? AND user_id=? AND ${active} AND EXISTS(SELECT 1 FROM scan_execution WHERE scan_id=? AND manifest_frozen=1) AND NOT EXISTS(SELECT 1 FROM scan_units WHERE scan_id=? AND terminal=0) AND NOT EXISTS(SELECT 1 FROM scan_pages WHERE scan_id=? AND complete=0) AND EXISTS(SELECT 1 FROM product_projection_scans p WHERE p.user_id=scans.user_id AND p.scan_id=scans.id AND p.ready=1)`
        )
        .bind(
          publishedAt,
          id,
          job.runtime.user_id,
          id,
          job.runtime.user_id,
          id,
          id,
          id
        ),
      this.db
        .prepare(
          "UPDATE product_projection_scans SET observed_at=? WHERE scan_id=? AND user_id=? AND ready=1 AND EXISTS(SELECT 1 FROM scans WHERE id=? AND status='succeeded')"
        )
        .bind(publishedAt, id, job.runtime.user_id, id),
      this.db
        .prepare(
          "UPDATE scan_execution SET phase='complete',heartbeat_at=? WHERE scan_id=? AND EXISTS(SELECT 1 FROM scans WHERE id=? AND status='succeeded')"
        )
        .bind(publishedAt, id, id),
    ]);
    if (!result[0]?.meta.changes)
      throw new DurableError(
        "INCOMPLETE_PAGINATION",
        "Publication conditions were not met"
      );
  }
  async fail(id: string, code: string) {
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE scans SET status='failed',finished_at=?,error_code=?,error_message='The update could not complete; previous results remain available.',context_json=json_set(context_json,'$.coverage','incomplete') WHERE id=? AND status IN ('queued','running')"
        )
        .bind(iso(), code, id),
      this.db
        .prepare(
          "UPDATE scan_execution SET phase='failed',heartbeat_at=? WHERE scan_id=? AND EXISTS(SELECT 1 FROM scans WHERE id=? AND status='failed')"
        )
        .bind(iso(), id, id),
      ...terminalScanArtifactStatements(this.db, id),
    ]);
  }
  async cancel(id: string, userId: string) {
    const result = await this.db.batch([
      this.db
        .prepare(
          "UPDATE scans SET status='cancelled',finished_at=?,error_code='CANCELLED',context_json=CASE WHEN context_json IS NULL THEN NULL ELSE json_set(context_json,'$.coverage','incomplete') END WHERE id=? AND user_id=? AND status IN ('queued','running')"
        )
        .bind(iso(), id, userId),
      this.db
        .prepare(
          "UPDATE scan_execution SET cancel_requested=1,phase='cancelled',heartbeat_at=? WHERE scan_id=? AND user_id=? AND EXISTS(SELECT 1 FROM scans WHERE id=? AND status='cancelled')"
        )
        .bind(iso(), id, userId, id),
      ...terminalScanArtifactStatements(this.db, id, userId),
    ]);
    return !!result[0]?.meta.changes;
  }
  async dispatchState(id: string, state: string) {
    await this.db
      .prepare(
        "UPDATE scan_execution SET dispatch_state=?,heartbeat_at=? WHERE scan_id=? AND EXISTS(SELECT 1 FROM scans WHERE id=? AND status IN ('queued','running'))"
      )
      .bind(state, iso(), id, id)
      .run();
  }
}
