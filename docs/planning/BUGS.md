# Bug and Risk Backlog

Priorities: P0 breaks product truth or a critical flow; P1 is production-significant; P2 is important polish/maintainability.

## Current resolution snapshot

- Resolved in this implementation loop: B-001, B-002, B-003, B-004, B-007, B-008, B-009, and B-010.
- Partially resolved: B-005 now has a database uniqueness guard and conflict response, but migration rehearsal is still required; B-015 has a prominent draggable map pin and bounds, while the full accessibility dialog work remains open.
- Still open: B-006, B-011–B-014, B-016–B-020, plus runtime/E2E coverage in B-012. Address search remains unavailable in production until a reviewed geocoder endpoint is configured.

## P0

### B-001 — Selected context can disagree with displayed scan

Evidence: dashboard initialization loads the latest successful scan globally, while selected location is chosen independently. Changing location/provider does not clear or reload deals.

Impact: the strip can say one location/provider while showing another scan’s results.

Fix direction: make scan context explicit and request matching latest results; guard out-of-order loads.

Regression tests: provider switch, location switch, no matching scan, history open, rapid switch race.

### B-002 — Credential-gated primary action (resolved)

Both active providers now scan without customer setup. Desktop/mobile use the same action and preserve location/exclusivity constraints.

### B-003 — Tehran-only policy is not enforced

Evidence: shared validation accepts global latitude/longitude, and create/update/scan routes use those values directly.

Impact: UI bounds can be bypassed and unsupported locations can be scanned.

Fix direction: versioned shared boundary plus authoritative route validation after PATCH merge.

## P1

### B-021 — Location deletion left history behind

Evidence: deletion previously refused locations referenced by scans, and did not define dependent-row cleanup.

Impact: users could not remove an obsolete location, while any future direct deletion risked orphaning its history.

Fix direction: delete deals, scans, and the location in one user-scoped D1 batch; keep the last-location guard and confirm the destructive action in the UI.

Regression tests: delete a location with scans/deals and verify another location's history is unchanged.

### B-022 — Address search has no production provider configured

Evidence: `GEOCODER_BASE_URL` is optional by design; the deployed Worker therefore returns `GEOCODER_UNAVAILABLE` (503).

Impact: address lookup cannot resolve a neighborhood or street until a provider is selected and configured.

Fix direction: select a provider with policy, SLA, rate, attribution, privacy, and cost review, then configure its endpoint (and secret if required) in the Worker environment.

### B-004 — Hidden magic location rows can corrupt visible location behavior

Evidence: `locations()` and `location()` hide a row by exact name/coordinate values, but count/delete logic still includes it. `ensureDefaultLocation()` is currently unused.

Impact: a legitimate matching row becomes invisible; “last location” checks can disagree with what the user sees.

Fix direction: data migration and explicit lifecycle flag/record handling; remove magic-value filters.

### B-005 — Active scan creation has a race

Evidence: active-scan lookup and scan insert are separate operations.

Impact: simultaneous requests can enqueue more than one scan for a user.

Fix direction: enforce exclusivity atomically through an appropriate D1 transaction/constraint or a per-user coordination primitive; add a concurrency test.

### B-006 — History comparison ignores scan mode

Evidence: previous scan matching uses user, location, threshold, and source, but not mode.

Impact: partial and full provider scans can make deals appear falsely new or disappeared.

Fix direction: include every scope dimension that changes collection coverage. Hidden Jet history remains read-only until this is resolved.

### B-007 — Initial dashboard load has one failure domain

Evidence: locations, all provider statuses, and scans load through one `Promise.all`.

Impact: a hidden or non-active provider endpoint failure can blank otherwise usable data.

Fix direction: load core context separately and isolate provider-specific failures.

### B-008 — Provider-incorrect empty-state access (resolved)

Both active providers expose credential-free access; copy identifies the selected provider.

### B-009 — Upstream access rejection recovery (resolved for active providers)

Okala public endpoint 401/403 produces UPSTREAM_FORBIDDEN and normal scan retry, without OTP or reconnect. Snapp retains bounded guest renewal and failed-scan feedback. Tests preserve the previous successful history.

### B-010 — Multi-tenant scan/location join is incomplete

Evidence: scan queries join locations by `location_id` without also joining `user_id`.

Impact: UUID collisions are unlikely, but tenant isolation should be guaranteed by the query, not probability.

Fix direction: join on both user and location keys and add tenant-isolation tests.

### B-011 — Long scans depend on request background lifetime

Evidence: collection, retry delays, many upstream pages, and D1 persistence run inside request `waitUntil`.

Impact: a long provider scan can be interrupted by platform execution limits and later marked stale.

Fix direction: measure real duration/page counts, then either prove the design within current limits or move scan execution to a durable job mechanism. Do not select infrastructure before measurement.

### B-012 — No web, shared-domain, route, or E2E regression tests

Evidence: web/shared Vitest report zero test files; Playwright has configuration but no specs.

Impact: primary UX and tenancy/location contracts can regress undetected.

Fix direction: add pure state tests, component tests, Worker/D1 integration tests, and targeted desktop/mobile E2E.

### B-013 — Scan endpoints need explicit abuse controls

Evidence: Better Auth has rate limiting, but custom scan endpoints have no documented per-user/IP throttling policy.

Impact: upstream abuse and unnecessary platform/provider load. Okala OTP/login/token-submission routes have been removed.

Fix direction: add endpoint-specific quotas, cooldown copy, structured rejection metrics, and tests.

### B-014 — Legacy credential encryption configuration is too permissive

Evidence: arbitrary `BOX_KEY` strings are padded/truncated into AES key material, with no version or rotation metadata.

Impact: weak configuration can silently become a weak at-rest key for legacy data; rotation can make it unreadable. Active Snapp/Okala scans do not read persisted customer credentials.

Fix direction: require strong encoded key material at startup, version ciphertext/key IDs, document rotation and recovery, and test corruption handling.

## P2

### B-015 — Map marker is easy to miss

Evidence: a small `CircleMarker` exists, but it has no pin shape, label, shadow, drag interaction, or address confirmation.

Impact: users perceive that the map has no marker.

Fix direction: verify runtime layers, then use a prominent pin/selection treatment and confirmation text.

### B-016 — Location dialog is not fully accessible

Evidence: no focus trap/restoration, Escape behavior, or accessible close label; map wrapper claims `role="application"` without a full keyboard model.

Fix direction: accessible dialog primitives and a complete non-map keyboard path.

### B-017 — Touch targets and filter semantics are incomplete

Evidence: several controls are below 44×44px; summary toggles do not expose `aria-pressed`; search uses placeholder without an accessible name.

Fix direction: accessible names, pressed semantics, and touch-target pass across breakpoints.

### B-018 — Tablet location editing disappears

Evidence: the compressed rail hides edit labels/control behavior at the tablet breakpoint.

Fix direction: retain an explicit reachable location-edit action at every breakpoint.

### B-019 — Build succeeds with CSS compatibility warnings

Evidence: Autoprefixer warns about `align-items: end` and `justify-content: start/end` compatibility.

Fix direction: use supported flex alignment equivalents where logical direction remains correct in RTL.

### B-020 — Monolithic frontend and compressed provider components slow safe change

Evidence: `page.tsx` contains dashboard state, API access, auth, scan flow, history, settings, deal rows, and location dialog; provider files use dense one-line implementations.

Impact: parallel work creates merge conflicts and state duplication.

Fix direction: after Phase 1 behavior is covered, extract provider registry, scan-state hook, results view model, location dialog, and settings panels along domain seams.

## Triage rules

- A P0 blocks all feature work that depends on the affected behavior.
- Every bug fix includes a failing test first or an equivalent reproducible fixture.
- Security/data bugs require API-layer tests; a visual-only test is insufficient.
- New findings must include evidence, impact, fix direction, and regression coverage before prioritization.
