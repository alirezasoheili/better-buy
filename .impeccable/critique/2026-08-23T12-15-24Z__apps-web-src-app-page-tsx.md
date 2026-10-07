---
target: current dashboard
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-23T12-15-24Z
slug: apps-web-src-app-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Scan and connection states are visible; failures are less actionable. |
| 2 | Match System / Real World | 3 | Persian grocery language is good, but the displayed price lacks clear فروشگاه provenance. |
| 3 | User Control and Freedom | 2 | Filters clear, but scans cannot be cancelled and deletion recovery is weak. |
| 4 | Consistency and Standards | 3 | Main controls are consistent; the implemented theme drifts from the documented retail world. |
| 5 | Error Prevention | 2 | Scan-scope tradeoffs are unclear; destructive confirmation is English. |
| 6 | Recognition Rather Than Recall | 3 | Location, recency, states, and filters stay visible. |
| 7 | Flexibility and Efficiency | 2 | Search, sort, and history exist; no accelerated repeat workflow. |
| 8 | Aesthetic and Minimalist Design | 2 | Scan configuration, summary filters, and result filters compete together. |
| 9 | Error Recovery | 2 | Recovery copy is generic and deletion breaks Persian language continuity. |
| 10 | Help and Documentation | 1 | First-run guidance exists; contextual help is absent. |
| **Total** | | **23/40** | **Acceptable: significant refinement needed** |

## Design Specificity Verdict

The dashboard is partially authored for Better Buy: its RTL grocery vocabulary, location-led scan workflow, Persian numerals, and ruled deal ledger are product-specific. Its visual implementation remains more generic than the intended Live Grocery Shelf: near-white/gray surfaces and a teal radar compete with the documented warm-paper, charcoal, and signal-orange world.

The deterministic scan found zero findings in `apps/web/src/app/page.tsx`. Fresh Playwright captures covered desktop and mobile successful-result states. Browser overlay injection was unavailable because this session has no native Browser MCP.

## Overall Impression

The core task is understandable and the repaired responsive structure is solid. The biggest opportunity is to turn a visible discount into a confident buying decision by making the responsible فروشگاه and price comparison unmistakable.

## What's Working

- The first-scan onboarding is now correctly reserved for users with no saved موقعیت تحویل; users with a location remain in the dashboard and can configure a فروشگاه.
- Location, scan recency, scan state, and deal-state context stay near the comparison ledger.
- Persian RTL copy and FaNum numerals support repeated discount and price scanning.

## Priority Issues

- **P1: The displayed price has no clear فروشگاه provenance.** A grouped product can name multiple فروشگاه‌ها while showing one final price. Label it as the lowest price at a named فروشگاه and reveal each available فروشگاه price and stock.
- **P1: Mobile loses the scan action after scrolling.** The mobile scan control is hidden, leaving the core action at the top of a long results shelf. Restore a sticky bottom action and reserve bottom space for it.
- **P2: The Live Grocery Shelf visual world is under-realized.** The rail and canvas read as a generic muted dashboard rather than charcoal operational chrome on warm retail paper. Apply the documented retail palette deliberately and replace the radar with a horizontal shelf-scanning beam.
- **P2: Too many decisions are exposed simultaneously.** Source, scope, threshold, four state summaries, and four result filters appear before users judge a bargain. Keep source and scan action visible, move scope and threshold into labelled scan options, and collapse secondary filters behind a visible count.
- **P2: Destructive and failure recovery breaks Persian trust.** Location deletion uses an English browser confirmation and generic errors omit the affected فروشگاه and next recovery action. Replace it with a Persian confirmation dialog and actionable recovery copy.

## Persona Red Flags

- **Alex, power user:** No saved scan presets or accelerators; repeat comparisons require revisiting multiple controls.
- **Sam, accessibility-dependent:** Repeated metadata labels are compact, and the English confirmation interrupts the otherwise Persian assistive flow.
- **Casey, distracted mobile user:** The scan action is not reachable after scrolling, and several controls are below the preferred 44px touch target.

## Minor Observations

- “سریع · ۲۵ صفحه” states an implementation limit rather than the time or coverage tradeoff.
- The status dot is correctly paired with text; retain that non-color cue.
- Empty states should name the active موقعیت تحویل and فروشگاه to preserve context.

## Questions to Consider

1. Should each row prioritize one best deal or a full cross-فروشگاه comparison?
2. Should quick scan express time, coverage, or disappear in favor of a default?
3. Which is more important next: retail visual character, mobile scan reachability, or faster filtering?
