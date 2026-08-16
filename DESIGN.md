---
name: Better Buy
description: A Persian RTL live grocery shelf for scanning and comparing deep local discounts.
colors:
  signal-orange: "#f4511e"
  signal-orange-deep: "#b92900"
  paper: "#f4f1e9"
  shelf-stock: "#fffdf7"
  charcoal-ink: "#1b1b18"
  rail-charcoal: "#20211d"
  muted-ink: "#68675f"
  shelf-rule: "#d9d4c7"
  savings-mint: "#167b58"
  vanished-gray: "#77736b"
typography:
  display:
    fontFamily: 'IRANSansX, Tahoma, "Segoe UI", sans-serif'
    fontSize: "clamp(25px, 3vw, 38px)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: 'IRANSansX, Tahoma, "Segoe UI", sans-serif'
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: 'IRANSansX, Tahoma, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: 'IRANSansX, Tahoma, "Segoe UI", sans-serif'
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.3
rounded:
  control: "10px"
  label: "12px"
  surface: "14px"
  scan-strip: "16px"
  pill: "99px"
spacing:
  compact: "8px"
  control: "12px"
  row: "18px"
  surface: "24px"
  workspace: "34px"
components:
  button-scan:
    backgroundColor: "{colors.signal-orange}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.label}"
    padding: "0 23px"
    height: "56px"
  button-utility:
    backgroundColor: "{colors.charcoal-ink}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  field:
    backgroundColor: "#ffffff"
    textColor: "{colors.charcoal-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px"
  deal-row:
    backgroundColor: "{colors.shelf-stock}"
    textColor: "{colors.charcoal-ink}"
    padding: "16px 18px 16px 0"
---

# Design System: Better Buy

## Overview

**Creative North Star: "The Live Grocery Shelf"**

Better Buy turns a data-heavy local scanner into a physical-feeling grocery shelf. Warm paper and shelf-stock surfaces carry the content, charcoal structures establish operational confidence, and signal-orange price tabs make the deepest discounts readable before any supporting detail. The visual world is practical, dense, and unmistakably retail rather than a generic SaaS dashboard.

Location, scan state, price, and recency stay visually attached to the buying decision. Ruled rows and shelf-label silhouettes organize repeated products; restrained depth keeps the interface calm while a moving scanner line and tactile scan action communicate live work. The Persian RTL reading order is foundational, not a mirrored afterthought.

**Key Characteristics:**

- Warm paper and shelf-stock materiality.
- Charcoal operational framing with sparse signal orange.
- Ruled, high-density deal rows modeled on shelf labels.
- Large tabular Persian discount and price numerals.
- Responsive RTL behavior with a persistent mobile scan action.

## Colors

The palette combines grocery-paper warmth with high-contrast charcoal and a single urgent retail signal.

### Primary

- **Signal Orange:** Marks discount tabs, the manual scan action, scanner beam, loading indicators, and selected deal states. It is the visual alarm for actionable savings.
- **Deep Signal Orange:** Carries orange text on pale surfaces, especially section eyebrows, active summaries, and error-adjacent emphasis where the brighter orange would lose contrast.

### Secondary

- **Savings Mint:** Confirms healthy connection states, savings amounts, and successful scan outcomes without competing with the discount signal.

### Neutral

- **Warm Paper:** The application canvas; it prevents the dense ledger from feeling clinical.
- **Shelf Stock:** The primary content surface for deal rows, forms, summaries, and status containers.
- **Charcoal Ink:** Main copy, top scan strip, and strong utility actions.
- **Rail Charcoal:** The location rail and mobile navigation shell; it anchors place and navigation outside the product ledger.
- **Muted Ink:** Secondary copy, metadata, and explanatory text.
- **Shelf Rule:** Dividers, input strokes, and dashed price separators.
- **Vanished Gray:** Desaturates deals that have disappeared from the latest scan.

**The Orange Means Action Rule.** Use signal orange for discounts, scanning, and the strongest active state; do not distribute it as general decoration.

**The Warm Shelf Rule.** Product-bearing surfaces stay warm and light. Pure white is reserved for inputs, product-image wells, and momentary hover clarification.

## Typography

**Display Font:** IRANSansX (with Tahoma, Segoe UI, and system sans-serif fallbacks)  
**Body Font:** IRANSansX (with Tahoma, Segoe UI, and system sans-serif fallbacks)

**Character:** IRANSansX FaNum provides dependable Persian shaping and Persian tabular numerals for fast operational scanning. Hierarchy comes from size, weight, and numeral scale rather than a decorative second family.

### Hierarchy

- **Display** (700, fluid 25–38px, 1.2): Page headings for deals, settings, and history; slightly tightened tracking creates a decisive ledger heading.
- **Title** (700, 22px, 1.3): Selected location and high-value price labels.
- **Body** (400, 13px, 1.8): Explanations and contextual copy; product titles use a denser 15px face with generous 1.8 line-height and a 65ch ceiling.
- **Label** (700, 11px, 1.3): Scan context, metadata, badges, and controls. Tiny labels may step down to 9–10px only inside compact shelf tags.
- **Price Numerals** (700–900, 17–27px): Discount tabs, totals, and final prices use tabular numerals to keep repeated rows aligned.

**The Number Leads Rule.** In a deal row, the discount and final price must outrank vendor, category, stock, and explanatory savings copy.

## Layout

The desktop shell is an RTL two-column grid: a sticky 246px location rail on the right and a fluid workspace with 34px horizontal padding. The scan strip spans the workspace first, followed by a four-cell summary and a ruled deal ledger. Deal rows use a four-part grid for discount tab, product image, product identity, and price label; repeated horizontal rules establish shelf rhythm more strongly than isolated cards.

At 1050px, the rail compresses to 86px and navigation becomes icon-led. Deal rows collapse their price area beneath product identity while preserving the discount tab as the first strong signal. At 720px, the rail becomes a compact top shell with a location select, the summary becomes two columns, filters become a two-column control grid, and the scan action becomes a fixed full-width bottom control. Mobile workspace padding is 12px with 96px reserved below for the sticky action.

Spacing is dense and purposeful: 8–12px within controls and badges, 16–24px inside surfaces, and 28–40px between major content regions. RTL direction governs layout, while coordinate entry intentionally switches to LTR and restores RTL at each label.

**The Attached Context Rule.** Location and scan time remain above the ledger, while deal state and price remain inside every product row.

## Elevation & Depth

The system is flat by default and uses borders, rules, and tonal contrast for structure. Shadows are reserved for objects that physically float above the shelf: the scan strip, active location, credential status, location sheet, discount tab, and primary scan action. Their role is ambient and directional rather than decorative.

### Shadow Vocabulary

- **Surface Float** (`0 10px 30px rgba(54,45,28,.09)`): Credential and compact elevated surfaces.
- **Operational Strip** (`0 12px 34px rgba(43,39,28,.15)`): The top scan strip against warm paper.
- **Signal Lift** (`0 8px 18px rgba(244,81,30,.24)`): Primary scan control at rest; expands on hover.
- **Sheet Depth** (`18px 0 50px rgba(0,0,0,.22)`): The full-height location editor above its dimmed, blurred backdrop.

**The Flat Shelf Rule.** Repeated content rows use rules and tonal layering, never individual card shadows.

## Shapes

Corners are gently curved and practical. Fields and utility controls use 9–11px radii; repeated content surfaces use 12–14px; the large scan strip reaches 16px. Badges are fully pill-shaped. The signature discount tab deliberately breaks symmetry: it is flush to the row edge with only its inward corners rounded, echoing a clipped shelf-price label.

Thin solid rules structure summaries, fields, and row boundaries. A dashed rule separates price information inside each deal row. Circular geometry is limited to status dots and the first-run 40% marker.

## Components

### Buttons

- **Shape:** Tactile, compact controls with gently curved corners; the primary scan action uses a 13px radius and 56px height.
- **Primary:** Signal-orange fill, white text, bold label, icon-plus-copy composition, and 23px horizontal padding.
- **Hover / Focus:** The scan action lifts 2px and gains a broader orange shadow over 180ms. All interactive elements use a visible 3px translucent orange focus ring with 2px offset.
- **Utility:** Charcoal fill with white text for save and empty-state actions. Icon-only rail controls use a dark tonal fill and 9px radius.
- **Disabled / Destructive:** Disabled scan controls become flat gray with no shadow. Destructive location deletion is transparent with a restrained red border and copy.

### Chips

- **Style:** Tiny pill badges use a pale botanical gray-green with dark green copy for deal state; adjacent category badges use a warm neutral fill and muted copy.
- **State:** Summary filters are larger ruled cells rather than pills; the active cell switches to pale orange with deep-orange copy.

### Cards / Containers

- **Corner Style:** Large standalone surfaces use 14–16px corners; repeated deal rows remain rectangular within the continuous shelf ledger.
- **Background:** Shelf Stock on Warm Paper, with charcoal reserved for operational chrome.
- **Shadow Strategy:** Flat for repeated content; ambient shadow only for raised controls and overlays.
- **Border:** One-pixel Shelf Rule dividers, with a two-pixel Charcoal Ink top rule introducing ledgers and forms.
- **Internal Padding:** Generally 18–25px; deal rows use tighter asymmetric padding so the discount tab meets the edge.

### Inputs / Fields

- **Style:** White fill, one-pixel Shelf Rule stroke, 10–11px radius, and 12px internal padding.
- **Focus:** Global translucent orange outline; search inputs suppress their own inner outline because the enclosing field carries the control shape.
- **Error / Disabled:** Form errors use dark red copy. Disabled scan controls visibly lose orange color and depth.

### Navigation

The desktop location rail is a dark, sticky vertical anchor. Saved locations are full-width RTL rows; hover uses a slightly lighter charcoal and the active location becomes a white inset card with dark text and a shadow. Secondary history and settings actions sit at the bottom. On mobile, navigation condenses into a dark header with a visible native location selector and icon-led utility actions.

### Scan Strip

The scan strip is the operational signature: a charcoal full-width surface with selected-location context, a horizontally ruled scanner bay, and the dominant orange action. During a scan, a two-pixel orange beam travels across the bay with a soft glow; reduced-motion preference collapses the animation. Live copy reports vendors and products as they are read.

### Deal Shelf Label

Each deal is one ruled row, not a floating card. A clipped orange discount tab, white product-image well, product identity block, state/category badges, and dashed-separated price block create a stable visual grammar. Disappeared deals are desaturated and reduced to 72% opacity while remaining legible for historical comparison.

## Do's and Don'ts

### Do:

- **Do** keep Persian RTL order as the default spatial and reading model.
- **Do** attach location, scan time, deal state, and price to the decision they qualify.
- **Do** use tabular, oversized numerals for discounts, totals, and final prices.
- **Do** preserve ruled shelf continuity across long result sets.
- **Do** provide visible keyboard focus and honor reduced-motion preferences.

### Don't:

- **Don't** turn product results into a generic grid of floating SaaS cards.
- **Don't** use signal orange as ambient decoration or on low-priority metadata.
- **Don't** separate a price from its discount tab or product identity.
- **Don't** hide the manual scan action on mobile; keep it sticky and reachable.
- **Don't** use ornamental typefaces that weaken Persian legibility or numeric scanning.
