# S05 dynamic store campaign enrichment

The existing automatic refresh now enriches Market Party with bounded store-specific collection offers. The shopper-facing UI and default 40% threshold are unchanged. Existing S01–S04 local changes are preserved. Rejected cross-store campaign routes remain outside the admitted manifest.

## Discovery and admission

The collector reads a location-scoped nearby vendor page from `/express-vendor/general/vendors-list`, takes validated `data.code` values from `VENDOR` entries, and resolves each store's numeric owner from root `vendorInfo.id` in its home response. It validates `vendorInfo.code` against the requested code and `deliveryData.id` / `deliveryData.detail.vendorId` against that resolved owner, requiring explicit delivery. Two different codes resolving to one numeric owner fail before manifest freeze.

There are no production store IDs, researched store codes, collection IDs, promotional title matches, or exactly-one-collection requirements. Each inspected home enumerates its `product-list` sections. Supported ordinary sections have a positive numeric `value`, `collection_type="default"`, no explicit benefit conditions, and null or absent configuration. Other section types, conditional or unknown configurations, unsupported collection types, invalid IDs, and omitted candidates have explicit operational reasons.

Nearby ordering is retained; collection IDs within a home are deduplicated and sorted. This is a bounded discovery prefix, not an exhaustive store inventory. Collection selection is independent of titles. A cached 100-row page-zero planning probe establishes count and page-size behavior. The server freezes all admitted store/collection pairs before Market Party collection and subsequent campaign enumeration. Page-zero observations are reused, never fetched twice. No unit is appended after freeze.

## Execution and offer rules

| Bound                                        | Policy                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Physical upstream requests across the scan   | 40, including guest acquisition, renewal, discovery, baseline, campaign pages and retries |
| Nearby discovery                             | One page, at most the first 20 returned store codes                                       |
| Subsequent planning work                     | At most 12 physical requests                                                              |
| Baseline/retry capacity reserved by planning | Eight requests, in addition to expected admitted page work                                |
| Supplementary collections                    | At most two, which may belong to the same store                                           |
| Reported campaign rows                       | At most 700 per collection                                                                |
| Campaign pages                               | At most eight per collection, including an empty terminal                                 |
| Provider collection deadline                 | 20 seconds, inside the existing 22-second application deadline                            |

Requests use `/express-search/product-list/{collectionId}/vendor/{vendorCode}` with the discovered scope, `variable`, `secondVariable`, `lat`, `long`, `filters=[]`, and `page_size=100`. Terminal completion requires stable counts, the expected raw total, an empty page, no replay, no conflicting repeated tuple, and consistent product/document ownership. Exact duplicate records are collapsed separately from raw count. Unsupported or oversized planning responses are omitted before admission; an admitted unit's failure makes the whole run incomplete and preserves earlier successful results.

Eligible rows require positive numeric stock, no explicit out-of-stock flag, valid amount-derived prices, ordinary benefit applicability under existing rules, and the effective threshold. Store or delivery Pro flags do not imply a product condition. Explicit product restrictions remain excluded. The API's explicit `discount=0, discountRatio=null` representation establishes zero discount; a null ratio on a positive discount remains a contract failure. Price units and display conversions retain the existing Snapp handling. No checkout guarantee or account-plan inference is added.

Offers merge by product ID and canonical numeric vendor ID. Existing Market Party tuples win qualifying overlap; provenance is combined, stock is not summed, and below-threshold campaign observations cannot overwrite baseline offers. Multiple campaign sources add provenance without multiplying the offer count. Actual additions are measured against the accumulated union, so the same new offer in a second campaign is not counted twice.

Frozen context includes sorted collection and store IDs plus their actual code/owner/collection associations. Its scope hash suppresses incompatible historical absence comparisons when membership changes or rollback restores the baseline-only manifest. Operational diagnostics report baseline/enriched eligible totals, per-unit qualifying/overlap/additional counts, raw/unique/duplicate counts, page sizes, exclusions, omissions, elapsed time and physical request usage, without exact coordinates or tokens.

## Verification and rollback

The [live verification record](better-buy-s05-store-campaign-verification.md) includes both initial evidence cases and the final dynamic collector comparison. The final dynamic run returned **62 baseline offers and 69 enriched offers**, with seven actual additions and zero qualifying baseline overlap, in **23 requests / 2.179 seconds**. One dynamically admitted collection had zero qualifying offers; the other contributed seven. These observations are changing feed data, not permanent catalog assertions. Nearby discovery was partial and its omitted coverage is recorded.

Regression coverage includes unrelated store codes and numeric IDs, multiple ordinary collections, two stores offering one product, code/delivery/product identity mismatches, conflicting owner mappings, unsupported and conditional sections, planning/request bounds, zero-versus-duplicate coverage, stock and prices, null zero-discount ratios, terminal pagination, count drift, page replay, duplicate conflicts, persistence, failed publication, prior results, scope changes and rollback. The isolated workerd D1 script `apps/worker/scripts/check-store-campaign-d1.mjs` checks the actual D1 binding without touching development or remote databases.

`SNAPP_STORE_CAMPAIGNS_ENABLED="true"` enables the verified adapter in this checkout's Worker configuration. Set it to `"false"` to restore baseline-only collection. Missing flags also leave enrichment disabled. Saved enrichment history and the additive S01–S04 schema remain readable after rollback. This work changes local configuration; it does not deploy the Worker or verify an account plan.

The production build is verified with an isolated export directory because the user's running Next dev server shares the usual build cache. This avoids modifying the UI or interrupting their development server. Changed source files pass scoped formatting; repository-wide formatting still reports unrelated pre-existing issues.

Completed checks:

- `pnpm test`: all 223 workspace tests passed; the subsequently added dynamic-owner conflict regression passed with the complete 32-test adapter suite.
- `pnpm typecheck`: all workspace type checks passed; the final adapter regression file also passed the worker test type check.
- Both isolated actual-D1 scripts passed, including S01–S04 compatibility and the new frozen campaign scope/publication/rollback behavior.
- The production static export passed using `BETTER_BUY_EXPORT_DIR=.next-s05-verify`; its generated build cache was moved into ignored private verification storage after completion.
- All 72 existing desktop/mobile browser tests passed against that export using an isolated test server.
- Worker deployment dry-run passed with the enabled server flag. No deployment was performed.
- Scoped formatting passed. Repository-wide formatting remains a pre-existing limitation outside this change.
- Pre-existing file hashes confirmed every web file and all files outside the intended worker/shared changes were preserved. The tracked generated web type-check cache was restored to its original verified contents.
