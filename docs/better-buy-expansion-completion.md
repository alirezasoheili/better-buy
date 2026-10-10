# Better Buy expansion completion

Local integration branch: `codex/complete-expansion`, based on `8b72deb`. This report tracks the approved S01–S11 specification, including its research gates. No deployment, push, pull request, production migration, account upgrade or purchase was performed.

The shopper retains one automatic discount feed, the 40% default, optional search/settings and expandable store comparison. Campaigns, categories and store cohorts are internal inputs. There is no category browser, campaign picker or customer-selected collection scope.

## Slice status and evidence

| Slice | Local result                                                                                                                                        | Evidence                                                                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| S01   | Preserved effective threshold, safe result-read recovery and consistent unknown/tenant ID behavior.                                                 | Existing application, HTTP and browser regressions; `better-buy-s01-s04-implementation.md`.                                     |
| S02   | Preserved frozen coordinate revisions, names, actual manifests and conservative history comparison.                                                 | Shared context/comparison tests and actual D1 context checks.                                                                   |
| S03   | Preserved v2 product identity and coherent best-store money; variants and conditional offers stay separate.                                         | Shared grouping/price tests and HTTP/store comparison checks.                                                                   |
| S04   | Preserved the automatic-feed experience, manual location entry, themes and existing retailer settings.                                              | Integrated static-export browser checks and screenshots.                                                                        |
| S05   | Preserved nearby-store discovery, dynamic home ownership resolution, multiple supported ordinary sections, explicit omissions and rollback.         | `better-buy-s05-implementation.md` and S09 paired evidence.                                                                     |
| S06   | Durable implementation and local runtime verification; production runtime/account gate remains blocked.                                             | `better-buy-s06-s10-implementation.md`, durable HTTP/SQLite regressions and isolated actual workerd Workflow/D1 check.          |
| S07   | UUID start reconciliation, explicit same-intent retry and durable cancellation retain the prior feed.                                               | `better-buy-s07-s08-ui-implementation.md` and desktop/mobile recovery tests.                                                    |
| S08   | Indexed server ranking/search, bounded product summaries and separate paged offer disclosures.                                                      | `better-buy-s08-implementation.md`, ten HTTP/projection regressions and actual D1 benchmark.                                    |
| S09   | Existing small dynamic campaign scope demonstrated useful enrichment. No broader adapter admitted.                                                  | `better-buy-s09-measured-scope.md`: paired baseline 57 → 64, seven actual additions, zero overlap, 23 requests in 2.18 seconds. |
| S10   | Existing Okala contracts migrated to the durable boundary; new unverified pagination is rejected. Production execution follows the same gated flag. | Okala adapter/threshold tests and actual local Workflow/D1 fixture.                                                             |
| S11   | Integrated checks and final review are recorded below.                                                                                              | Local logs and visual evidence in `.data/spec-completion-start` and `.data/design-evidence`.                                    |

Live counts are dated observations, never permanent assertions. The S09 zero-eligible collection and seven-addition collection are distinguished from eligible offers that merely duplicate the baseline. Exact repeated raw rows are accepted and collapsed; contradictory repeated tuples, count drift, whole-page repetition and missing terminals prevent completeness.

## Execution and persistence

Start intents bind account, UUID and request fingerprint atomically to one scan. Workflow identity is deterministic (`scan-{scanId}`); uncertain dispatch is reconciled to that identity. Rollback to the bounded collector retains atomic intent reuse. Workflow payloads contain only scan ID and contract version, and step outputs contain bounded metadata. Guest credentials remain ephemeral and server-only.

Persisted attempts include authentication and retries. Each provider operation permits at most three transient attempts, including valid bounded Retry-After waits. Durable runs retain their 15-minute elapsed deadline, 100-page and 10,000-eligible-offer ceilings. Snapp enrichment retains its stricter 40 physical-request ceiling. Global workflow concurrency defaults to one, independently of the per-account active-scan guard. The server freezes admitted units before collecting the feed.

Pages publish only after every bounded chunk is committed. All frozen units must have terminal evidence, the product projection must be ready, and cancellation must not have committed first. Running, failed and cancelled staging cannot become published results. Durable engine reconciliation replaces the legacy stale timer for workflow records. Pending dispatch/queue wait is bounded at ten minutes.

Migration 0008 builds a materialized saved-product index before durable publication. Default product pages contain 50 summaries, maximum 100; expanded store pages default to 20, maximum 50. Tenant/scan/search/sort/group-bound cursors paginate saved D1 data only. The client retains at most twenty loaded pages per window and keeps the previous window if another read fails. Old array/raw/group routes and legacy/Jet history remain readable.

Authenticated quotas are stored atomically in D1: 120 reads, five starts and ten cancellations per account per minute, with separate buckets and Retry-After responses. The five-minute cron reconciles a bounded set of active workflow records, removes failed/cancelled staging older than seven days, and bounds expired quota cleanup. Completed history is retained.

## Checks and measurements

Integrated workspace verification passed: **254 tests** (205 Worker, 14 shared, 35 web), all workspace typechecks, the actual Workflow/D1 fixture, both actual D1 compatibility scripts and Worker deployment dry-run. The local database was backed up to `.data/backups/better-buy-before-durable-expansion.sql`, and local migration metadata confirms 0001 through 0010. No remote migration was run. Final code review is recorded below.

- Production static build passed: home first-load JavaScript **189 KB**, route contribution **86.4 KB**. These are build sizes, not measured mobile Core Web Vitals.
- **86 browser checks passed** against the newly built static export. Coverage includes location/context switching, stale reads, ambiguous start, cancellation, failed product/offer pages, paging beyond twenty pages, read-only search/sort/compare, themes, keyboard focus, reduced motion, touch targets and responsive layouts.
- Screenshots were generated at **360, 390, 768, 1280 and 1440 px**, with light/dark and expanded comparison/error states. Mobile/desktop and dark-dialog images were visually inspected. Tested action contrast was **7.31:1**, body contrast **15.72:1**, and dark contrast **8.60:1**; inspected touch targets had zero failures.
- Actual local D1 benchmark: 30/500/3,000 groups and 90/2,000/24,000 raw offers. Default product envelopes were **25,312 / 42,534 / 42,603 bytes**, below the 250 KB target. Warm page p95 was **351 / 374 / 319 ms**. Cold projection was **0.81 / 3.81 / 32.55 seconds**; the large case requires prepublication durable execution and cannot be claimed to fit the old HTTP timeout.
- The fresh S09 invocation used **23/40 requests** and **2.18/20 seconds**. Both admitted scopes reached empty terminal pages; no identity conflict occurred. Omitted scopes are unmeasured, not zero eligible.

The initial browser attempt served a stale `out` export and failed 46 assertions. Serving the newly built export corrected the harness and all 86 checks passed. This failure is retained in the logs rather than described as a product pass. Repository-wide formatting also reports existing files; applicable changed-file formatting is checked separately without an unrelated cleanup.

## Migrations, flags and local run

Apply additive migrations in order; keep migrations and history when rolling back flags:

| Migration                         | Purpose                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 0006_scan_context.sql             | Existing location revisions and scan/offer context.                                                      |
| 0007_durable_scans.sql            | Execution, intents, frozen units, pages/chunks, private observations/discovery and attempt reservations. |
| 0008_saved_product_projection.sql | Ranked summaries, expanded offers and projection checkpoints.                                            |
| 0009_api_rate_limits.sql          | Atomic authenticated quotas.                                                                             |
| 0010_scan_history_index.sql       | Tenant-first stable history traversal.                                                                   |

Current configuration: `SNAPP_STORE_CAMPAIGNS_ENABLED=true`, `SCAN_WORKFLOW_ENABLED=false`, `SCAN_WORKFLOW_CONCURRENCY=1`, `API_RATE_LIMITS_ENABLED=true`. The runtime entrypoint exports `ScanWorkflow`, its `SCAN_WORKFLOW` binding and the scheduled reconciler. Turning off enrichment returns to Market Party without deleting history. Turning off durable dispatch returns new starts to the bounded collector while existing durable history/status remains readable.

From the repository root in PowerShell:

```powershell
pnpm --filter @better-buy/worker db:migrate:local
pnpm dev
```

`pnpm dev` uses the existing worker/frontend local setup; `predev` also builds shared contracts and applies local migrations. Existing local authentication/environment edits were preserved. For isolated durable verification without provider or customer calls:

```powershell
pnpm --filter @better-buy/shared build
node apps/worker/scripts/check-durable-workflow.mjs
node apps/worker/scripts/check-expansion-d1.mjs
node apps/worker/scripts/check-store-campaign-d1.mjs
```

Reproduce a normal static export and browser verification:

```powershell
pnpm --filter @better-buy/worker run build:web
$env:PLAYWRIGHT_PORT = '3118'
pnpm --filter @better-buy/web exec playwright test --config playwright.export.config.ts
```

The export server defaults to `apps/web/out`; `BETTER_BUY_EXPORT_DIR` selects a different saved export directory. An isolated release export can use that variable where the preserved local Next configuration supports it. The verified export was retained privately at `.data/spec-completion-start/static-export`.

## Remaining production gate and deployment steps

**G05 production plan/capacity is unresolved.** The existing OAuth login was inspected separately from feed research. A read-only account-subscriptions request returned **HTTP 403** because the current scopes lack **Billing Read**. No account setting was changed. The smallest remaining check is an authorized account-plan read followed by actual deployed binding/subrequest/CPU/step/D1 accounting on the measured small scope. Local runtime support and fixtures do not prove production capacity. Durable dispatch remains disabled; rejected global campaigns and unverified category/store-category adapters remain gated.

When separately authorized, first confirm that account gate and back up the production database. Then apply the additive migrations and deploy with durable dispatch still disabled:

```powershell
pnpm --filter @better-buy/worker exec wrangler d1 migrations apply better-buy --remote
pnpm cf:deploy
```

Check authentication, existing saved history, the automatic feed and the small measured campaign scope in the target environment. Enable `SCAN_WORKFLOW_ENABLED=true` only after production runtime/capacity checks pass; retain concurrency one and the existing enrichment rollback flag. This report supplies instructions only: no remote migration or deployment was executed.

## Local-change preservation and review

The starting 149 changed/untracked files, status, binary patch and SHA-256 hashes were recorded in `.data/spec-completion-start`. Feature work was isolated on managed implementer branches and merged locally through the required merger. Unrelated development authentication, environment, README, lockfile, package-manager and ignore changes are excluded from feature commits. Generated local artifacts are restored or retained privately as appropriate.

Final Standards and Spec reviews, findings and resolutions are recorded here after integration.
