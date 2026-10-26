# Better Buy D1 read analysis

Date: 14 October 2026. The production-release follow-up below supersedes the original recommendations; measurements in the rest of this report describe the original incident.

## Production-release follow-up

Deployed on 14 October 2026, verified at 21:15 Tehran time, as Worker version `2e7f9a85-640f-414f-a786-78935a83cfa7`. Failure and cancellation now delete partial artifacts in the same atomic D1 batch as the terminal state change. Legacy stale recovery and Workflow engine recovery use the same deletion behavior. Scan status, execution metadata, and duplicate-start intents remain; successful results are protected. Attempt receipt writes now reject terminal scans even when a stale writer resumes after concurrent cancellation.

The recurring seven-day artifact sweep is removed. Its proposed `0013_scan_cleanup_index.sql` migration was discarded, so this release needs no schema migration. Scheduled workflow recovery and rate-limit expiry remain. Stale legacy recovery now looks up the indexed active subset instead of executing two UPDATEs across a user's scan history on every request.

All 274 Worker tests, both Worker TypeScript checks, the production static build, formatting checks, and Wrangler deployment dry run passed. The release bundle contains immediate deletion and does not contain the old artifact-sweep query. Both configured production origins passed signed-out `/`, `/healthz`, `/api/me`, and disabled test-login smoke checks. Authenticated production scan/failure E2E remains unverified because D1 queries report the daily Free-tier read limit exceeded (Cloudflare code 7500).

A production export of 17,064,327 bytes was restored into isolated SQLite and passed integrity checking. SHA-256: `689e5df03c0d1610e603ce13aba6bf739de14efaae6ccc6c3810c50654b73b9c`. The export has 28 failed and 176 succeeded scans; none of the ten artifact tables has data attached to a failed/cancelled scan. A simulated one-time cleanup removed zero rows, so no remote data deletion was necessary. This is verified export evidence, not a live post-release query. Backup and release evidence are under `.data/backups/` and `.data/d1-read-analysis/`.

The already-consumed daily read allowance is not restored by deployment or data deletion. The next documented daily reset is 15 October 2026 at 03:30 Tehran time (00:00 UTC). Historical seven-million-read analytics will persist until they leave the selected time window. Fresh production row-read totals and an authenticated failure test need an available D1 allowance.

## Finding

The approximately seven million reads are overwhelmingly caused by scheduled cleanup, rather than normal usage by ten users. Live D1 Insights attributes **6,964,611 of 6,992,140 reported reads (99.61%)** in the captured trailing-day window to one query in `apps/worker/src/durable/service.ts:219`.

A read-only production comparison reduced this query from **49,730 to 205 rows read per execution (99.59%)**, using the existing indexes. Both versions returned zero scans to clean. The production query plan confirms the change replaces three repeated index scans with indexed lookups.

Recommendation: fix the cleanup query and its deletion predicates first, then add one small cleanup index. Caching is a secondary optimization for this workload.

## Evidence and scope

- Checkout inspected: `6c2d97f3158b6f81f9fc7e50bad4939d407052ad`, plus the existing local configuration edits. Those edits were preserved.
- Remote target verified against the current binding: D1 `better-buy`, database `c1f1e523-5f4e-4ac3-8f70-a2d35d539368`.
- Captured live schema, trailing-day query analytics, aggregate table counts, and production `EXPLAIN QUERY PLAN` results.
- Executed the original cleanup SELECT and a proposed rewrite on the same production database using the same cutoff. Both had `rows_written=0` and returned zero records. These diagnostic reads themselves consume D1 read allowance.
- Tested the proposed index and cleanup semantics in isolated SQLite 3.50.4 using all repository migrations. Each of the nine artifact checks had a separate eligible scan; the rewrite selected identical scan IDs across owners, cleanup emptied those artifacts, and scan history remained intact.
- The local workerd/D1 fixture stalled during bulk seeding and was terminated. Index evidence below is local SQLite query-plan evidence, not a local D1 billing measurement. Production `rows_read` evidence for the predicate rewrite is direct D1 evidence.
- No account billing plan, production Worker deployment revision, authenticated browser workload, or post-deployment daily reduction was verified. The source-to-production attribution is supported by the exact SQL fingerprint in live analytics.

Raw evidence and diagnostic scripts are retained locally under the ignored `.data/d1-read-analysis/` directory: `insights-1d.json`, `schema.json`, `production-probes.json`, `queries.json`, and `sqlite-plans.json`. These are not committed report attachments.

## Where the reads went

The Insights request asked for the top 100 query fingerprints and returned 41. Totals here are the sum of those reported fingerprints; they are not a separate account billing export.

| Query / activity                            | Executions | Rows read | Average reported rows/call |
| ------------------------------------------- | ---------: | --------: | -------------------------: |
| Old failed/cancelled scan cleanup selection |        278 | 6,964,611 |                     25,052 |
| Reconcile stale running scans               |        210 |     8,777 |                         41 |
| Reconcile stale queued scans                |        193 |     8,657 |                         44 |
| Saved-product first-page reads              |         45 |     1,067 |                         23 |
| Workflow recovery selection                 |        275 |       836 |                          3 |
| Rate-limit cleanup                          |        278 |       556 |                          2 |
| Session-token lookup                        |        109 |       109 |                          1 |
| All reported queries                        |          — | 6,992,140 |                          — |

The screenshot has 288 cleanup executions, while the later trailing-day capture has 278. These are different observations/windows. A five-minute schedule has 288 opportunities per 24 hours, which matches the pattern in the screenshot.

D1 counts the rows examined by a query, including scans that return no matching records. A small result and low latency do not imply a small read bill. [Cloudflare D1 pricing and read definitions](https://developers.cloudflare.com/d1/platform/pricing/).

## Root cause

`apps/worker/wrangler.jsonc` configures `*/5 * * * *`. The scheduled handler in `apps/worker/src/entry.ts:10` calls `reconcileDurableOperations` whenever the Workflow binding exists. `SCAN_WORKFLOW_ENABLED=false` stops new workflow starts; it does not stop scheduled recovery/cleanup. Keeping recovery for existing jobs is intentional.

The cleanup query searches scans that failed or were cancelled more than seven days ago, then checks whether they still own artifacts in nine tables. It retains scan history and selects at most 20 scans that have artifacts:

```sql
SELECT id FROM scans
WHERE status IN ('failed','cancelled') AND finished_at < ?
  AND (
    -- other artifact checks omitted here only for readability
    EXISTS(SELECT 1 FROM saved_product_offers WHERE scan_id=scans.id)
    OR EXISTS(SELECT 1 FROM saved_products WHERE scan_id=scans.id)
    OR EXISTS(SELECT 1 FROM product_projection_scans WHERE scan_id=scans.id)
  )
ORDER BY finished_at,id LIMIT 20;
```

The three projection tables have keys beginning with `user_id, scan_id`. Filtering only on `scan_id` cannot use their leading ownership column for a targeted lookup in the observed plan. For every eligible scan, D1 scans those tables/indexes again. The other six artifact checks already use indexes beginning with `scan_id`.

Current aggregate production counts:

| Data                                                          |  Rows |
| ------------------------------------------------------------- | ----: |
| Scans                                                         |   204 |
| Failed scans                                                  |    28 |
| Successful scans                                              |   176 |
| Failed/cancelled scans older than the tested seven-day cutoff |    25 |
| Saved offers                                                  | 1,310 |
| Saved products                                                |   664 |
| Projection scan metadata                                      |     7 |

The approximate repeated work is `25 × (1,310 + 664 + 7)`, plus scanning the 204 scan rows and small overhead: about 49,730 reads. No current eligible scan has artifacts, so this work repeats without cleanup making progress. `LIMIT 20` caps matches returned; it cannot cap how many empty historical candidates must be examined to find those matches.

The production plan shows:

```text
SCAN scans
SCAN saved_product_offers USING COVERING INDEX sqlite_autoindex_saved_product_offers_1
SCAN saved_products USING COVERING INDEX saved_products_price_desc
SCAN product_projection_scans USING COVERING INDEX sqlite_autoindex_product_projection_scans_1
USE TEMP B-TREE FOR ORDER BY
```

This is consistent with Cloudflare's guidance on correlated subqueries and composite-index prefixes. [Cloudflare: use indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/).

## Prioritized changes

### 1. Add ownership predicates to cleanup selection and deletion

For all three projection-table checks, use both ownership and scan identity:

```sql
EXISTS (
  SELECT 1 FROM saved_product_offers
  WHERE user_id=scans.user_id AND scan_id=scans.id
)
EXISTS (
  SELECT 1 FROM saved_products
  WHERE user_id=scans.user_id AND scan_id=scans.id
)
EXISTS (
  SELECT 1 FROM product_projection_scans
  WHERE user_id=scans.user_id AND scan_id=scans.id
)
```

These are three individual replacements in the existing OR expression. The plan then uses `SEARCH ... (user_id=? AND scan_id=?)` for each table. **No new indexes are needed for these replacements.**

Also select `user_id` alongside `id` and use:

```sql
DELETE FROM saved_product_offers WHERE user_id=? AND scan_id=?;
DELETE FROM saved_products WHERE user_id=? AND scan_id=?;
DELETE FROM product_projection_scans WHERE user_id=? AND scan_id=?;
```

The generic deletion loop currently filters these tables only by `scan_id`, which also scans them. Local plans confirm adding ownership changes each DELETE to an indexed search. Keep the scan-only predicates for the six tables whose existing indexes already begin with `scan_id`.

This preserves the normal invariant that projection ownership matches scan ownership. Before implementing, check for any historical projection rows with mismatched owners; the ownership rewrite intentionally would not delete another owner's inconsistent artifacts.

Direct production SELECT comparison:

| Version                    | Rows read | Returned scans | Database SQL duration |
| -------------------------- | --------: | -------------: | --------------------: |
| Current                    |    49,730 |              0 |             4.2959 ms |
| Three ownership predicates |       205 |              0 |             0.8986 ms |

The read reduction is **99.59%**. Durations are single observations, not a latency benchmark.

### 2. Add one partial index for expired cleanup candidates

```sql
CREATE INDEX scans_terminal_cleanup
ON scans(finished_at, id, user_id)
WHERE status IN ('failed','cancelled');
```

This targets the exact terminal subset and supports cutoff filtering plus the `finished_at,id` ordering. Local SQLite changed the outer plan to:

```text
SEARCH scans USING INDEX scans_terminal_cleanup (finished_at<?)
```

It also removed the temporary sort. Every child check used an indexed SEARCH. This index was **not created in production**, so no production read reduction for it is claimed.

The partial index avoids adding an index entry for each ordinary queued/running/succeeded scan, although terminal transitions and index creation still incur maintenance work. Existing history and uniqueness indexes serve different purposes and should be retained. Creating three new `scan_id` indexes on projection tables is an alternative if cleanup must operate by scan ID alone, but ownership predicates reuse existing indexes and avoid their extra storage/write cost.

### 3. Separate artifact cleanup cadence from workflow recovery

Keep prompt workflow recovery for existing jobs. Run the seven-day artifact-retention pass less frequently, such as hourly. Split or gate that pass; changing the entire cron to hourly would also delay recovery.

Hourly artifact cleanup has 24 executions/day instead of 288, a further **91.67% reduction in cleanup query frequency**. Treat that cadence as a retention choice: eligible artifacts may remain up to roughly another hour. Preserve the bounded batch and ensure backlog throughput is sufficient.

As history grows, consider an explicit cleanup-completed marker or work queue. The existing artifact EXISTS guard lets bounded cleanup progress past already-cleaned scans, so removing it and repeatedly selecting the first 20 historical failures would break progress. A marker would require careful initialization and atomic completion handling.

### 4. Reduce repeated stale reconciliation after the main fix

`apps/worker/src/index.ts:95` calls `Store.reconcileStale()` on every authenticated application request. That performs two guarded UPDATEs even when the user has no active scan. They account for 17,434 reads in this capture, about 0.25% of the reported total.

Consider moving this work to scan-related entry points plus a bounded scheduled recovery pass, or explicitly constrain the queries to the existing active-scan partial index and verify the plan. Preserve queued/running timeouts and the exclusion for workflow executions. This has much less impact than fixing artifact cleanup.

## Caching assessment

Current frontend caching already helps:

- Dashboard Query defaults: one-minute stale time, five-minute retention, no focus refetch.
- Saved-product pages and expanded offers: ten-minute stale time and retention, with keys scoped to the result context and a session-owned QueryClient.
- Active scan status polls every 1.5 seconds and stops on terminal status. Terminal status has infinite stale time.
- Protected API responses deliberately use `Cache-Control: private, no-store, max-age=0`.

Increasing these cache durations will not affect the scheduled cleanup query.

If product-read volume becomes significant after the cleanup fix, completed, ready saved-product pages are candidates for an internal Worker cache. A suitable key includes authenticated user ID, scan ID, projection version, search, sort, cursor, limit, and offer-group identity where relevant. Cache only successful published/ready responses, with a bounded TTL such as 5–15 minutes. Check authentication and current ownership before serving them, handle location/history deletion, and keep account-session cache isolation. Preserve downstream private-response policy unless changing it is an explicit design decision.

Caching inside the product route would still leave middleware session lookup, rate-limit accounting, and stale reconciliation. It therefore does not remove all per-request D1 work. Cloudflare's Cache API is also local to the data center; cache hit rates and invalidation must be measured. [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).

Session-cookie caching is lower priority: the captured session lookup already reads one indexed row per call. Changing revocation freshness for only 109 reported reads is not justified by this incident. Active scan starts, cancellation, progress, and recovery should continue to use authoritative database state.

## Expected impact and acceptance criteria

At the **current** data distribution and five-minute cadence:

| Estimate                                       | Current query | Ownership rewrite |
| ---------------------------------------------- | ------------: | ----------------: |
| Cleanup reads per execution, measured live     |        49,730 |               205 |
| Cleanup reads per 288 executions, extrapolated |    14,322,240 |            59,040 |

The current per-execution cost exceeds the historical Insights average because the data distribution/candidate set changed during the window. The extrapolated 14.3 million is not the observed trailing-day total.

For the captured 278 executions, replacing their historical costs with the current rewritten cost estimates 56,990 cleanup reads and 84,519 total reported reads, including the unchanged 27,529 reads from other queries. This is a modeled comparison, not a post-deployment result. The partial index and cadence change could reduce that further; neither has a production measurement yet.

Cloudflare currently documents a Workers Free allowance of five million D1 rows read per day. Verify the actual account plan and billing-day window before comparing a trailing-day snapshot against that limit. This finding does not require a paid upgrade recommendation. [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

Implementation acceptance criteria:

1. All nine artifact types remain eligible for cleanup across multiple owners; succeeded/active/recent scans remain protected.
2. Cleanup still advances past its first 20 records and retains scan history and start-intent records.
3. Production EXPLAIN shows indexed SEARCH for the three projection checks/deletions and the new outer partial index, if applied.
4. Measure actual `meta.rows_read` after release and compare a fresh full-day Insights window; distinguish cleanup traffic from diagnostic queries and normal application activity.
5. Before a production migration/release, verify the target, export and verify a backup, apply the focused migration, dry-run the release, deploy, and smoke-check. These are implementation steps, not actions performed by this report.

The highest-value initial change is the ownership rewrite plus matching DELETE predicates. It directly addresses the measured amplification while preserving existing indexes and cleanup behavior.
