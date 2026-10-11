# Tailwind and shadcn migration

Implemented locally on 11 October 2026. The existing Tailwind 4/PostCSS and shadcn Radix setup was already installed; no dependencies were added or reinitialized.

Product rows now use Tailwind for their responsive grid, image well, price alignment and basket action spacing. The current-price caption was removed, and the existing basket action is directly beneath the price. The legacy row also drops that caption while retaining its historical-price label. Eligibility, offer comparisons, currency formatting, basket callbacks, pending/disabled states and existing local cart work are preserved.

The shared shadcn `Button` now renders basket and store-page recovery/pagination actions. Its tokens follow the existing theme and IRANSansX font; all sizes preserve a 44px minimum touch target, visible focus and reduced-motion support.

The next slice migrates the remaining application actions to the shared `Button`, including authentication, navigation, location editing, scan feedback, history, deal loading, cart controls and dialog actions. Shared shadcn `Input`, `Select`, `Checkbox`, `Label` and `Card` primitives now cover text/number fields, sorting and delivery/source/discount selectors, the default-location toggle, and authentication surfaces. Existing Radix dialogs and dropdowns remain the interaction layer, with shadcn buttons used for their triggers and close actions. Native disclosure elements remain for content summaries such as scan details, map options and cart coverage.

`globals.css` retains imports, fonts and theme tokens. The existing stylesheet was moved without rewriting its rules to `legacy.css`, imported in Tailwind's `components` layer. Utilities can therefore override component rules during incremental migration. The basket stylesheet no longer positions the row action in a separate grid row. The shadcn color/radius mappings now cover the shared button's variants in both themes.

This is still an incremental migration. Feature layout and presentation rules remain in the transitional stylesheet while controls move to shared primitives. Continue with one feature at a time, using semantic Tailwind tokens, then remove each feature's obsolete rules from the transitional stylesheets. Keep the existing RTL reading order, provider rules, dialogs, accessibility and theme behavior.

Validation: production static export and TypeScript check passed, as did 35 frontend unit tests and all 86 existing desktop/mobile browser checks. A separate Playwright CLI run checked both themes on desktop/mobile, no horizontal overflow, the action below the price, removal of the caption, 44px targets, focus, font, the pending state, and one successful mocked basket write followed by the disabled “in basket” state. The Impeccable mechanical scan returned no findings. Private logs, the browser fixture and screenshots are in `.data/ui-migration/`. Browser transport data is synthetic and no actual basket write, scan, deployment or account change was performed.

For this follow-up slice, the web TypeScript check and optimized production build also passed. No new tests were added or run.

The follow-up browser smoke check could not be completed: the existing local Next server at port 3000 displayed a runtime `TypeError: a[d] is not a function`, and a temporary production server returned 500 because the generated `.next/server/webpack-runtime.js` referenced a missing `vendor-chunks/zod@4.4.3.js`. The optimized build itself completed successfully. This points to the local runtime/build artifact state, so visual verification of these new controls remains outstanding.

The incremental setup follows the official [Tailwind custom styles guidance](https://tailwindcss.com/docs/adding-custom-styles) and the existing [shadcn Radix button](https://ui.shadcn.com/docs/components/radix/button) architecture.
