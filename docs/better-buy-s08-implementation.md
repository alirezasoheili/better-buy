# S08: indexed saved product and store pages

Implemented locally on the S01–S05 baseline, 10 October 2026. No provider reads, account operations or deployment are part of saved-result pagination. The shopper keeps one automatic discount feed; no category, campaign or store-selection controls were added.

## Saved API and compatibility

`GET /api/scans/{id}/products?page=1` returns `data.items`, `nextCursor`, `observedAt`, `coverageSummary` and `{scanId,reason}` baseline facts. Product pages default to 50 summaries and reject limits above 100. `q` is normalized on the server for Persian/Arabic letter, digit, ZWNJ and whitespace variants, then all search tokens are applied **before** indexed keyset slicing. `sort=discount` uses the displayed best applicable current offer's unrounded percentage, discount amount, final item price and stable group key. `price`/`price_asc`, `price_desc` and `title` are supported saved-data orders. Current ordinary groups precede historical-only groups.

Each summary contains the coherent `bestCurrentOffer`, current store count, conditional offer count and diagnostics. It omits the `vendors` and `conditionalOffers` arrays; loading the default feed therefore does not download every store offer.

`GET /api/scans/{id}/products/{key}/offers` returns bounded `{items,nextCursor}` store pages, default 20 and maximum 50. Applicable ordinary offers come first; historical and conditional observations retain their explicit facts, terms and provenance. All amounts come from one selected observation, rather than assembling a price from several stores.

Opaque, runtime-validated cursors bind tenant, scan, endpoint kind, normalized search, sort and stable position. Offer cursors additionally bind the saved group. Malformed or reused-context cursors return `INVALID_CURSOR` (400). Unknown/cross-tenant scans and unknown groups return 404. A scan must be `succeeded` even if its projection has already been staged; running, failed and cancelled data remain unreadable.

The existing unpaged `/products` array remains available when `page=1` is absent, alongside `/deals` and `/deal-groups`. `registerPagedProducts` is registered before the compatibility handler so the new UI can opt into the bounded envelope explicitly.

## Materialization and publication

Migration **0008_saved_product_projection.sql** adds `product_projection_scans`, `saved_products`, `saved_product_offers` and compound tenant/scan/rank indexes. It preserves original `deals`, legacy contexts and history. Foreign keys cascade when the owning scan is deleted.

The exported `materializeProducts(db,userId,scanId)` is called after durable units finish staging their final offers and before atomic publication. It groups through existing `groupDealsV2`, builds searchable summary rows and stores expanded offers separately. `projectionReady` and the marker's `ready=1` expose the publication seam; the durable publication CAS requires the owning scan's ready marker. A ready projection is immutable to replay. Publication sets its observation timestamp at the publication boundary.

Each checkpoint processes at most 100 distinct product IDs and 5,000 source offer rows, then uses bounded JSON SQL inserts (at most 100 rows and 500 KB per bind). Product boundaries keep variant diagnostics, coherent store comparisons and exact history states together. Raw offers are not downloaded on ordinary reads after materialization. Chunk writes and checkpoints require the owning scan to remain queued, running or succeeded; the loop reloads status between chunks and stops after committed cancellation. The final publication guard remains authoritative.

Old completed scans without a projection receive a resumable lazy backfill. A GET processes up to four bounded chunks; larger histories return `PROJECTION_PENDING` (409), `retryable=true`, and `Retry-After: 1`. Repeating the same safe GET resumes the stored checkpoint. Missing old contexts remain `legacy_unverified` and do not acquire fabricated historical coordinates or disappearance claims. Complete comparable predecessors require exact tenant, location/revision/coordinates, provider, threshold, scope hash, eligibility/key versions and stable created-time/ID ordering. Different or incomplete scopes receive no baseline.

Unusually dense product-ID cohorts exceeding 5,000 current/prior source rows in one checkpoint fail explicitly with `PROJECTION_SCOPE_TOO_LARGE`; the projection is not marked ready. This bounded memory guard is not a claim of complete publication. Huge individual upstream strings also fail a 500 KB row guard. These guards are independent of provider request budgets and deployment/account limits.

## Verification

Public HTTP/D1 integration regressions cover coherent best-offer ranking, Persian search before slicing, keyset tie traversal, default/maximum sizes, tenant/scan/search/sort/group cursor rejection, missing results, staged/cancelled invisibility, explicit benefit/provenance details, compatible versus changed-scope history, historical-only groups and resumable legacy backfill. Cancellation regression first reproduced the defect (the projector continued after cancellation) before status-guarded writes and loop checks fixed it.

The isolated local workerd D1 benchmark uses actual D1 bindings and all additive migrations, not a Node SQLite substitute. It seeds synthetic saved scans, builds the projection, reads twenty warm pages, expands offers and checks the SQLite query plan uses `saved_products_discount`. Initial measured results:

| Dataset | Product groups | Raw offers | Cold projection | Warm page p50 / p95 | Default envelope bytes |
| ------- | -------------- | ---------- | --------------- | ------------------- | ---------------------- |
| Small   | 30             | 90         | 688 ms          | 298 / 337 ms        | 25,312                 |
| Medium  | 500            | 2,000      | 3,563 ms        | 325 / 380 ms        | 42,534                 |
| Large   | 3,000          | 24,000     | 26,439 ms       | 313 / 327 ms        | 42,603                 |

All default pages stay below the **250 KB** target. These are local fixture measurements, not production latency or actual account capacity guarantees. Cold materialization belongs before durable publication; it is not repeated by warm saved-page reads. Larger legacy data may require several safe read retries.

Reproduce with `pnpm --filter @better-buy/shared build`, `pnpm --filter @better-buy/worker exec vitest run src/http/products.test.ts`, both Worker TypeScript checks, and `node apps/worker/scripts/benchmark-saved-products.mjs`. The benchmark creates and removes an isolated temporary runtime and never touches the Wrangler development database or a remote database.

Cloudflare binding behavior was checked against the current [prepared-statement documentation](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) and [transactional batch documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). Prepared statements bind all request values; dynamic SQL identifiers come exclusively from fixed server sort definitions.

Apply migration 0008 locally through the existing `pnpm --filter @better-buy/worker db:migrate:local` workflow before starting the new API. Frontend and durable runner integration, full release checks and account/binding rollout are recorded in the repository completion report. Nothing here performs a remote migration or deployment.
