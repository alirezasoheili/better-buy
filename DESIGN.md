# Better Buy design system

Better Buy is a Persian RTL grocery-offer comparison tool. The design is a compact utility: location, retailer, one scan action, and saved observations. The existing «ب» identity mark and Better Buy name remain. Local IRANSansX FaNum remains the only font family. There is no marketing hero, decorative photography, animated scanning machinery, or permanent navigation rail.

## Direction and audit

| Before                                           | After                                                                         | Why                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Permanent dark location rail                     | Compact header; location management in a Radix panel                          | Give comparisons the main content area                          |
| Retailer connection settings                     | Concise help panel; retailer selector stays visible                           | Snapp and Okala require no customer setup                       |
| Repeated desktop/mobile/empty-state scan buttons | One action in the context controls                                            | Prevent competing calls to action and covered mobile content    |
| Animated scan strip                              | Account-wide text status with its actual context                              | Communicate work and preserve discoverability across navigation |
| Four oversized summary tiles                     | Compact feed-state filters and counts                                         | Make comparison actionable without inflating statistics         |
| Vendor-chip wall                                 | Native keyboard-accessible offer disclosure                                   | Keep the best offer legible and other store prices available    |
| Result failures look empty                       | Loading, error, cached refresh failure, loaded empty, and filter-empty states | Truthful recovery without starting another scan                 |
| Partial/full choice                              | Omitted from new scans; historical mode remains readable                      | Both active collectors ignore mode                              |

## Tokens and layout

| Role                   | Light     | Dark      |
| ---------------------- | --------- | --------- |
| Canvas                 | `#f7f8fa` | `#171a20` |
| Surface                | `#ffffff` | `#20252d` |
| Text                   | `#20242b` | `#f0f2f5` |
| Secondary text         | `#59616e` | `#b1b9c6` |
| Divider/control border | `#d7dce3` | `#434c5b` |
| Action / focus         | `#b84313` | `#ffb18a` |
| Action text            | `#ffffff` | `#382013` |
| Error text             | `#b42332` | `#ffabb3` |
| Status text            | `#266047` | `#ace0c5` |

The header's «ظاهر» menu selects light, dark, or system appearance through the existing ThemeProvider. The choice is saved in the browser; system appearance is the default. Product images keep a white image well for source fidelity. Semantic colors always accompany text.

Body is 14px with 1.85 line height; metadata 12–13px, product title 16px (14px on narrow screens), page title 24px (21px on mobile), price 19px (18px on mobile). Spacing steps are 4/8/12/16/24/32px. Controls use 8px corners, content surfaces 12px, and the retained brand mark 10px. Controls and disclosure summaries are at least 44px tall. Overlay/panel/menu layers are 40/41/50.

The header is capped at 1440px and the workspace at 1120px. Context controls precede results; search, sort, and comparison filters remain near the list. At 768px the layout compresses, and at 520px controls and price blocks stack. Nothing is fixed over result content. Dialogs use `100dvh` bounds and scroll within their own surface for small screens/keyboards. CSS uses logical properties and text is isolated with `bdi`; coordinates use LTR inputs. Money display retains shared provider-specific units.

Only short color/border transitions are used. No recurring list animation, custom polling timers, or direct frontend React effects. Reduced motion removes transitions. Hover styles are gated to a fine pointer. Keyboard focus uses a 3px visible ring. Dialogs and nested deletion confirmations use existing Radix Dialog/AlertDialog portals, focus containment/restoration, and Escape behavior. Vendor comparisons use native `details`/`summary`.

## Product semantics

The price, original price, discount, and vendor name all come from the same cheapest current offer. Disappeared offers cannot win a current price; an entirely historical group is labelled with a historical price. Expanded offers put current observations first, ordered by price. Group identities and v1 grouping remain unchanged and provider-specific.

Feed labels are «پیشنهادهای جدید», «در فهرست فعلی», and «دیگر در این فهرست نیست». These describe the feed comparison, not universal availability. Okala coverage is explained once near its results and in help. Scan progress counts distinct inspected stores; no percentage or ETA is invented. New scans default to 40%, and threshold lives behind «گزینه‌های اسکن». Historical scans preserve their original thresholds and modes, including Jet history.

## Requested design sources

Installed Emil and Taste skills were discovered and read first. Exact upstream sources were then read at these repository revisions on 2026-10-08; the missing Anthropic skill was fetched to a temporary reference directory, with no global installation or setup commands:

- Emil: [emil-design-eng](https://github.com/emilkowalski/skills/blob/e8a175de22ae1e49370fc144c1f3bb9aeedf988d/skills/emil-design-eng/SKILL.md), revision `e8a175de22ae1e49370fc144c1f3bb9aeedf988d`.
- Anthropic: [frontend-design](https://github.com/anthropics/skills/blob/683bc88e56f3e09ba94f7055977f3d3aa499f202/skills/frontend-design/SKILL.md), revision `683bc88e56f3e09ba94f7055977f3d3aa499f202`.
- Leon: [design-taste-frontend](https://github.com/leonxlnx/taste-skill/blob/b482f7a970abb98c4108d4a9f761e458c64cefc8/skills/taste-skill/SKILL.md), revision `b482f7a970abb98c4108d4a9f761e458c64cefc8`. The current source resolves to `skills/taste-skill/SKILL.md`.

Emil leads feedback/accessibility/restraint; Anthropic leads deliberate tokens, functional copy, and self-critique. Taste explicitly excludes dashboards and multi-step product UI, so only its audit-first process and applicable principles are used. User overrides are variance 3 / motion 2 / density 4. No marketing presets, Latin typography requirements, image-generation requirements, or Impeccable were applied.

## Visual evidence

Local evidence is kept in ignored `.data/design-evidence/`: real before/after browser screenshots, responsive/theme/state captures, and three public Okala image references. Before/after comparison uses controlled representative Persian grocery data; prices and account/session responses are fixtures. The public image lookup is a separate read-only live observation, not a production application scan. Browser transport fixtures do not reproduce TLS negotiation. See README for behavioral validation and limitations.
