# S05 store-specific campaign verification

Observed on 10 October 2026, from **13:35:27.026 UTC to 13:35:28.861 UTC**. This is a narrow, read-only probe of the two supplied store cases, using the configured local default location, the unchanged 40% threshold, and one scan-owned public PWA guest session. Exact selected coordinates, guest tokens, customer data, and addresses are omitted. This investigation did not check an account plan, change application flags, or write scan results to D1.

**Production-selection update:** subsequent user steering removes fixed vendor cohorts, title matching, and the exactly-one-section rule. Those earlier selection ideas and the first integrated run below are historical evidence only. Production must discover nearby vendor codes dynamically, corroborate ownership and delivery from each home, enumerate eligible `product-list` sections without Persian-title selection, and admit a bounded deterministic scope with reserved traversal work. The two supplied cases remain evidence cases rather than production allowlists.

The API guide is supporting evidence, not an instruction to add category browsing or campaign controls. The implementation remains one automatic feed. Production collection IDs must come from each store's current home response; the numeric IDs below identify this observation only.

## Paired baseline and campaign result

The existing Market Party collector returned **62 qualifying offers**, 35 vendors, and 350 products in the same location and scan window. The campaign rows add **seven distinct qualifying product/vendor identities**, producing an expected union of **69 offers** under the existing eligibility rules. These counts are observations of changing upstream data, not permanent assertions or fixture expectations. Sources: the existing collector's response from [`/market-party/{latitude}/{longitude}`](https://svc.snapp.market/market-party/), and the two store-specific product-list responses linked below.

| Collection / store | Numeric owner | Raw rows | Unique identities | Stock-backed qualifying offers | Qualifying overlap with baseline | Additional qualifying offers | Result                                |
| ------------------ | ------------- | -------: | ----------------: | -----------------------------: | -------------------------------: | ---------------------------: | ------------------------------------- |
| `20645 / 3kjwqk`   | `114444`      |      210 |               210 |                              0 |                                0 |                            0 | Zero eligible offers                  |
| `2192 / pz91qe`    | `114458`      |      639 |               637 |                              7 |                                0 |                            7 | Eligible offers with actual additions |

All 849 returned rows had explicit numeric stock greater than zero. The 2192 enumeration contained two repeated identities with identical price, discount, percentage, and stock; neither repeat inflated qualifying counts. No repeated complete page, conflicting repeated monetary/stock observation, changing reported count, ownership mismatch, document-ID mismatch, or amount/percentage disagreement above 0.1 percentage point was observed. Sources: [`20645 / 3kjwqk`](https://svc.snapp.market/express-search/product-list/20645/vendor/3kjwqk), [`2192 / pz91qe`](https://svc.snapp.market/express-search/product-list/2192/vendor/pz91qe).

Excluded offers, counted once per unique product/vendor identity:

| Concrete reason                                                                 | `20645 / 3kjwqk` | `2192 / pz91qe` |
| ------------------------------------------------------------------------------- | ---------------: | --------------: |
| `discountRatio < 40`                                                            |              210 |             630 |
| Missing or nonpositive stock among otherwise qualifying rows                    |                0 |               0 |
| Invalid money or amount/percentage disagreement among otherwise qualifying rows |                0 |               0 |
| Vendor/document identity mismatch among otherwise qualifying rows               |                0 |               0 |
| Explicit conditional restriction on otherwise qualifying rows                   |       0 observed |      0 observed |

Thus 840 unique identities were excluded for a concrete threshold failure, and two duplicate source records were collapsed separately. Absence of observed restriction metadata does not establish guaranteed checkout applicability; that limitation is described below.

The seven additional identities, all owned by numeric vendor `114458`:

| Product ID | Discount | Stock | Raw price | Discount amount | Final price |
| ---------- | -------: | ----: | --------: | --------------: | ----------: |
| `9631264`  |      45% |    15 |    390000 |          175500 |      214500 |
| `5983470`  |      45% |    36 |    690000 |          310500 |      379500 |
| `9631293`  |      45% |    11 |    990000 |          445500 |      544500 |
| `9677321`  |      45% |     8 |    990000 |          445500 |      544500 |
| `9704355`  |      45% |    17 |    990000 |          445500 |      544500 |
| `5984388`  |      45% |    20 |    290000 |          130500 |      159500 |
| `15104492` |      40% |    12 |     90000 |           36000 |       54000 |

Raw prices retain the existing collector's monetary units. Final price is `price - discount`; no second percentage discount is applied. Three matching baseline identities had the same undiscounted price in both feeds, supporting use of the existing currency handling. Sources: the paired Market Party response and [`2192 / pz91qe`](https://svc.snapp.market/express-search/product-list/2192/vendor/pz91qe).

### Raw overlap is not qualifying overlap

Three baseline identities appeared in campaign rows **below** the threshold. They are not qualifying campaign overlaps and must not erase eligible Market Party offers:

| Product / numeric vendor | Market Party discount | Campaign discount | Same raw price | Same stock |
| ------------------------ | --------------------: | ----------------: | -------------: | ---------: |
| `9773161 / 114458`       |                   40% |               35% |         306000 |          7 |
| `4076687 / 114444`       |                   40% |               10% |          95000 |         26 |
| `4076973 / 114444`       |                   40% |               10% |          95000 |         65 |

Merge **eligible** offers by product ID plus numeric vendor ID, preserve their source provenance, and retain a coherent monetary/stock tuple when selecting between observations. Do not mix one feed's discount with another feed's price or treat a below-threshold campaign row as evidence of disappearance. Sources: the paired Market Party and store-specific product responses.

## Dynamic discovery and ownership

Both store-home requests succeeded using `variable={vendorCode}` plus common PWA and selected-location parameters. Homes have **root-level** `vendorInfo` and `sections`, separate from the product response's nested `data`. Sources: [`3kjwqk home`](https://svc.snapp.market/express-home/vendor/3kjwqk), [`pz91qe home`](https://svc.snapp.market/express-home/vendor/pz91qe).

| Store    | Discovered matching home section title, trimmed | Discovered ID | Home numeric ID | Delivery ownership                                               |
| -------- | ----------------------------------------------- | ------------: | --------------: | ---------------------------------------------------------------- |
| `3kjwqk` | `حراج روز پرتخفیف`                              |         20645 |          114444 | `deliveryData.id` and `deliveryData.detail.vendorId` both 114444 |
| `pz91qe` | `اسمارت بازار`                                  |          2192 |          114458 | `deliveryData.id` and `deliveryData.detail.vendorId` both 114458 |

Both homes reported `status="ACTIVE"`, `isOpen=true`, `isOutOfArea=false`, and `deliveryData.doesDeliver=true`. Each product row's `vendor_id` matched its store's numeric home owner. Every `document_id` matched `${id}-${vendor_id}`. These observations resolve numeric ownership for these store-specific routes; they do not resolve or admit the earlier cross-store campaign with conflicting identities. Sources: the two home responses and corresponding product-list responses.

Home `product-list` sections contained `{config:null,type:"product-list",value:<positive integer>,title:<string>,collection_type:"default"}`. They contained **no count or pagination fields**. The observed ordered collection IDs were:

- `3kjwqk`: 21115, 21000, 20645, 20064, 21172, 21149, 21150, 21151, 21171, 20174.
- `pz91qe`: 21115, 20853, 2192, 21172, 20169, 1810, 15604, 21182, 20171, 21171.

The initial implementation matched the unique ordinary sale section by the evidenced home title within each verified vendor cohort, then read its current numeric `value`. **That selection mechanism has been superseded by dynamic nearby-store and section discovery.** Neither observed home had another matching sale title, but a title is not evidence of stock, ownership, prices, delivery, eligibility, or complete pagination. Other home collections have not been admitted by the original two-case investigation. Sources: the two home responses.

The home section's title and product response's title need not be identical. A separate anonymous one-row metadata check of 2192 returned `data:{id:2192,title:" حراج روز اسمارت ",count:639,type:"default",finalResult:[...]}`, whereas its home section was titled `اسمارت بازار`. Validate numeric collection identity and the endpoint schema; do not require these titles to match. Source: [`2192 / pz91qe`](https://svc.snapp.market/express-search/product-list/2192/vendor/pz91qe), one additional metadata request outside the paired 16-request window.

## Product contract, conditions, and stock

Select rows with `type="PRODUCT"` from `data.finalResult[]` and inspect their nested `data`. Observed fields included `id`, `vendor_id`, `document_id`, `price`, `discount`, `discountRatio`, `stock`, `title`, `images[].main`, `menu_category_title`, `root_category_title`, `badges`, and `sub_vendor_id:null`. **There was no nested vendor object and no `no_stock` or `is_out_of_stock` field** in these rows. Positive numeric stock is direct stock evidence for this route. Honor an explicit out-of-stock flag if a future response supplies one; requiring a currently absent flag to equal `false` would incorrectly exclude all seven candidates. Sources: both product-list responses.

The seven candidates exposed ordinary inline amount discounts to the guest session, with positive stock, consistent numeric owners, delivery confirmation, matching amount-derived percentages, and no explicit product/campaign restriction in the observed payload. This supports collection through Better Buy's existing ordinary offer eligibility rules. It does not prove account-specific checkout terms or a perpetual unconditional price.

Both homes had `vendorInfo.is_pro=true`, and their delivery methods included `is_pro` flags. Those fields describe stores or delivery methods, not a product-discount requirement. Home sections had `config:null` and `collection_type:"default"`; the qualifying product badge arrays were empty. Neither store/delivery Pro flags nor empty product badge arrays should be converted into invented discount eligibility rules. Preserve relevant explicit conditions when present and distinguish unknown checkout conditions from direct stock/price evidence. Source: [the guide's ownership and applicability notes](snapp-market-discount-api-guide.md#ownership-and-delivery-checks), corroborated by the two home and product responses.

## Pagination and measured collection work

Requests used the existing collector's PWA app version `1.403.1`, one device UUID and guest bearer, and:

```text
GET /express-search/product-list/{discoveredCollectionId}/vendor/{verifiedVendorCode}
variable={discoveredCollectionId}
secondVariable={verifiedVendorCode}
filters=[]
page={zeroBasedPage}
page_size=100
+ common PWA and the same selected-location parameters
```

| Scope            | Returned rows by page, including terminal | Product requests | Home + product elapsed time |
| ---------------- | ----------------------------------------- | ---------------: | --------------------------: |
| `20645 / 3kjwqk` | 100, 100, 10, 0                           |                4 |                      449 ms |
| `2192 / pz91qe`  | 100, 100, 100, 100, 100, 100, 39, 0       |                8 |                      901 ms |

All pages reported a stable count, each traversal reached an empty terminal, and raw returned totals equalled the corresponding reported counts. Unique totals are tracked separately because the second feed repeated two identical identities. Actual returned sizes, rather than requested size alone, support the observed offset behavior. Sources: both traversed product-list responses.

The paired work took **1,831 ms and 16 provider requests**: one public guest-token POST, one Market Party GET, two store-home GETs, and twelve store-specific product-list GETs. The separate metadata check added one anonymous GET taking 167 ms. No account-plan request was made. The observed ordinary run fits the existing 22-second collection budget with substantial headroom; this is a latency observation, not a guarantee under retries or upstream delays. Keep independent request, page, row, body, and whole-scan bounds, and fail admitted incomplete traversals explicitly.

Home discovery supplies no count, so a bounded cached first-page planning probe may establish whether a collection fits the server's admission bounds. Freeze the admitted manifest before traversing subsequent pages, reuse that first page, and do not append discoveries after freezing. A proposed narrow maximum of two admitted store collections, 700 reported rows per collection, and eight pages per collection including empty terminal covers these two observed contracts. Growth, page-size changes, replay, conflicting duplicates, owner changes, or absence of terminal confirmation require explicit handling rather than claiming complete coverage.

## Integration scope and evidence limits

The original two-case verification supports those observed numeric store owners and ordinary sale sections, with the unchanged threshold and existing eligibility rules. It does not establish a production vendor allowlist or verify all collections on each home, account-plan capabilities, or checkout. Existing rejected cross-store adapters remain gated. Feature-flag rollback and integration regression checks are implementation work handled separately from this read-only probe.

The initial guide observed one and eighteen duplicate identities in the respective enumerations; this fresh window observed zero and two. That difference reinforces why counts and duplicate positions are changing observations. Do not hardcode either observation into production discovery or permanent regression expectations.

Primary evidence was captured by direct requests to Snapp's first-party service. Private sanitized working records are stored under `.data/s05/store-specific-live.json` and `.data/s05/store-specific-metadata.json`; the provider URLs above intentionally omit selected-location and session query data.

## Integrated collector check

The first live run of the integrated collector, at 13:44:17 UTC, exposed an exact schema issue: unrelated home sections such as `coupon`, `favorites`, `market-party`, and `category` have `collection_type:null`. A schema that requires every optional `collection_type` to be a string rejects the entire otherwise valid home, yielding `HOME_SCHEMA` omissions for both stores and an empty frozen campaign manifest. That run made four requests in 650 ms and correctly returned the baseline 62 offers, but did not establish enrichment. The smallest remaining check was to allow the observed null metadata on unrelated sections, retain strict `collection_type="default"` selection for admitted product-list sections, and rerun the bounded integrated collector. No account-plan or checkout check was implicated.

### Successful integrated rerun

After correcting that observed null metadata contract, the actual integrated collector passed a fresh live run from **13:45:54.582 UTC to 13:45:56.591 UTC**, taking **2,008 ms and 16 physical provider requests**. Its own same-run comparison returned **62 baseline eligible offers and 69 enriched eligible offers**. All 69 returned product/numeric-vendor identities were distinct, and the seven additions retained `snapp:store_campaign:114458:2192` provenance. The existing Market Party offers retained `snapp:market_party` provenance. Source: the integrated collector result and its direct first-party responses, captured privately in `.data/s05/store-integrated-live.json`.

| Store / dynamically discovered collection | Reported / raw rows | Unique identities | Exact duplicates | Page sizes, including terminal      | Qualifying | Qualifying baseline overlap | Actual additions | Excluded reason       |
| ----------------------------------------- | ------------------: | ----------------: | ---------------: | ----------------------------------- | ---------: | --------------------------: | ---------------: | --------------------- |
| `3kjwqk / 20645`                          |           216 / 216 |               214 |                2 | 100, 100, 16, 0                     |          0 |                           0 |                0 | 214 `BELOW_THRESHOLD` |
| `pz91qe / 2192`                           |           637 / 637 |               621 |               16 | 100, 100, 100, 100, 100, 100, 37, 0 |          7 |                           0 |                7 | 614 `BELOW_THRESHOLD` |

These newly changed raw and unique totals are separate from the 13:35 research window above. The implementation traversed the current counts to terminal, collapsed 18 exact repeated records, and excluded 828 unique identities for the unchanged threshold. It reported no omitted stores, ownership failures, price failures, replayed pages, conflicting repeats, or incomplete coverage. Sources: [`20645 / 3kjwqk`](https://svc.snapp.market/express-search/product-list/20645/vendor/3kjwqk), [`2192 / pz91qe`](https://svc.snapp.market/express-search/product-list/2192/vendor/pz91qe), as collected by the integrated collector in this window.

The manifest callback ran exactly once, after request five at 533 ms, containing the two numeric store/collection scopes discovered from their home sections. The subsequent Market Party request was request six; every campaign page after page zero followed the callback. Each bounded first-page planning response was fetched once and reused for enumeration. Therefore the admitted scope was frozen before Market Party collection and before subsequent campaign pages, with no post-freeze discoveries appended.

The three below-threshold campaign observations listed above did not erase their qualifying baseline counterparts: the returned offers for products `9773161`, `4076687`, and `4076973` retained their complete Market Party price/discount/stock tuples and 40% discounts. No rejected cross-store campaign endpoint, category endpoint, customer login, account-plan endpoint, or D1 write was involved in this successful live collector check. Regression and application persistence checks remain separate implementation validation.

## Dynamic nearby-vendor discovery contract

A single subsequent anonymous read-only GET verified the location-scoped discovery contract. It returned HTTP 200 in 202 ms using the same configured location and:

```text
GET /express-vendor/general/vendors-list
sort=lowest_delivery_price
page=0
page_size=20
is_home=false
page_type=vendor_list
extra-filter[vendor_collection]=-1
+ common PWA and selected-location lat/long parameters
```

The root response was `{status:true,data:{count:36,open_count:36,finalResult:[...],sections:[...],sorts:[...],single_super_mall:{...}}}`. `data.finalResult` contained 20 rows, all `{type:"VENDOR",data:{id:<numeric ID>,code:<six-character vendor code>,title:<string>,status:"ACTIVE",isOpen:true,...}}`. The first row happened to be `pz91qe / 114458`; the sixth happened to be `3kjwqk / 114444`. Those positions and identities are observations, not production constants. Source: [`nearby vendors-list`](https://svc.snapp.market/express-vendor/general/vendors-list), sanitized evidence `.data/s05/dynamic-vendor-discovery.json`.

The discovery page's 20 rows do not exhaust its reported 36 nearby vendors. A bounded discovery prefix is therefore a scope choice, not proof of complete nearby-store coverage. Store codes are `data.code`; numeric IDs are `data.id`. Corroborate those identities against root `vendorInfo.code`, `vendorInfo.id`, and delivery ownership before accepting campaign rows. Discovery `is_market_party:false` appeared even for stores in the current Market Party baseline and must not be used to exclude their campaign discovery. Discovery-level `is_pro`, coupon, delivery fee, or other store metadata is not a product-discount condition. Source: the discovery response, plus the previously verified two root home schemas.

This contract check made no campaign requests and did not conduct another broad campaign survey. A subsequent bounded integrated collector run is required to verify the new dynamic selection mechanism and its actual baseline/enriched comparison.

### Initial dynamic collector field check

The first dynamically selected integrated run, from 13:59:38.618 to 13:59:40.266 UTC, discovered nearby codes, validated their homes, and admitted two current sections from the first nearby store: `1810 / pz91qe` and `2192 / pz91qe`. No fixed researched store or collection ID was needed. The callback froze those two scopes after request 14; the baseline was fetched next. The run made 15 requests in 1,645 ms, then explicitly failed at `product.discountRatio` before returning an enriched result.

A single bounded follow-up read of the admitted 1810 first page established the exact behavior: `data.count=46` and all 46 rows fit on page zero, but 34 products had `discountRatio:null` with explicit `discount:0`, positive numeric prices, positive stock, and consistent owner/document identity. Example: product `5222075`, vendor `114458`, document `5222075-114458`, price `140625`, discount `0`, stock `49`. Those rows are not evidence of a qualifying discount. The smallest remaining implementation check is to report their missing percentage as a concrete excluded-offer reason while preserving identity/ownership failures and terminal coverage checks; never lower the threshold or invent a qualifying percentage. Source: [`1810 / pz91qe`](https://svc.snapp.market/express-search/product-list/1810/vendor/pz91qe), sanitized `.data/s05/dynamic-1810-field-check.json`.

### Successful dynamic integrated run

The subsequent dynamic collector passed from **14:01:08.752 UTC to 14:01:10.933 UTC**, taking **2,179 ms and 23 physical requests**, within the configured 40-request and 20-second bounds. Its same-run diagnostics returned **62 baseline qualifying offers, 69 enriched qualifying offers, zero qualifying overlaps, and seven actual additional offers**. All 69 returned product/numeric-vendor identities were unique. Source: the actual integrated collector result, privately captured in `.data/s05/store-integrated-live.json`, and the directly collected first-party responses.

| Dynamically admitted scope | Raw / reported rows | Unique identities | Duplicate rows | Pages including empty terminal      | Qualifying | Baseline qualifying overlap | Actual additions | Concrete excluded reason |
| -------------------------- | ------------------: | ----------------: | -------------: | ----------------------------------- | ---------: | --------------------------: | ---------------: | ------------------------ |
| `1810 / pz91qe / 114458`   |             46 / 46 |                46 |              0 | 46, 0                               |          0 |                           0 |                0 | 46 `BELOW_THRESHOLD`     |
| `2192 / pz91qe / 114458`   |           635 / 635 |               621 |             14 | 100, 100, 100, 100, 100, 100, 35, 0 |          7 |                           0 |                7 | 614 `BELOW_THRESHOLD`    |

The percentage contract now accepts the observed null only when the explicit discount amount is zero: zero divided by the positive price is zero percent. Those rows remain below 40%; a null percentage accompanying a positive discount amount remains an explicit contract failure. Thus the first dynamically admitted section is a valid **zero-eligible** collection, not a failed collection or a collection whose eligible offers were all duplicates. Sources: the implementation's normalization and [`1810 / pz91qe`](https://svc.snapp.market/express-search/product-list/1810/vendor/pz91qe).

Selection used the first current nearby vendor response, the home owner's identity/delivery checks, and the current numeric section IDs sorted deterministically. No researched store ID, store code, collection ID, Persian campaign title, or exactly-one-section requirement was present in the production adapter. The first two supported sections happened to come from the same discovered nearby store; the supplied `20645 / 3kjwqk` case was omitted under the supplementary scope limit in this run. Its earlier zero-offer result remains historical evidence, not a production selector.

The manifest callback fired exactly once after request 14 at 1,212 ms, before the baseline request and all subsequent collection pages. Both first planning pages were reused. Each admitted collection reached its empty terminal with stable counts and complete raw totals; duplicate observations did not inflate offer counts. There was no ownership conflict, replay, conflicting repeated tuple, unresolved field failure, or admitted partial result.

Discovery remained explicitly bounded rather than claiming whole-area coverage. Diagnostics reported one first-20-nearby-page limitation, 90 unsupported non-product section entries, 96 collections omitted because the two-collection scope was already filled, and ten store homes omitted by the discovery request budget. These are scope/metadata omissions, separate from the 660 unique product offers excluded for being below the threshold. The run requested no rejected cross-store campaign route, customer account operation, account-plan endpoint, or D1 write.
