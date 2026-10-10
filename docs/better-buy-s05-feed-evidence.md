# S05 campaign verification and gate decision

Observed 10 October 2026, Asia/Tehran. This is evidence for the conditional S05 request, not approval to enable additional adapters. Existing local changes, the automatic feed and the UI are preserved.

**Decision: leave concrete campaign collection gated.** One small, dynamically discovered campaign has terminal pagination evidence but contributes **zero offers at the configured 40% threshold**. Its identity/applicability/delivery contracts and the actual production execution budget remain unresolved. No campaign is admitted to the server-selected default manifest. S05 enrichment is blocked; this note does not claim the feature shipped.

## Phases completed

1. Inspect the current checkout, spec and existing default manifest; preserve the dirty checkout and identify the supported collection/publication path.
2. Run sequential, bounded, read-only discovery and concrete-page probes using the existing scan-owned guest acquisition. Independently examine runtime/account evidence against current official platform documentation.
3. Evaluate stock, price, pagination, identity, delivery, execution budget and paired net-new coverage before changing admission.
4. Keep admission closed when gates fail, record sanitized evidence and test the authenticated API through collection, persistence and the saved v2 feed.

## Probe scope and request contract

The decisive paired probe started at **2026-10-10T12:41:09.679Z** (16:11:09.679 Tehran) and completed in **820 ms**. It used the configured local test location; coordinates, customer identifiers and issued guest credentials are withheld. It read local coordinates without changing the database. All six requests were sequential, returned HTTP 200 JSON, and used the allowlisted origin `https://svc.snapp.market`. There were no retries, redirects, authentication refreshes or fan-out. A forbidden/rate-limit response would stop probing. Concrete/discovery responses had a 4 MiB body guard and eight-second request timeout.

The existing `collectDeals` obtained the guest token. Its guest headers and public PWA parameters were reused in memory; tokens were never persisted or printed. Discovery requested `/express-home/mobile/v3/user/new-home` with `lat`/`long` and the PWA parameters. No upstream URLs were followed.

Discovery returned ten product-collection banners and four directly identified product-collection sections. The last directly identified section, Papia, was selected for this research probe. Its live ID was **21166** and `collection_type` was `default`. This is a dated observation, not a hardcoded production selector, a deterministic admission policy or proof of benefit applicability. Other campaigns were not crawled.

Concrete requests used `/express-search/mobile/v1/product/product-list`, the same location/access context, `page`, `page_size=100`, and an endpoint-specific JSON string under `extra-filter`:

```json
{
  "product_list_id": 21166,
  "super_type_category_id": 0,
  "super_type_brand_id": 0,
  "new_home": true,
  "chain_id": 0,
  "vendor_id": 0
}
```

The Snapp probe series contained 19 requests in total, including preliminary discovery/schema checks and a corrected local row-type counter. The decisive six-request comparison below is the coverage evidence; preliminary samples are not combined into its offer counts. Only one location and one campaign were probed. No production database writes, deployment, account changes, login flow or package upgrades were performed.

## G01: terminal pagination established for this snapshot

The concrete envelope was `{status: true, data: {id, title, type, count, finalResult}}`; each nonempty result had `type: "PRODUCT"` and a concrete row under `data`. Product row type is uppercase and this contract differs from Market Party's vendor-grouped schema.

| Page | HTTP | Reported count | Product rows | Interpretation                |
| ---- | ---- | -------------- | ------------ | ----------------------------- |
| 0    | 200  | 17             | 10           | First page                    |
| 1    | 200  | 17             | 7            | Distinct boundary/last page   |
| 2    | 200  | 17             | 0            | Valid empty terminal envelope |

All 17 `(vendor_id, id)` pairs were unique across pages 0/1, with no identity overlap between those pages. Count remained 17, matched the complete observed row count, and page 2 preserved the envelope/count. Requested size 100 was not honored: effective size was ten. Discovery's `page_size=15` also did not describe the concrete endpoint's page size. No 204 contract was established. This establishes the small snapshot's terminal behavior; it does not validate every campaign, location or future count/ordering behavior. The row order changed between preliminary probes, so stable ordering/replay remains unproven even though the decisive snapshot was unique and complete.

## G02/G04: observed stock and price fields, unresolved identity/terms

Rows exposed `id`, `vendor_id`, `price`, `discount`, nullable `discountRatio`, `stock`, `no_stock`, `title`, `badges`, `product_entity`, `document_id`, `sub_vendor_id` and a nested `vendor` with `id`, `title`, `code`. They did not expose Market Party's `productVariationId`, `vendorId` or `is_out_of_stock` fields. They must not be parsed with that schema or given its default values.

| Field                | Evidence                                                                                                                         | Admission consequence                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `stock` / `no_stock` | All 17 rows had positive numeric stock and `no_stock=false`, across ten outer vendor IDs                                         | Supports observed stock; missing stock must still be unknown in a future adapter                                 |
| `price` / `discount` | All values were finite nonnegative integers, discount no greater than price                                                      | Discount is an amount; subtract once, without percentage reapplication or clamping                               |
| `discountRatio`      | Three rows had 10%, 8%, 3%; their amount-derived ratios matched exactly. Fourteen had null ratio and zero discount               | Nullable ratio needs an explicit derived-evidence rule; these observations do not establish a mismatch tolerance |
| Source unit          | No currency/unit field in this envelope                                                                                          | Existing Snapp research says toman; this payload alone does not independently prove the new contract's unit      |
| Benefit/terms        | `type=default`; all badges empty; no explicit coupon/Pro/subsidy/validity/quantity terms established                             | Titles, empty badges and collection type do not establish universally applicable benefits                        |
| Product identity     | New row `id` namespace/variation relation to baseline `productVariationId` unverified; `product_entity` was a descriptive string | Do not assume equivalent IDs or merge variants by title                                                          |
| Vendor identity      | One row disagreed between outer `vendor_id` and nested `vendor.id`                                                               | Quarantine ambiguity rather than attach another store's stock/price                                              |

Two-store numeric examples, with product/store/customer names omitted:

| Row ID  | Outer/nested vendor ID | Original amount | Discount amount | Final amount | Ratio | Stock | `no_stock` |
| ------- | ---------------------- | --------------- | --------------- | ------------ | ----- | ----- | ---------- |
| 4083782 | 115348 / 115348        | 150000          | 15000           | 135000       | 10    | 9     | false      |
| 9717192 | 114354 / 114354        | 133500          | 10680           | 122820       | 8     | 13    | false      |
| 7002575 | **77146 / 115651**     | 1451300         | 0               | 1451300      | null  | 10    | false      |

No money anomaly was found among these 17 rows. One vendor-identity anomaly was found. The observed mappings alone do not pass the full applicability/namespace gates. No new shopper-facing offers were normalized or saved.

## G03: delivery remains unknown

The same coordinates were sent to baseline, home discovery and concrete collection. There was no second-location comparison or authoritative provider contract proving that concrete campaign results honor those coordinates. Nested vendors contained only identity/title/code, with no `doesDeliver` or delivery fee/availability facts. Delivery must remain unknown; passing coordinates is not a delivery guarantee.

## G05: small network sample, production budget unverified

| Request                    | Page | Observed network duration |
| -------------------------- | ---- | ------------------------- |
| Existing guest acquisition | —    | 104 ms                    |
| Existing Market Party      | 0    | 268 ms                    |
| Home discovery             | —    | 58 ms                     |
| Concrete campaign          | 0    | 171 ms                    |
| Concrete campaign          | 1    | 101 ms                    |
| Concrete campaign          | 2    | 82 ms                     |

The baseline finished in 404 ms including access/parsing. Whole paired work finished in 820 ms, with four additional GETs and 412 ms of measured additional network waiting. This measures a direct local Node probe, not Worker CPU, retries, persistence, account limits or production completion latency.

The [runtime evidence](better-buy-s05-runtime-evidence.md) records the current 22-second collection timeout, 30-second HTTP `waitUntil` ceiling, query/subrequest limits, absent Workflow binding and missing actual-account telemetry. Final success persistence lies outside the collection timeout. At 82 baseline offers, publication alone needs at least 83 D1 statements, before preparation/auth/progress; that exceeds the documented Free 50-query invocation ceiling. Wrangler `whoami` confirmed account access, but a read-only account-subscriptions request returned **HTTP 403** at 2026-10-10T12:47:48.829Z. The deployed plan therefore remains unverified; probing stopped without changing access. Local timing does not prove capacity. The proposed tiny envelope in the runtime note is conditional, not an implemented policy; this campaign also requires three concrete responses including terminal, rather than that proposal's two.

Do not admit enrichment or lengthen HTTP work based on this one fast sample. Verify actual combined invocation limits/CPU/D1/publication duration and enforce admission budgets first. If bounded execution cannot fit, S05 requires minimum durable dispatch; its binding/account/resume/duplicate behavior is not established here.

## G06: complete paired snapshot adds no eligible coverage

Baseline and campaign used one location/access context in the same subsecond observation window, at threshold 40%. All campaign rows were below threshold: three discounted rows at 10%, 8%, 3%, and fourteen zero-discount rows. Thus even before resolving benefit/identity restrictions, the campaign's possible eligible set is empty. No assumption equating Market Party and campaign benefits is needed to establish this upper bound.

| Metric                                                          | Observed value                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Unique eligible baseline offers                                 | 82                                                                                |
| Baseline observed vendors/products                              | 35 / 350                                                                          |
| Complete campaign rows / provisional unique row identities      | 17 / 17                                                                           |
| Campaign outer vendor IDs                                       | 10                                                                                |
| Campaign rows meeting 40% with positive stock and valid amounts | 0                                                                                 |
| Additional eligible offers, maximum possible                    | 0                                                                                 |
| Eligible overlap                                                | 0 (additional eligible set empty)                                                 |
| Net-new eligible offers / eligible union                        | 0 / 82                                                                            |
| Unknown-stock rows                                              | 0                                                                                 |
| Known conditional exclusions                                    | Not established; benefit applicability unknown for all 17, none crosses threshold |
| Comparable eligible price conflicts/differences                 | No pairs; cannot establish cross-feed price reconciliation                        |
| Vendor-identity conflicts                                       | 1                                                                                 |
| Requests / total duration                                       | 6 / 820 ms                                                                        |

This result applies to this campaign/location/threshold/time only. It is not evidence that all home collections have no value. Lowering the shopper threshold to make this research campaign useful would change the requested behavior and is not an admission fix.

## Gate state and tested fallback

| Gate | State                         | Result                                                                                        |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| G01  | Snapshot evidence established | 10 + 7 rows, stable count 17, empty terminal page; ongoing ordering stability not established |
| G02  | Partial / unresolved          | Stock and amount mappings observed; explicit unit/benefit applicability not established       |
| G03  | Unverified                    | No delivery claim                                                                             |
| G04  | Unverified / anomaly          | Product namespace relation unknown; one vendor mismatch                                       |
| G05  | Unverified                    | No actual production plan/CPU/D1/completion evidence                                          |
| G06  | Fails usefulness at 40%       | Zero additional eligible offers                                                               |

Production collection remains `snapp-market-party`, contract version 1, `feedKinds=["market_party"]`, with no campaign IDs admitted. No adapter, discovery request, navigation, category browsing, campaign selector or UI change was added to the automatic refresh path.

The new authenticated API integration regression in `apps/worker/src/snapp-access.test.ts` exercises both an ordinary refresh and a request attempting to supply collection/category/campaign/upstream URL/manifest selectors. Both produce the same frozen server-owned context, request only guest access and Market Party, persist a complete successful result, and expose the same v2 product/store feed. A saved-result GET with a collection query performs no upstream work. Existing failure/persistence/history tests continue to verify preservation of earlier successful results.

Validation passed: **183 workspace tests** (14 shared, 34 web, 135 Worker), both Worker production/test TypeScript checks, formatting for the changed files, and `git diff --check`. A file-hash comparison preserved all 135 other pre-existing tracked/nonignored files, including the complete UI; removing the new test block reproduces the pre-existing integration test source. No new browser visual check was needed for this unchanged UI.

Before revisiting admission, select another dynamically discovered bounded candidate only when its complete same-location snapshot demonstrates net-new threshold-eligible offers, resolve vendor/product/benefit/unit/delivery semantics, and obtain actual runtime capacity evidence. Freeze the actual admitted manifest before collection, enforce combined budgets, and test admitted-feed failure as incomplete before releasing enrichment.
