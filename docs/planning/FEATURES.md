# Feature Plan

This backlog describes user-visible behavior. Priority is based on correctness and the manual grocery-shopping workflow, not implementation convenience.

## Delivery snapshot

F-001 through F-006 have implementation slices in the workspace: Jet is hidden but historical data remains readable; token actions and scan context are synchronized; grouped products use a versioned read projection; Tehran validation is authoritative; and address search is proxied through an optional Worker geocoder. Location deletion now removes the location's dependent scans and deals in the same D1 batch. These changes are not deployed until the release gates in `README.md` and `PRODUCTION_READINESS.md` pass.

## F-001 — Provider availability and temporary Jet removal

Priority: P0. Phase: 1.

Decision: Digikala Jet is temporarily unavailable for new activity. Keep collector, storage, and historical data intact so it can be restored later.

Behavior:

- Visible providers are controlled from one provider registry/capability definition.
- Jet does not appear in source selection or connection settings.
- The dashboard does not request Jet connection status during normal loading.
- Historical Jet scans remain readable and retain correct money formatting.
- Retry on a Jet history record is replaced by “temporarily unavailable.”
- The Worker rejects attempts to create new Jet scans while hidden; UI hiding is not the security boundary.

Acceptance criteria:

- No new-scan or settings path exposes Jet.
- Existing Jet history opens without data loss.
- A crafted `POST /api/scans` request for Jet receives a stable provider-unavailable error.
- Restoring Jet requires changing one capability definition plus its tests, not scattered conditionals.

## F-002 — Credential-aware scan action

Priority: P0. Phase: 1.

Create one derived state for each visible provider:

- `loading`: status is unresolved; action is temporarily unavailable with an explanation.
- `ready`: action starts a scan.
- `missing`: action says “تنظیم اتصال” and opens that provider’s settings.
- `expired`: action says “تمدید اتصال” and opens that provider’s settings.
- `rejected`: an upstream authentication failure marks the connection unusable and offers renewal.
- `scanning`: action shows progress and prevents duplicate submission.

Desktop and mobile must consume the same state and action. A credential problem must never produce a permanently disabled orange button.

Acceptance criteria:

- Missing, expired, and rejected states route to the correct provider settings.
- A location problem is distinguished from a credential problem.
- Empty states and scan-strip messaging use the active provider, not SnappMarket unconditionally.
- `AUTH_REJECTED` never receives transient retry treatment and produces a renewal CTA.

## F-003 — Context-correct results

Priority: P0. Phase: 1.

The result ledger is a view of an explicit scan context: user, location, provider, threshold, mode where relevant, scan ID, and completion time.

Behavior:

- Initial load chooses a location/provider, then loads that context’s latest successful scan.
- Changing location or provider either loads matching results or clears the ledger into a no-scan state.
- Results retain their own location/provider/threshold labels and are never relabeled by current form controls.
- History opening deliberately switches the visible context to that scan.

Acceptance criteria:

- Rapid location/provider switching cannot show stale mislabeled deals.
- Out-of-order requests cannot overwrite the newest selection.
- Tests cover initial load, no matching scan, switching, history opening, and an in-flight request race.

## F-004 — Grouped products with vendor chips

Priority: P1. Phase: 2.

### Data rule

Persist every vendor offer independently. Grouping is a versioned read projection, not destructive storage deduplication.

Recommended contracts:

```ts
interface VendorOfferRecord {
  offerKey: string;
  productVariationId: string;
  vendorId: string;
  vendorTitle: string;
  vendorCode: string | null;
  stock: number;
  state: DealState;
}

interface DealGroupRecord {
  key: string;
  groupKeyVersion: 1;
  scanId: string;
  title: string;
  image: string | null;
  categoryTitle: string | null;
  priceRials: number;
  discountRials: number;
  finalPriceRials: number;
  discountRatio: number;
  state: DealState;
  vendors: VendorOfferRecord[];
}
```

### Conservative grouping v1

Group only within the same scan/provider when these facts match:

- Verified stable product identity, preferably provider plus `productVariationId` after data profiling.
- Normalized title: Unicode NFKC, Arabic/Persian ی/ک normalization, trimmed and collapsed whitespace.
- Canonicalized image URL.
- Category when present.
- Original price, discount amount, final price, and discount ratio exactly.

Vendor identity and stock do not participate in grouping. Do not use fuzzy title matching in v1 because package size, flavor, and weight can be subtle.

### History rule

- Continue comparing vendor-specific offer keys across scans.
- A current group is `still_available` if any current member existed previously.
- A current group is `new` only if all current members are new.
- Removing one vendor does not make the whole group disappear while another vendor still offers it.
- Keep price out of temporal product identity so a price change does not create a false new/disappeared pair.

### UI behavior

- Render one shelf row per group.
- Render unique vendor chips below product identity; include vendor name and stock where useful.
- Chip collections wrap; define a compact expansion pattern for 10+ vendors.
- Vendor search/filter matches a group if any member matches and highlights the matching chip.
- Sort uses group facts and a stable key tie-breaker.
- Label UI totals as unique products. Keep raw offer count separately for auditability.

Acceptance criteria:

- Three identical offers from three vendors render one row and three chips.
- Stock differences alone do not split a group.
- Price, discount, title, product, meaningful image, or category differences do split groups.
- Duplicate offers from one vendor do not duplicate chips.
- Mixed new/still/disappeared vendor membership produces correct group and chip states.
- Historical scans work without a destructive backfill.

## F-005 — Tehran-only locations

Priority: P0 safety constraint. Phase: 1 foundation, Phase 3 experience.

Behavior:

- Store a single versioned Tehran boundary definition in the shared domain package.
- Frontend provides immediate feedback; Worker validation is authoritative.
- Create, merged PATCH updates, and scan start all reject outside-Tehran coordinates.
- Existing invalid locations are flagged for correction and cannot start new scans.
- The map is constrained visually, but visual bounds are not treated as enforcement.

Acceptance criteria:

- Boundary interior, exterior, edge, invalid number, and partial PATCH cases are tested.
- Direct API requests cannot bypass the restriction.
- The user receives a stable `OUTSIDE_TEHRAN` error with actionable Persian copy.

## F-006 — Address search and map confirmation

Priority: P1. Phase: 3.

Behavior:

- Search Tehran neighborhood, street, landmark, or address through a Worker-owned geocoder abstraction.
- Use a prominent draggable pin and a visible Tehran boundary.
- Reverse-geocode a selected point and show a human-readable confirmation.
- Offer optional browser geolocation with permission explanation.
- Keep manual map selection when search or tiles fail.
- Move raw coordinates into an advanced section.
- Confirm that deleting a location also removes its history, and defer deletion while that location has an active scan.

Provider constraints:

- Do not call a public geocoder directly from React.
- Make endpoints/configuration switchable, with caching, rate limiting, timeout, and attribution.
- Public Nominatim is unsuitable for client-side autocomplete; if used for a private MVP, use explicit server-side search and comply with its current policy.

Acceptance criteria:

- Search and manual selection work on desktop and mobile.
- Outside-city results cannot be selected.
- Stale search responses cannot replace newer results.
- Map/search failure does not block manual completion.
- Exact coordinates and address queries are absent from logs.

## F-007 — Scan observability and recovery

Priority: P1. Phase: 4.

Behavior:

- Track sanitized scan lifecycle events: queued, running, succeeded, failed, interrupted, provider rejected, and duration.
- Never log token, OTP, address, exact coordinates, or raw upstream body.
- Expose a minimal unauthenticated liveness endpoint; keep user/storage diagnostics authenticated.
- Provide a retry/reconnect recovery action based on stable error codes.

Acceptance criteria:

- Dashboards show provider error rate and scan duration without personal data.
- Alerts detect elevated failures and stuck scans.
- An interrupted scan becomes a clear recoverable failure.
- Operations has a written provider-disable and rollback procedure.

## Deferred ideas

- Fuzzy cross-provider product matching.
- Scheduled scans and notifications.
- Purchasing/deep-link flows.
- City expansion beyond Tehran.
- Permanently removing Jet data or collector code.

Each deferred feature requires a separate product decision; it should not enter the current phases incidentally.
