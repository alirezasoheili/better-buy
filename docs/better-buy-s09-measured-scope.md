# S09 measured automatic enrichment

One bounded invocation of the existing automatic Snapp collector completed on 10 October 2026 at **17:18:06.781–17:18:08.963 UTC**. In this collection window, the unchanged **40% threshold** yielded **57 baseline eligible offers and 64 enriched eligible offers: seven actual additions, zero baseline overlap**. This measures the existing dynamic adapter; it does not enable another adapter, change the UI, or establish production account capacity.

## Method and primary evidence

- Executed `collectDeals` with `storeCampaigns: true` from source commit `dc31028`, using the same private test location as the preceding S05 evidence. The local location was read with SQLite `readOnly: true`; the probe never called a persistence seam or wrote D1. The collector implementation is unchanged by this task. [Collector](../apps/worker/src/providers/snapp/collector.ts), [normalization](../apps/worker/src/providers/snapp/model.ts).
- Baseline and supplementary offers came from **one invocation**, with the same coordinates and threshold. This is a paired collection window, not a claim that upstream inventory is an atomic snapshot. Existing ordinary inline-discount normalization and exact `(vendorId, productVariationId)` matching were retained. No price/stock tuple was assembled across observations. [Eligibility](../apps/worker/src/domain/eligibility.ts), [campaign enrichment and merge](../apps/worker/src/providers/snapp/storeCampaigns.ts).
- The private evidence is `C:/Users/soheili/Documents/better-buy/.data/s09/measured-scope.json`; the private harness and bundle are alongside it. It contains request status/timing, manifest events, baseline counts/eligible keys, campaign field facts, returned offers, and collector diagnostics. Coordinates, request headers, guest token bodies, cookies, and customer identifiers are absent from the evidence JSON and this note. Market Party request paths use `{coordinates}`.
- Exactly one live invocation was made. The harness enforced a maximum of **40 physical requests / 20 seconds**, including guest acquisition, and would stop physical requests on **403/429**. No additional survey, account/plan API request, deployment, or externally persisted scan was performed. [Research gates and S09](./better-buy-expansion-spec.md#mandatory-research-gates).

## Paired results

The baseline returned one page with `total_count=34`, 34 valid vendors and 340 unique product/store observations. All 34 reported vendors were collected. Its eligible count was 57. The enriched result contained 34 vendors, 955 unique product/store observations, and 64 eligible offers.

The server dynamically admitted these two scopes from the location's returned store-home sections. The IDs below are observations, not a production allowlist. Both belong to resolved vendor `114458`, store code `pz91qe`.

| Collection | Reported/returned rows | Unique rows | Repeated identical rows | Stock-backed offers ≥40% | Baseline overlap | Actual additions | Classification                                       |
| ---------- | ---------------------: | ----------: | ----------------------: | -----------------------: | ---------------: | ---------------: | ---------------------------------------------------- |
| 1810       |                46 / 46 |          46 |                       0 |                        0 |                0 |                0 | Zero eligible offers in the complete collected scope |
| 2192       |              619 / 619 |         587 |                      32 |                        7 |                0 |                7 | Eligible offers, all seven add to the baseline       |

**Neither scope is an “eligible offers, all duplicates” result.** Collection 1810 has no eligible offers; collection 2192 has seven eligible offers and no baseline duplicates. Its 32 repeated rows are identical pagination duplicates, separate from eligible-offer overlap. There was no eligible duplication between the two supplementary scopes. The observed union satisfies `57 + 7 − 0 = 64`.

These are new **eligible offer identities** relative to the paired baseline, not a claim that the underlying products never appeared in raw baseline data or at other stores. No overlapping eligible identity existed on which to measure conflicting price/stock observations.

## Offer semantics and identity

All seven additions had positive explicit stock, no asserted out-of-stock flag or conditional/Pro restriction, and agreeing `price`, discount amount and percentage. The collector retained its rials mapping and computed the final price by subtracting the discount once. The six 45% rows and one 40% boundary row were:

| Product ID | Discount | Original rials | Discount rials | Final rials | Stock |
| ---------- | -------: | -------------: | -------------: | ----------: | ----: |
| 9631264    |      45% |        390,000 |        175,500 |     214,500 |    13 |
| 5983470    |      45% |        690,000 |        310,500 |     379,500 |    35 |
| 5984388    |      45% |        290,000 |        130,500 |     159,500 |    19 |
| 9677321    |      45% |        990,000 |        445,500 |     544,500 |     8 |
| 9704355    |      45% |        990,000 |        445,500 |     544,500 |    17 |
| 9631293    |      45% |        990,000 |        445,500 |     544,500 |    10 |
| 15104492   |      40% |         90,000 |         36,000 |      54,000 |     2 |

Every added offer belongs to vendor `114458`, with provenance `snapp:store_campaign:114458:2192` and the existing `standard_discount / ordinary / applicable=true` adapter semantics. No threshold reduction, conditional benefit promotion, stock inference, or shipping/Prostore inference was used.

Across **665 returned supplementary rows**, the resolved owner, outer `vendor_id`, and `document_id=<productId>-114458` agreed: **zero conflicts**. Nested `vendor.id`/`vendor.code` were absent on all these rows; their absence must not be described as nested-ID corroboration. There were no non-null `sub_vendor_id` values. The successful home-resolution path requires matching store code, matching delivery-owner IDs and `doesDeliver=true` before admitting a scope. That is location-specific provider evidence for this store in this window, not an independent delivery guarantee or a claim about unprobed stores. [Ownership and applicability guards](../apps/worker/src/providers/snapp/storeCampaigns.ts).

This store-specific contract does not resolve the outer/nested identity conflicts in the previously rejected global campaign research. Those campaigns remain gated; this invocation made no requests to them. [Prior identity evidence](./better-buy-s05-identity-research.md).

## Pagination and collection work

| Collection | Zero-based page sizes                 | Empty terminal | Reported total semantics                                  | Physical collection requests |
| ---------- | ------------------------------------- | -------------- | --------------------------------------------------------- | ---------------------------: |
| 1810       | `46, 0`                               | Page 1         | Count 46 equals returned rows and unique identities       |                            2 |
| 2192       | `100, 100, 100, 100, 100, 100, 19, 0` | Page 7         | Count 619 equals returned rows; unique identities are 587 |                            8 |

The 100-row boundary, short final data page and subsequent empty terminal were observed for collection 2192. The count was stable across pages. Identical duplicates explain the difference between reported row count and unique identity count; they do not create coverage. There were no replayed whole pages, count drift, conflicting repeated tuples, premature empty pages or page-cap failures. This fully enumerates the two admitted scopes for this invocation, not the surrounding discovery universe.

The manifest was captured after physical request 14, **1,251 ms** after start, before the baseline request and remaining supplementary enumeration. Planning page-zero responses were reused. Work was:

| Operation                                                        | Physical requests |
| ---------------------------------------------------------------- | ----------------: |
| Guest access acquisition                                         |                 1 |
| Nearby store discovery, first page                               |                 1 |
| Location-scoped store-home resolution                            |                10 |
| Two supplementary scopes, including planning pages and terminals |                10 |
| Baseline Market Party page                                       |                 1 |
| **Total**                                                        |       **23 / 40** |

All physical responses were HTTP 200; no retry, token refresh, 403 or 429 was observed. Collector time was **2,178 ms**; harness time including final bookkeeping was **2,180 ms / 20,000 ms**. This window therefore used 57.5% of the physical-request cap and approximately 10.9% of the elapsed-time cap. It leaves 17 requests of measured headroom, but is not a worst-case latency/CPU, production subrequest accounting, or paid-plan conclusion.

## Exclusions and bounded coverage

Offer exclusions, after per-scope identity deduplication, were exactly **46 + 580 = 626 `BELOW_THRESHOLD`** rows. Unknown-stock, out-of-stock and conditional-benefit exclusions were each zero in these collected scopes. This result is confined to the observed contract and window.

The dynamic planner also reported 197 omission diagnostics. They are counts of diagnostic entries, not counts of missing eligible offers:

| Reason                                                       | Entries | Meaning                                                                                                      |
| ------------------------------------------------------------ | ------: | ------------------------------------------------------------------------------------------------------------ |
| `NEARBY_DISCOVERY_PAGE_LIMIT: first 20 returned stores only` |       1 | Discovery intentionally did not enumerate the full nearby universe                                           |
| `UNSUPPORTED_SECTION_TYPE`                                   |      90 | Home sections such as coupon, category and personalized collections were not ordinary admitted product lists |
| `SUPPLEMENTARY_COLLECTION_LIMIT`                             |      96 | Additional candidate scopes were not probed after the two-scope cap                                          |
| `DISCOVERY_REQUEST_BUDGET`                                   |      10 | Ten returned store codes were not home-resolved after the bounded planning allocation                        |

No eligible count is inferred for an omitted collection/store. In particular, a scope omitted by the limit is **unmeasured**, not “zero eligible.” The present ordering selected a zero-eligible 46-row scope before a useful 619-row scope and spent ten home-resolution requests; these measured costs can inform future planning, without manufacturing coverage by lowering the threshold or widening this probe.

## Decision and limits

The existing dynamic automatic adapter demonstrated useful coverage in this location/window: **seven net-new stock-backed ordinary-discount offers within the existing bounded execution budget**, with terminal pagination and consistent store ownership. This supplies paired G06 evidence and concrete G01/G02/G03/G04 observations for the admitted scopes. The existing feed remains the only customer flow; no category browsing or campaign selection was added.

G05 account capacity and durable-production admission are separate. This probe did not revisit the account's documented `403 BillingRead` blocker, exercise remote D1/Workflows, measure Worker CPU, or authorize deployment. It does not admit a new large scope or validate the rejected global campaign. No provider-contract blocker occurred in this invocation, and no additional live verification was performed.

## Validation

An offline audit of the saved evidence checked the same-window baseline/union arithmetic, unique qualifying identities, coherent money/stock tuples, unchanged threshold, exact additions/overlap, matching document ownership, terminal page shapes, all-200 status ledger, omission totals, and the 40-request/20-second bound. This audit makes no provider calls. The document was committed through the repository's normal formatting, typecheck and workspace-test hooks after following the integration branch tip.
