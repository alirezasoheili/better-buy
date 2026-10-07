# UI/UX Improvement Plan

Mode: operate. Preserve the established “live grocery shelf” visual language in `DESIGN.md`: warm shelf surfaces, charcoal operational framing, orange for the primary action/discount signal, dense Persian RTL scanning.

## Experience principles

- Truth before polish: location, provider, threshold, scan time, and results must stay attached.
- SnappMarket requires only a valid location; first use guides location selection and scan start. Guest-access failures are scan errors without a customer-login action.
- Okala requires only a valid location and ordinary scan constraints. Public endpoint failures appear in normal scan feedback with retry; no customer setup is offered.
- One product, one decision row: vendor differences are supporting choices shown as chips.
- Addresses before coordinates: raw latitude/longitude is an advanced fallback.
- Every visual state has semantic feedback for keyboard and screen-reader users.

## Scan strip

### Information hierarchy

1. Selected location and provider.
2. Last matching scan time or “no scan for this context.”
3. Current state: ready, location required, scanning, success, or failure.
4. Threshold control.
5. One primary action.

The idle label should not say “در حال بررسی” when no scan is running. Use state-specific copy rather than treating the strip as a generic container.

### Primary action behavior

| State                  | Label                                     | Action                                                                   | Disabled? |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------ | --------- |
| Automatic Snapp access | `اسکن تخفیف‌ها`                           | Start scan with a valid location; connectivity checked during collection | No        |
| Public Okala access    | `اسکن تخفیف‌ها` / provider-specific label | Start scan                                                               | No        |
| No valid location      | `افزودن مکان`                             | Open location flow                                                       | No        |
| Scanning               | `در حال اسکن`                             | None                                                                     | Yes       |

Both settings screens explain credential-free scanning and contain no credential-entry fields. Ready to start means configuration permits a scan; it does not verify upstream connectivity.

Desktop and mobile render the same semantic state. Mobile may use sticky placement, but not different business logic.

### Feedback

- Use `aria-busy` on the scan region while active.
- Announce major progress changes through one stable `role="status"` region; do not announce every polling tick.
- Use `role="alert"` for failures and include a recovery action.
- Keep the action visible above mobile safe-area insets and prevent it from covering focused inputs/content.

## Provider experience

- Source selector contains only visible providers: SnappMarket and Okala for now.
- Jet is absent from active controls and settings.
- Historical Jet runs show a small “temporarily unavailable” status; their stored results remain readable.
- Provider connection errors stay near the active provider rather than replacing the entire dashboard.

## Deal rows and vendor chips

### Row structure

- Discount tab remains the first strong signal.
- Product image and identity remain central.
- Final price remains visually dominant over metadata.
- State/category badges remain above the title.
- Vendor chips sit below the title/category and above the price boundary on mobile.

### Vendor chips

- One unique chip per vendor; chip label is the human-readable vendor/store name.
- Include stock in the chip when it helps compare stores, for example `فروشگاه الف · ۳ موجود`.
- Chips wrap naturally for small sets. For more than a defined threshold (recommended six), show the first set plus `+N فروشگاه` expansion.
- Chips are keyboard-readable; use buttons only if they perform an action. Static chips should not falsely appear interactive.
- When a vendor filter is active, visually emphasize the matching chip.
- A single-vendor product still shows its vendor plainly without a redundant “one vendor” counter.

### Counts and filters

- Rename the top count to communicate unique products after grouping.
- Preserve a separately labeled vendor-offer count in scan details/history.
- Search matches title, category, and every vendor name.
- Vendor filter retains a group if any vendor matches.
- Summary filters expose `aria-pressed` and visible focus.

### Responsive cases to design and test

- Missing image.
- Long Persian product title.
- One, three, six, and 10+ vendor chips.
- Mixed vendor stock/state.
- Large price numerals and 100% discount edge formatting.
- New, still available, and disappeared groups.

## Location and map flow

### Recommended sequence

1. Search a Tehran neighborhood, street, landmark, or address.
2. Choose a constrained search result.
3. Confirm or adjust a prominent pin on the map.
4. Read the selected address and Tehran-valid status.
5. Name the location and optionally make it default.
6. Save.

Map-click selection remains available. Coordinates move into an “advanced coordinates” disclosure.

### Map states

- Loading tiles.
- Search idle/loading/results/no results/error.
- Selected valid address.
- Outside Tehran.
- Reverse-geocoding pending/failed.
- Geolocation permission pending/denied/unavailable.
- Tile provider failure with manual fallback.

The existing circle marker should be replaced or strengthened only after runtime verification. The component already renders a `CircleMarker`; the reported missing marker is likely visibility/affordance or a runtime layer issue.

### Dialog accessibility

- Initial focus moves to the first useful field/search.
- Tab is trapped within the dialog.
- Escape closes only when closing is allowed.
- Focus returns to the opener.
- Close button has an accessible Persian label.
- Remove `role="application"` from the map unless a complete custom keyboard interaction is implemented.
- Location creation must be possible without interacting with the map canvas.

## Loading, empty, and error states

- Load locations/current context independently from non-active provider settings.
- Show a contextual empty state for “no scan yet,” distinct from “filters removed every result.”
- Preserve displayed successful history when a later scan fails.
- Failed scan copy includes provider-safe error reason and next action.
- Public upstream access rejection is a failed scan with a safe explanation and retry, never an OTP/reconnect action.

## Accessibility and responsive checklist

- Search has a persistent accessible label, not placeholder-only naming.
- Interactive touch targets are at least 44×44px.
- Tablet layout retains an explicit location edit action.
- All forms announce errors once through `role="alert"`.
- Decorative product images retain empty alt; meaningful address/map state is expressed in text.
- Reduced-motion mode removes movement but keeps visible state change and progress.
- Keyboard focus is visible on chips, filters, dialogs, controls, and retry actions.
- Test RTL order at desktop, tablet, and mobile—not only mirrored layout.

## Visual validation gate

For each UI phase, capture one bounded review set:

- Desktop: ready, public access failure, scanning, grouped row with many chips, map search.
- Mobile: same critical states, plus sticky action and open keyboard.
- Then fix the complete set and run one confirmation set.

Automated accessibility/component tests complement screenshots; screenshots do not prove state correctness.
