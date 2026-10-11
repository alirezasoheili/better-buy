# Better Buy: location-scoped Hyperstar discovery and discounts

Research date: 11 October 2026. This is a follow-up to the completed local expansion, not a restart of S01–S11. No application source, deployment, account, or feature flag was changed.

## Decision

Extend the existing dynamic store-discovery adapter to consume **the separate `data.single_super_mall` branch hint**, in addition to ordinary `data.finalResult` vendor rows. Resolve the hinted code through the existing location-scoped store-home validation and then feed that store into discount discovery.

This is a concrete, source-backed candidate fix. It is **not yet live-verified against the user's Hyperstar Eram 2 branch**, because the API host returned gateway errors during this research. It is also not proof that the current Better Buy implementation drops this field: the current completion commit was not available for inspection here. Check its response schema and discovery code before changing it.

“Every location” should mean: discover the Hyperstar/super-mall branch Snapp currently associates with that selected location, if one is offered and deliverable. It does not mean making a fixed Eram branch deliver outside Snapp's service area or proving that one hint enumerates every Hyperstar branch in Iran.

## What was actually observed

| Evidence                                                                                    | Result                                                                                        | Limit                                                                                                                                         |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct GET of the user-supplied Snapp store page                                            | HTTP 200, 139,260-byte application shell; the route ends in `09egqy`                          | The shell contains neither vendor identity nor product catalog; the name in the URL alone is not a verified API owner                         |
| Current page script references                                                              | 16 scripts on `static.snapp.express`, release path `renaissance/ui/12c11a96`                  | Script downloads returned HTTP 502; request-building code could not be inspected                                                              |
| Nearby-vendors API, guest token API, `09egqy` store-home API, discounted product-list probe | HTTP 502 responses, including “Connection refused”                                            | No current branch mapping, delivery check, stock/discount total, or pagination proof obtained; this does not establish an outage for the user |
| Captured upstream `market_stores.json` fixture in public `sepehr071/snapp-mcp` source       | `data.single_super_mall` points to Hyperstar while its code is absent from `data.finalResult` | Saved fixture, not a live response today; its normal list is a sample, not a complete city census                                             |
| Local reproduction against that fixture                                                     | Three ordinary candidate codes become four when the super-mall hint is merged                 | Verifies extraction behavior only, not delivery or production integration                                                                     |
| Captured product-search fixture in the same repository                                      | Contains the same hinted Hyperstar code, concrete numeric owner and stock-backed products     | Demonstrates another captured representation, not today's prices or the user's branch                                                         |

No qualifying offer count is claimed for `09egqy`. The known seven S05 additions from the earlier store-specific campaign comparison must not be reused as a Hyperstar result.

## Concrete discovery evidence

Primary source for the captured response:

- [market_stores.json](https://github.com/sepehr071/snapp-mcp/blob/main/tests/fixtures/market_stores.json), file SHA `fa62c8e6ef2f44ebd9310be31eec9c5e7527ba75`.
- [market.py](https://github.com/sepehr071/snapp-mcp/blob/main/src/snapp_mcp/market.py), source inspected through the GitHub connector. Its store-list method reads ordinary rows but does not propagate the separate hint.
- [market_search.json](https://github.com/sepehr071/snapp-mcp/blob/main/tests/fixtures/market_search.json), file SHA `7981d1aa12aaf3f808586e5733f7665ec68b7cdc`.
- [test_market.py](https://github.com/sepehr071/snapp-mcp/blob/main/tests/test_market.py), file SHA `59eb642ea78dd9cd79502a9d0df12427a53f7c83`; uses test location `35.773643, 51.418311` with these fixtures. A mocked test's coordinates do not independently prove where the raw fixture was captured.
- [Original research notes](https://github.com/erfnzdeh/snapp-hack/blob/main/README.md), section on Market vendors, separately describes `single_super_mall` and a `super_mall` vendor-list section. These are the author's inferred contracts, not official API documentation.

The relevant saved response fragment is:

```json
{
  "data": {
    "finalResult": [
      { "type": "VENDOR", "data": { "code": "097o9d" } },
      { "type": "VENDOR", "data": { "code": "0wq22z" } },
      { "type": "VENDOR", "data": { "code": "0njw2v" } }
    ],
    "single_super_mall": {
      "code": "0gkdjr",
      "title": "هایپراستار باکری ۲ (همواره تخفیف)"
    }
  }
}
```

These are fixture identifiers only. Neither `09egqy` nor `0gkdjr` should be the production default for all locations.

In the saved search fixture, `0gkdjr` has numeric vendor ID `117173`, `is_express=false`, reported `deliveryTime=180`, and a `scheduleOption`. Its products have matching `vendor_id`/`document_id` and positive stock. One sampled milk product has only 20% discount. This supports a scheduled-delivery representation but does **not** prove high discounts or current availability. Store type in that search representation is generic supermarket metadata; do not require a guessed `HYPERSTORE` enum to accept a hinted store.

## Runtime flow

1. Call the existing nearby-store API with the user's selected coordinates and existing PWA query construction:

   ```text
   GET /express-vendor/general/vendors-list
   lat={selected latitude}&long={selected longitude}
   sort=lowest_delivery_price&page=0&page_size={bounded size}
   is_home=false&page_type=vendor_list
   extra-filter[vendor_collection]=-1
   ```

   This request family was live-verified in the earlier API guide. Today's attempts failed. Reuse existing successful location-parameter normalization; do not change all routes to a different coordinate spelling based on secondary notes.

2. Build a deduplicated set of candidate codes from ordinary `VENDOR` rows **plus** a valid optional `data.single_super_mall.code`. Preserve the hint's source and title as metadata. The hint may contain no numeric ID; do not fabricate one or require it at this stage. Ensure response validation does not strip the field before discovery reads it.

3. Resolve each candidate through:

   ```text
   GET /express-home/vendor/{vendorCode}
   variable={vendorCode}
   + the same selected-location context and existing guest access
   ```

   Read root-level `vendorInfo` and `sections`. Derive the numeric vendor ID from the home response. Validate returned code, product ownership and reported delivery. Contradictory owner IDs are an error. A hint alone is not proof of delivery.

4. Check scheduled-delivery representations. A saved store-home fixture in this source has `deliveryData` without `detail.vendorId`; requiring that nested detail universally can reject an otherwise parseable home response. Inspect actual Hyperstar responses before adjusting the schema. Validate owner fields when supplied and reject conflicts; do not invent missing owner values. Distinguish out-of-area, closed, unavailable delivery slot and unknown/error states using actual fields. Do not infer delivery from distance or `isOpen` alone.

5. Enumerate supported ordinary collections from that store's home sections and scan them through the existing store-specific adapter:

   ```text
   GET /express-search/product-list/{collectionId}/vendor/{vendorCode}
   variable={collectionId}&secondVariable={vendorCode}
   filters=[]&page={page}&page_size={requested size}
   ```

   The earlier two ordinary-store samples honored 100-row pages. That is not proof Hyperstar does. Measure the actual returned size, pagination metadata, terminal behavior and replay/conflict handling for its own response.

6. Campaign collections may cover only part of the catalog. To fetch additional ordinary discounts, use the existing store-category paths as a bounded fallback:

   ```text
   GET /mobile/search/categories?vendorCode={resolved code}

   GET /express-search/product-list/vendor
   vendor_code={resolved code}&category_id={discovered category ID}
   filters=["has_discount"]&page={page}&pageSize={requested size}
   ```

   These contracts were live-tested for ordinary stores in the earlier guide; **Hyperstar-specific applicability remains to be checked**. Category IDs must be discovered. Keep traversal internal to the backend. Validate that filtering really restricts results and that page-size/terminal behavior is honored rather than trusting a requested parameter.

7. Normalize through the existing price-unit, stock, ordinary benefit, threshold and provenance pipeline. Merge by product ID plus resolved numeric store ID. Coupons, first-order offers, Pro-only benefits and delivery discounts must not be added to ordinary product discounts to inflate the percentage.

8. Keep the automatic feed and 40% default. Surface accurate store delivery information using the existing comparison UI. If no branch is available, do not substitute another location or cache another area's delivery decision.

The named `super_mall` vendor-list section is a possible supplemental discovery path. Its precise wire parameters were not verified here. Follow actual returned action metadata or the frontend's observed request; do not guess `vendor_collection` values or advertise an untested filter URL as working.

## Budget and coverage

Reuse the existing scan budget, cache and durable execution boundaries. Do not introduce a new infrastructure layer solely for this discovery fix.

Adding a branch hint usually adds a candidate to a discovery response already fetched; store-home and catalog requests still consume budget. Give the hinted store a bounded chance to be scanned rather than leaving it permanently behind dozens of ordinary stores. Do not remove global request/retry accounting.

Review any 700-row/eight-page admission rule retained from the initial campaign samples. Those sample sizes were not universal catalog contracts. If a Hyperstar collection is larger, rejecting the entire store on count alone may hide usable offers. Fetch a bounded subset with explicit partial coverage where the existing pipeline supports it; never mark that subset as complete or infer offer disappearance from it. Measure the actual incremental work and qualifying additions before changing budgets.

Cache discovered branch hints by location and freshness context. A cached code is a candidate, not a persistent authorization to deliver; refresh delivery for the current selected location. Do not globally cache one Eram branch as the answer for every user.

## Smallest implementation handoff

Continue from the current completed expansion branch. Inspect whether its vendor-list schema and candidate extractor already consume `data.single_super_mall`. If they do, diagnose the existing omission reason rather than duplicating discovery.

If absent, extend that schema and merge the hint into the candidate code set, deduplicating with ordinary rows. Resolve the home dynamically, then reuse existing campaign/catalog adapters. Keep researched branch codes in fixtures only. Preserve the one automatic feed, 40% default, local work and rollback behavior.

Add meaningful regressions for:

- A super-mall hint present only outside `finalResult`.
- The same hinted code also present in ordinary rows, producing one candidate.
- Missing/null/malformed hints without breaking ordinary discovery.
- Different branch hints at different location contexts, without cross-location reuse.
- Optional scheduled-delivery fields, contradictory owners, and unavailable delivery.
- Large collections and exhausted budgets producing accurate partial coverage.
- The same product/store offer in both a campaign and catalog source, counted once.

Live acceptance should compare the same selected location, threshold and scan window:

1. Capture nearby vendors and any super-mall hint.
2. Resolve the code to numeric identity and delivery state.
3. Fetch one discovered campaign or discounted category and verify stock/prices/ownership.
4. Measure baseline qualifying offers, Hyperstar candidates, overlap and actual additions.
5. Repeat at a second location and one out-of-area/control location. Treat gateway errors as unknown, not “no Hyperstar here.”

Document terminal pagination, request count, elapsed time and exclusions. If the code path is proven but no >=40% offers exist at the time, that is a legitimate zero result, not a reason to lower the threshold. No deployment is authorized by this research handoff.

## Remaining live questions

- Does the current Snapp response still expose `single_super_mall` at the user's chosen location?
- Is `09egqy` the branch returned there, and what numeric owner does its home resolve to?
- Which branches are returned at other locations, and what delivery modes are applicable?
- Do those homes expose ordinary campaign collections, and what is the full Hyperstar catalog discount-filter contract?
- Does the completed Better Buy branch already parse the hint or reject the store later for schema, delivery, collection size or budget reasons?
- How many >=40% offers are truly additional to the existing enriched feed?

Today's environment could not answer these live questions. The independently reproduced hint-extraction gap is still actionable, with the above verification steps kept explicit.
