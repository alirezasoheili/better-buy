# S07–S08 frontend implementation

This slice implements recovery/cancellation and paged saved results on the existing automatic discount feed. The default threshold remains 40%. It introduces no category, campaign, store, or collection-scope selection. Existing optional retailer/settings/history controls remain in place.

## Phases and public seams

1. Inspect the checkout and trace the dashboard, saved-result ledger, scan-start mutation, and product disclosure. Work in an isolated `codex/expansion-ui` checkout; leave unrelated root-checkout edits intact.
2. Add a failing browser tracer for summary-page reads, server search/ranking, saved load-more, and on-demand offer disclosure. Implement the shared `ProductPage`/`OfferPage` contracts with ordinary TanStack paginated queries.
3. Add explicit cancellation and UUID-based start reconciliation. Test uncertain starts, saved-read failures, and retained prior rows through the browser's HTTP boundary.
4. Test navigation beyond twenty pages and independent result-read failure after successful refresh. Preserve the complete loaded window while bounding retained/rendered pages.
5. Run frontend checks and the desktop/mobile regression suite, then merge the integration branch and run repository-required commit checks.

The user and coordinating agent already authorized these public HTTP/browser seams. Tests exercise observable behavior, rather than React implementation details.

## Saved results

The first request uses `/api/scans/{id}/products?page=1&q=&sort=discount`. Product rows consume `ProductSummary`, including the exact best current offer and current-store count. The frontend no longer downloads complete vendor arrays to display the shelf. Search and the optional price/discount sort change saved query keys and use server results; discount is the default.

A native keyboard-accessible disclosure requests `/api/scans/{id}/products/{encodedGroupKey}/offers` only when opened. Subsequent offer reads use the server cursor. The backend controls page sizes and ranking; the frontend does not claim that its locally retained page window is the full snapshot.

Location revision, retailer, scan, search, sort, and cursor bind product query keys. Offer keys bind scan, retailer, group, and cursor. The existing authenticated-session-owned QueryClient still discards private caches on session changes. Query-provided AbortSignals cancel obsolete reads; no different-context placeholder is used.

Each product/offer context retains twenty loaded pages and, briefly, one pending page. Advancing beyond that window evicts the oldest query only after the new read succeeds. Navigation can continue to the server's terminal cursor; the window is not a scan-size limit. A return-to-first action reads the first saved page again when it has been evicted. A failed page read retains every previously visible row. Ten-minute memory cache freshness/collection remains in place for useful back navigation.

When a newer successful scan cannot be read, all cached pages of the prior matching window remain visible under that prior scan's timestamp. A separate message records that the newer update succeeded and its saved-result read failed. Retry reads the newer scan; it does not submit another collection. Cached refresh failures show stale/freshness copy. Empty valid pages, search-empty pages, and malformed/failed reads remain distinct.

## Starts and cancellation

Each explicit start creates one UUID `Idempotency-Key`. An ambiguous transport/schema/5xx response retains that intent and captured request, blocks a fresh start, and queries `/api/scans?intent={UUID}`. This is an authoritative owned-intent lookup, not fuzzy matching against recent scan timestamps. An explicit retry resends the same key and body; POSTs never automatically retry. Successful reconciliation restores the server-owned scan in the existing status/history cache.

Active scans expose a cancel action. `/api/scans/{id}/cancel` also never automatically retries. The frontend aborts the in-flight status query before the mutation and installs the server's returned terminal record. Cancelled updates have an explicit terminal label and preserve the previous saved feed. Cancellation errors do not invent a terminal outcome. Existing status polling continues to distinguish failed status reads from failed jobs and stops on terminal records.

Safe GET retries additionally recognize the specific `409 PROJECTION_PENDING` response from lazy historical projection. Other 409s remain permanent. Existing two-retry/backoff/Retry-After bounds and abort/auth/schema exclusions remain.

## Validation

- The first paged-feed browser tracer failed against the former array/full-offer UI, then passed after the paged implementation.
- New regressions failed for losing baseline page two after a successful-update read error, and for stopping navigation at twenty pages. Both behaviors were corrected before the final regression run.
- Web TypeScript check passed. All 35 web unit tests passed, including the additional projection-pending retry distinction.
- All 86 desktop/mobile browser cases passed (`PLAYWRIGHT_PORT=3202 pnpm --filter @better-buy/web exec playwright test tests/paged-feed.spec.ts tests/dashboard.spec.ts`, 2.2 minutes). The suite includes read-only search/sort/load-more/disclosures; exact cached-row preservation; same-UUID/body ambiguous resend; cancellation; context/session changes; empty/error recovery; keyboard/focus; themes; RTL sizes; broken images; and reduced motion.
- Visual browser checks measured action contrast 7.31:1, body contrast 15.72:1, and dark body contrast 8.60:1 on both projects, with zero undersized tested targets and a visible solid focus outline. Actual provider images and missing-image fallback were exercised.
- The Impeccable mechanical inspection returned no findings for the changed dashboard, shelf, row, status, and history components. This slice preserves the existing visual language; S11 separately owns integrated runtime/visual measurements against the real worker.

The initial desktop regression run passed 38 of 40 cases. Its two failures were obsolete test fixtures: an empty result still used the old array envelope, and a store-detail mock returned historical offers before current offers instead of backend ordering. Both fixtures were migrated to the new contract.

Frontend integration depends on the separately implemented worker routes and durable execution. Browser route fixtures validate frontend behavior; they do not by themselves prove provider collection, D1 publication, or Workflow cancellation races.

Graft investigation: four UI-phase calls, 15,147 returned tokens (dashboard/feed, ledger callers, start-mutation callers, and row callers). The earlier S05 research phase used one call/7,786 tokens and is separate from this implementation accounting.
