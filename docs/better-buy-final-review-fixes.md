# Final expansion review fixes

The final standards/spec review covered `8b72deb…4887827`. This branch fixes its two actionable spec findings and its optional repeated SQL projection finding. The worktree was advanced to integration commit `4887827` before edits; unrelated root-checkout work was preserved. No deployment, external publication, or UI controls were added.

## D05: overlapping observations

Durable staging and the bounded S05 collector now choose the latest successfully observed complete tuple. Money, stock, presentation, and benefit facts stay together. Equal-time ties retain the existing Market Party adapter priority; equal-priority ties use stable feed identity. Reversing stage order does not change the selected tuple. Provenance is unioned without multiplying stock or vendor/product identities.

Conflicting price tuples produce private audit diagnostics. Durable facts retain the conflict marker through later overlap/replay, and `readDurableComparison` returns its count with at most 100 offer identities. The bounded collector reports the corresponding conflict count/identities. Existing numeric vendor/product ownership, benefit eligibility, and the 40% threshold remain unchanged.

Migration `0011_discovery_observation_time.sql` adds one nullable private `scan_discovery.observed_at` column. A first successful response writes its timestamp once with its immutable response checkpoint. Normalization after resume reads that stored timestamp, including campaign planning pages collected before Market Party. Old checkpoints without verified response timing use the stable scan-start/creation time conservatively, rather than being stamped as fresh when replayed.

The shared grouping projection already uses latest observation time and coherent tuples; the reviewed staging/collector paths were incorrectly discarding later tuples before that projection could inspect them.

## D02a: planning omissions

Durable planning persists its omission audit before freezing admitted units. Candidate omissions include invalid home fields, home/delivery ownership mismatches, unsupported or conditional sections, count/pagination gates, and planning/execution budget limits. Failed nearby/home discovery and conflicting numeric ownership also persist partial audit facts when the planner fails. These remain operator facts, separate from collected campaign eligibility.

The private checkpoint retains at most 100 omission records with complete per-reason totals and an explicit truncated count. It stores bounded store codes, numeric collection IDs, safe section types, fixed reason codes, and bounded schema field paths; arbitrary upstream messages, coordinates, tokens, and response content are excluded. Frozen-plan resume reads the existing checkpoint without rediscovery. All persisted metadata remains inside the existing guarded/private checkpoint boundary and cleanup policy; no outbound request budget was increased.

`readDurableComparison` reports this audit separately from campaign rows. Missing historical audit data is `null`, not an invented empty list. A nonterminal campaign has `incomplete` outcome even when no eligible row has yet been observed; only a terminal verified collection may be classified as `zero_eligible` or `all_duplicates`.

## Repeated SQL projection

`Store.scan` and `Store.scans` now share one private correlated execution-projection SQL fragment. Their tenant guards, joins, optional filters, ordering, and parameter bindings remain specific to their respective reads. Existing history/ownership tests and actual D1 scan/list parity validate the extraction.

## Evidence

Test seams were confirmed with the coordinating agent: published `Store` offers, the bounded collector's returned observations, normalized cached provider responses, and private comparison after planning/resume. Regressions were observed failing before the latest-tuple, replay-time, omission-persistence, and failed-home audit fixes, then passed. Additional cases verify both equal-time stage orders, bounded metadata/reason totals, incomplete versus zero-eligible classification, redaction, and tenant ownership.

- Focused worker checks: 58 tests passed across durable persistence, campaign collection, history, and store suites.
- Full repository `pnpm test` passed: 260 tests (shared 14, web 35, worker 211). `pnpm typecheck` passed for all packages.
- `node apps/worker/scripts/check-review-fixes-d1.mjs` passed against isolated actual workerd D1, covering latest tuple, conflict/provenance audit, immutable response timestamp, omission metadata, replay/publication, ownership, and scan/list execution parity.
- `node apps/worker/scripts/check-durable-workflow.mjs` passed against isolated actual Workflows and D1, including retry sleep, pause/resume, stable scan device, Snapp and Okala collection, staging, and publication. All outbound responses were fixtures; no provider research or account-plan checks ran.
- Final repository checks and commit hooks are recorded in the handoff. The frontend is unchanged by these review fixes; its 86 browser cases were verified by S11 on the integrated UI.

Current Cloudflare [D1 binding guidance](https://developers.cloudflare.com/d1/worker-api/d1-database/) and [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) were consulted for validation. SQL and persistence behavior were verified against the actual local runtime rather than inferred solely from Node SQLite.

Graft final-review investigation: nine calls, approximately 416,329 tokens saved using the tool's per-call whole-file estimates. This is separate from earlier UI and research-phase accounting.
