# Better Buy architecture

The current local Snapp guest implementation is the behavioral baseline. Active collection and scan workflows use exactly pinned `effect@4.0.1`; Hono, Better Auth, D1, Zod, and React retain their existing roles. The migration follows the [official v4 documentation](https://effect.website/docs/v4/) and the installed v4 types. No Effect companion or Node platform package is required.

## Responsibilities

| Boundary       | Files                                                      | Responsibility                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTTP           | `apps/worker/src/index.ts`, `http/`                        | Middleware, authenticated user context, Zod inputs, response/error mapping, route registration, and background Promise ownership.                                                          |
| Application    | `application/scans.ts`, `application/provider-settings.ts` | Eligibility → access → atomic reservation → running → complete collection → persistence → success. Operations accept explicit inputs and capabilities, with no Hono context or D1 binding. |
| Domain         | `domain/`, `packages/shared/src/`                          | Eligibility, typed failures, validation/contracts, exact temporal comparison, conservative v1 grouping, and provider-specific price display conventions. Ordinary typed functions.         |
| Providers      | `providers/snapp/`, `providers/okala/`                     | Exact upstream request construction, guest/public access, Zod decoding, sequential complete collection, and pure normalization. No database writes.                                        |
| Infrastructure | `infrastructure/`, `store.ts`                              | Native fetch policy, D1 SQL and atomic batches, encrypted provider settings, and Web Crypto. Database rows are typed at the SQL adapter boundary.                                          |
| Composition    | `composition.ts`                                           | Constructs `ScanPersistence`, `ProviderAccess`, and `ProviderCollection` from bindings and an explicit authenticated user ID.                                                              |

`collector.ts` and `okala.ts` retain the established public imports as small re-export modules. The dormant `digikala.ts` collector remains retained under the existing product plan; active scan dispatch never calls it. New Jet scans/settings stay disabled, and historical Jet results remain readable. Historical migrations are unchanged.

## Effect execution and service lifetimes

The scan route runs preparation with `Effect.runPromiseExit`, then gives one execution Promise to `c.executionCtx.waitUntil`. Collectors, access helpers, and application operations compose Effects without starting runtimes internally. The former Okala OTP, login, and token-submission routes are removed.

Service keys are module-level declarations; their implementations are newly constructed per authenticated request. The background job retains that request's tenant-scoped persistence capability. There is no global runtime/layer containing a user, credential, or Store. A Snapp scan owns one ephemeral guest token and device ID; those are neither persisted nor returned to the browser. Okala uses no credentials and never reads provider settings. Legacy encrypted rows and shared encryption infrastructure remain untouched for compatibility with retained provider data; no migration is required.

Expected failures are tagged `CollectorError`, `CredentialError`, `PersistenceError`, or `ScanValidationError`. Collector codes distinguish network, timeout, rate limit, upstream rejection, invalid JSON/schema, and incomplete pagination. HTTP returns domain validation/conflict codes with 404/422/409, and safe upstream/persistence failures with 502 during scan preparation. Scan execution records the specific failure code and safe Persian message. Unexpected defects record `UNKNOWN_ERROR`; raw causes, tokens, addresses, and upstream bodies are never logged. A failed terminal write remains visible to the execution boundary, with stale reconciliation as recovery.

## Requests and scan integrity

- Reads get at most three attempts, with 1s/2s backoff. Valid `Retry-After` guidance raises the delay; guidance beyond 5s fails the request rather than retrying too early. Non-transient failures are not retried. Guest acquisition and database mutations are not blindly retried.
- Each attempt has an 8s timeout covering both headers and body consumption. Effect interruption aborts the actual fetch signal; an owned AbortController stays alive until decoding completes. Retry applies to the individual read, never to the whole collection.
- Snapp retains `/market-party/{latitude}/{longitude}`, 100 vendors per page, the 50-page ceiling, duplicate-page detection, complete vendor counts, exact vendor/product deduplication, threshold/stock rules, and unconverted upstream prices. Guest expiry is checked before each page, with one bounded 401 renewal of the same page/device.
- Okala discovers eligible nearby stores first, then public HomePage carousels with the selected coordinates and repeated StoreIds, then every unique isMulti campaign through multi-store offers with the same StoreIds. All requests omit Authorization and Cookie. HTTP 401/403 maps to UPSTREAM_FORBIDDEN; application-level rejection, malformed JSON/schema, rate limit, timeout, and network failures stay distinct. Threshold/stock rules, store/product identity, and rial price fields remain unchanged.
- Okala is a campaign-feed scan, not an exhaustive catalog crawl. The current client has no pagination parameters and live responses report totalPages=1 and hasNextPage=false despite totalCount exceeding returned products. No pagination contract is inferred from that count. Indicated additional pages fail with INCOMPLETE_PAGINATION rather than certify partial success. Valid empty store/campaign lists retain NO_STORES/NO_CAMPAIGNS failures; malformed or rejected envelopes are distinct. Feed disappearance records only absence from this feed.
- Every progress write is awaited. SQL guards prevent late progress or terminal writes from changing a completed/reconciled scan. Reservation checks location ownership in SQL and retains the existing unique active-scan index as the authoritative concurrency guard.
- Result inserts and terminal success share one atomic D1 batch, with tenant/active-state guards. Persistence failures roll back results; previous successful snapshots remain intact. Exact offer keys, price units, grouping version, and previous-success comparison rules are preserved.

## Worker execution limitation

The running/collection phase has a 22s wall-clock budget, leaving headroom for result persistence and failure recording. D1 has no cancellation API: writes are awaited in an uninterruptible Effect region so a failure finalizer cannot race a commit whose outcome is unknown. A slow write can still outlive that headroom.

Cloudflare [`waitUntil`](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil) allows up to 30s after the response or disconnect. Effects do not extend that lifetime or guarantee durability. CPU, subrequest, and D1 limits also still apply. Hard termination can bypass cleanup; the existing tenant-scoped reconciliation fails queued scans older than 2 minutes and running scans older than 15 minutes on a subsequent authenticated request. No queue/workflow infrastructure was added.

## Frontend ownership

`apps/web/src/app/page.tsx` gates the Google session and composes the dashboard. The dashboard is keyed by authenticated user ID and coordinates selection/navigation. Feature components own the location rail/editor, scan controls/history, provider settings, and deal shelf without changing the visual system.

Focused hooks own dashboard loading, scan submission, contextual snapshots/history, polling, filters, provider capabilities and location search/mutations. Server state uses exactly pinned `@tanstack/react-query@5.104.1` with its matching query-core package. `QuerySession`, keyed by authenticated user ID, creates one private QueryClient per session; no client or cache is shared across users. Reads consume TanStack's AbortSignal, and query keys identify the selected scan/search. Polling uses `refetchInterval`, stops at terminal state, and cancels when its observer changes context or unmounts. Mutations do not automatically retry; per-call UI callbacks stop on unmount and scan submission callbacks verify their original selection. Accepted mutations remain server-owned.

API/error handling is centralized in `lib/api.ts`, with authenticated credentials and signal propagation. Filter and navigation state stay local, preserving filters across view changes. Initial threshold selection and invalid/deleted location selection are derived without synchronization effects. Location focus/escape/restore behavior uses the existing Radix Dialog library; filters use React keyboard events, and Leaflet recentering uses its ref boundary. The frontend source contains no direct `useEffect`, `useLayoutEffect`, custom polling timers, or external listener subscriptions.

## Modifying a collector

1. Preserve the provider's documented feed, identifiers, pagination, access policy, and units. Keep Zod upstream decoding and pure normalization beside that provider; reuse domain eligibility only where semantics match.
2. Compose reads through `requestJson`; keep auth mutations single-attempt, and add narrowly bounded provider renewal where required. Use sequential pagination and return failure when collection is incomplete.
3. Return an Effect producing counts and normalized offers. Yield the supplied progress Effect before proceeding. Do not write D1 or run an internal runtime.
4. Wire the provider at `composition.ts`; keep provider access scoped to the authenticated request. Adapt fake-service lifecycle tests and synthetic collector fixtures before changing production behavior.

Run `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, and `pnpm --filter @better-buy/worker exec wrangler deploy --dry-run --outdir .data/effect-dry-run`. SQLite/D1-interface tests and mocked-session browser tests are deterministic local evidence; they do not prove deployed D1 behavior, external Google OAuth, live retailer availability, or production execution duration.
