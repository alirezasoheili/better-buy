# Production Readiness Plan

Target: Cloudflare Worker + D1 + static Next.js assets. This checklist is a release contract, not a suggestion list.

## Architecture and Cloudflare runtime

- [ ] Measure real scan duration, upstream page counts, retry duration, D1 statement volume, and interruption rate.
- [ ] Decide from evidence whether request `waitUntil` is sufficient; otherwise move scans to a durable job mechanism suitable for multi-step/retriable work.
- [x] Make scan exclusivity atomic per user with a partial unique active-scan index and a stable conflict response. Rehearsal is still required.
- [ ] Keep D1 access through the binding and generated Wrangler types.
- [ ] Keep `compatibility_date` current through a scheduled review and test before advancing it.
- [ ] Retain `nodejs_compat` and JSONC configuration.
- [ ] Validate current Wrangler config against its bundled schema in CI.
- [ ] Split the monolithic Worker route/store modules only along tested domain seams.

## D1 schema and migrations

- [x] Add tenant-safe composite joins and indexes for scan history and previous-scan lookup. Deal-volume indexing remains a measured follow-up.
- [ ] Add grouping columns only after runtime projection is proven; keep them nullable/versioned for legacy scans.
- [ ] Preserve raw vendor offers and raw `deal_count`; add grouped count explicitly.
- [ ] Audit existing locations for out-of-Tehran rows and hidden magic default rows.
- [ ] Write every migration as forward-only, rehearsed on a production-shaped copy, with a documented rollback/restore procedure.
- [ ] Verify batching behavior with maximum realistic offers; chunk or redesign before platform limits become runtime failures.
- [ ] Define data retention for scans, deals, sessions, provider credentials, and locations.
- [ ] Establish automated D1 backup/export and test restoration.

## Authentication, credentials, and abuse protection

- [ ] Require a strong encoded `BOX_KEY`; reject weak/default configuration.
- [ ] Add encryption version/key identifier and a credential rotation runbook.
- [ ] Handle corrupt/old ciphertext as reconnect-required without leaking crypto details.
- [ ] Keep tokens, refresh tokens, OTPs, raw upstream responses, addresses, and coordinates out of logs/errors.
- [ ] Add per-user/IP cooldowns to custom OTP endpoints.
- [ ] Add per-user scan quota/concurrency controls and clear `Retry-After`/Persian UX where appropriate.
- [ ] Verify OAuth trusted origins, cookie settings, CORS origins, and production `DEV_MODE=false` during deployment.
- [ ] Assert the dev-only test-login endpoint is unreachable in staging/production smoke tests.
- [ ] Add a security-header/CSP policy covering only selected auth, image, map, and geocoder origins.

## API contracts and error handling

- [x] Use stable machine codes and safe Persian messages for provider unavailable, outside Tehran, scan conflict, interrupted scan, and geocoder failure. Token rejection/upstream rate-limit mapping remains open.
- [ ] Add a top-level structured error boundary that logs sanitized context and returns a request ID.
- [ ] Do not couple dashboard availability to non-active provider endpoints.
- [ ] Add pagination/server-side filtering before grouped scans exceed measured memory/latency budgets.
- [ ] Prevent stale/out-of-order frontend responses from changing current context.
- [ ] Version grouping normalization behavior and API responses before materializing keys.

## Testing and CI

Current baseline: typecheck passes; 13 Worker unit tests pass; web/shared have zero test files; no Playwright specs exist; production build succeeds with CSS warnings.

Required CI stages:

1. Formatting/lint, including no-floating-promises.
2. Typecheck and generated Wrangler binding drift check.
3. Shared-domain unit tests: Tehran boundary, Persian normalization, grouping/state derivation.
4. Worker unit tests: collectors, retries, credential states, error mapping.
5. Worker/D1 runtime integration tests: auth isolation, location CRUD, scan conflict, scan/deal history, migrations.
6. Web component tests: provider state machine, context switching, grouped filtering, map/search states, dialogs.
7. Playwright desktop/mobile: login fixture, location, token renewal route, scan lifecycle, grouping, history, accessibility-critical keyboard flows.
8. Production build with warnings treated as tracked failures.
9. Staging deployment, migration dry run, authenticated smoke tests, and unauthenticated liveness check.

Failure injection must cover upstream timeout, 401/403, 429, malformed JSON, interrupted scan, D1 failure, expired credential, geocoder failure, tile failure, and rapid context switching.

## Observability and alerts

- [ ] Emit structured JSON events with request ID, anonymized user correlation, provider, state/error code, duration, and counts.
- [ ] Never attach exact location or credential data.
- [x] Add minimal public `/healthz` liveness and keep authenticated `/api/health` diagnostics.
- [ ] Dashboard scan success rate/duration, auth expiry/rejection, upstream status classes, stale/interrupted scans, geocode latency/error, and outside-city rejection.
- [ ] Alert on elevated scan failure, stuck scans, auth spikes, D1 errors, and provider/geocoder outage.
- [ ] Set sampling intentionally by environment; 100% sampling must be a conscious cost/privacy decision.
- [ ] Document how to temporarily disable one provider without redeploying unrelated behavior.

## Maps, geocoding, and privacy

- [ ] Define Tehran with a versioned boundary and provenance.
- [ ] Select map/geocoder providers with written policy, SLA, rate, attribution, privacy, and cost review.
- [ ] Keep provider endpoint configuration switchable.
- [ ] Proxy geocoding through the Worker with cache and rate limit; timeout, Tehran filtering, and normalized results are implemented.
- [ ] Do not implement public Nominatim autocomplete; comply with the provider’s current policy if used for explicit private-MVP search.
- [ ] Show visible attribution and graceful tile/search fallback.
- [ ] Document that exact saved location is sensitive data, why it is needed, which third parties receive area/search data, and how the user deletes it.

## Delivery and rollback

- [ ] Use separate development, staging, and production bindings/databases/secrets.
- [ ] Require secret presence checks before deployment.
- [ ] Back up D1 before schema changes and record migration version.
- [ ] Use a staged provider rollout/capability flag for user-visible providers.
- [ ] Smoke-test auth, one valid Tehran location, connection renewal, a scan, history, and static asset fallback after deploy.
- [ ] Define rollback for Worker code, static assets, provider availability, and migrations.
- [ ] Keep historical data readable across one prior API/UI version during migrations.

## Definition of production-ready

The release is ready only when:

- Primary results are always context-correct.
- Missing/expired/rejected credentials are recoverable from the primary action.
- Outside-Tehran locations cannot enter or use the system.
- Grouping does not destroy vendor history or merge distinct products in the approved corpus.
- CI and staging gates pass, monitoring is live, secrets are verified, D1 can be restored, and rollback has been rehearsed.
- Known P0/P1 items in [BUGS.md](./BUGS.md) are closed or explicitly accepted with owner and expiry date.
