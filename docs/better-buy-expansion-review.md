# Better Buy expansion final review

Reviewed committed changes from `8b72debc05216c091ae4bb81b29265e6dbf77c4b` through `4887827fc7ed9881c7330ec492b1c6d2efac85ba`. Standards and Spec reviews ran independently. Unrelated unstaged development edits were excluded.

## Standards

No documented standards violations were found. The new Expansion boundaries govern durable execution; tenant-scoped persistence, provider normalization, Query ownership, rollback and publication guards follow those boundaries.

One optional baseline smell:

- **[P3] Duplicated Code — possible judgement call.** `apps/worker/src/store.ts:292` and `:352` repeat the entire execution projection: `"(SELECT json_object('kind','workflow','phase',e.phase, ...)) execution_json"`. A future progress-field change must update both single-scan and history reads, risking inconsistent responses. Consider extracting that SQL fragment within `store.ts`, preserving each query's tenant guards, filtering and bindings. This is a maintainability suggestion, not a correctness blocker or documented-rule violation.

No other actionable baseline smells warranted changes. Tooling-enforced formatting/type concerns and unrelated unstaged local changes were excluded.

## Spec

Two actionable gaps were found:

- **[P1] Overlap resolution retains older prices.** `apps/worker/src/durable/repository.ts:456` assigns adapter priority, and its UPSERT at line 471 selects solely by that priority. A newer campaign observation cannot replace Market Party; equal-priority observations retain the first tuple. Conflicting prices also disappear without a retained diagnostic. The bounded path similarly keeps the baseline tuple in `apps/worker/src/providers/snapp/storeCampaigns.ts:595`. Spec D05, line 125 requires “latest successfully observed complete price tuple wins,” with priority/feed identity only breaking equal-time ties, and “Retain a conflict diagnostic.” Apply that rule in both execution paths, preserve provenance and stored observation time through replay, and test newer overlaps and equal-time ties.
- **[P2] Durable discovery drops omission evidence.** `apps/worker/src/durable/adapters.ts:84` consumes `plans.plans` but discards `plans.omitted`. Unsupported/conditional sections, invalid home ownership/schema and planning-budget omissions are therefore absent from durable operational records and comparison reports. Spec D02a, line 87 requires “Record omitted candidates and reasons operationally”; the latest implementation request also requires reporting failed discovery and budget limitations. Persist bounded sanitized omission reasons with the frozen plan, expose them through the private audit seam, and verify they survive resume without becoming zero-eligible observations.

No additional scope creep was identified. The automatic feed, default threshold and production G05 distinction are preserved. Production account verification remains explicitly blocked, with durable enablement disabled; local runtime success does not resolve that gate.

## Resolutions

All three findings were fixed together by one implementer in `c498056` on `codex/expansion-review-fixes`, integrated locally in `569797e`. Both reviewers independently verified the focused resolution at `c498056`; neither found an unresolved issue.

- Standards: expanding the shared execution projection reproduces the original scan/history queries byte-for-byte. Tenant guards, joins, filters, ordering, limits and bindings are unchanged.
- Spec D05: both collectors select the latest coherent tuple, then stable priority/feed identity for equal-time ties, retain provenance and conflict diagnostics, and preserve cached response time through migration 0011. Old untimed checkpoints use a stable conservative fallback.
- Spec D02a: omissions persist before freezing and on failure paths. At most 100 sanitized records are retained, with complete per-reason totals and truncation counts. Resume preserves the audit; nonterminal scopes are `incomplete`, never invented `zero_eligible` results.

Verification passed: 260 implementer-branch tests and typechecks, 58 focused checks, normal repository commit hooks, actual local Workflow/D1, and the new actual D1 review fixture. Final main-checkout hooks passed 262 tests, including two additional preserved development-auth tests outside the feature commits. The integration checkout also passed the existing actual D1 context and campaign compatibility scripts. See [implementation evidence](better-buy-final-review-fixes.md) and [completion report](better-buy-expansion-completion.md).

Review totals: Standards **one optional heuristic**, worst P3 duplication, resolved; Spec **two findings**, worst P1 stale overlapping prices, resolved. **Zero unresolved findings** in either axis. The separately blocked production G05 gate remains documented.
