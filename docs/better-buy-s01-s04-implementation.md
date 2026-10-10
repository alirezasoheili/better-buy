# S01–S04 implementation

The checkout's existing development login, configuration, package-manager and lockfile changes were preserved. No frameworks were upgraded or additional collection adapters enabled.

The work followed four phases:

1. **S01 — Trustworthy updates.** Retained the existing effective Okala threshold and bounded GET retry policy. Scan starts return the authoritative persisted record. Unknown and cross-tenant status/raw/group/product reads return 404. Failed product reads retry the same saved scan, with its successful update fact still visible.
2. **S02 — Frozen history.** Additive migration `0006_scan_context.sql` records coordinate revision and nullable scan/offer facts. New scans freeze location, requested/effective thresholds and the existing collector's manifest. Okala freezes its discovered collection IDs and store cohort before offer requests. Only complete compatible histories participate in absence comparison, with timestamp/ID ordering. Legacy context remains unknown. Name changes preserve geographic revision and frozen history names.
3. **S03 — Product comparison v2.** `/products` projects saved raw offers using a SHA-256 product key independent of price/store count. Different store prices share one product; variant conflicts split conservatively. One selected current tuple supplies headline money and ranking. Deduplicated observations preserve provenance and diagnostics; conditional offers remain separate. Explicit source money units and display amounts preserve Snapp toman and Okala rial conversion. V1 `/deals` and `/deal-groups` retain their existing response vocabulary.
4. **S04 — One automatic feed.** Location confirmation starts the first default update once from the event handler. Return visits only read saved results. One refresh action retains the previous successful feed. Retailer and threshold are optional settings; search, sort and store disclosure operate on saved results. Session/location revision/provider/scan boundaries protect private reads. No Explore, category/campaign navigation, store-first setup, quick/full selector or custom effect/timer orchestration was added.

## Validation

- Workspace unit/application/provider/SQLite tests: 182 passing.
- TypeScript checks passed for shared, web, Worker and Worker tests, using the declared pnpm 12.10.1.
- Full browser suite: 72 checks passed across desktop/mobile. A subsequent targeted run exposed a first-location history/start race; request ordering and cancellation were corrected, and affected checks were rerun. A delayed-history regression covers that ordering.
- After the race fix, all 12 affected start/context/layout checks passed and the delayed-history first-location regression passed six repeated desktop/mobile runs.
- The Cloudflare static production export passed, reporting 188KB first-load JavaScript for the home page.
- Screenshots and keyboard/theme/layout checks cover 360, 390, 768, 1280 and 1440px; reduced motion, long prices/titles, missing images and light/dark contrasts are exercised. Evidence is saved under `.data/design-evidence/`.
- `node apps/worker/scripts/check-expansion-d1.mjs` uses an isolated actual local D1 binding to verify additive migrations, batch rollback, frozen location, geographic revision, baseline compatibility and tenant isolation. It does not modify the checkout's development database.

## Migration and boundaries

Apply migration 0006 to an existing database before running this code. Historical rows are retained, without fabricated coordinates or completeness.

Collection remains on the existing bounded execution path. Additional adapters/research gates, durable execution, cancellation/idempotent dispatch, and server-paged/materialized product results belong to S05 onward. The current v2 route is a projection of the existing bounded saved snapshot; no new upstream crawl is triggered by reading it. Nothing was deployed.
