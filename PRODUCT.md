# Better Buy

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Signed-in users in Iran who want to quickly compare unusually deep grocery discounts from supported stores across several saved delivery locations.

## Product Purpose

Better Buy manually scans supported store APIs, keeps products discounted by at least 40%, and makes changes between scans visible. Success means the user can choose a location, run a scan, and identify worthwhile available deals without searching stores one by one.

## Positioning

The product turns a location-specific promotional feed into a durable, comparable shelf of high-discount products, including what is new and what disappeared since the previous run.

## Operating Context

The application uses a Cloudflare Worker (Hono, D1, Better Auth) and a static Next.js frontend, with the same Worker code used locally. Each Google-signed-in user owns private delivery locations and scan history and starts scans manually. A valid Tehran location is enough to start a SnappMarket scan: the Worker obtains public PWA guest access automatically. Okala uses public nearby-store and multi-store campaign feeds without customer credentials; Digikala Jet is disabled for new activity and keeps read-only history.

## Capabilities and Constraints

- Persian RTL web interface.
- Hono Worker API, static Next.js frontend, tenant-isolated D1 history, and no scheduled execution.
- API collection only in v1; DOM scraping, notifications, and purchasing are excluded.
- SnappMarket price amounts are presented as the tomans supplied by the API, without a unit conversion.
- Authentication material must stay out of browser-readable responses and logs.

## Evidence on Hand

The supplied market-party response establishes vendor-grouped products with discount ratio, original price, discount amount, stock, imagery, category, delivery, and vendor metadata. No commercial claims or external brand assets are available.

## Product Principles

- Make the best deal legible at a glance.
- Treat location and scan time as essential context.
- Preserve successful history even when upstream collection fails.
- Okala scans ignore legacy credential rows and use no customer or guest tokens. Keep Snapp guest access ephemeral in the Worker, out of browser responses and logs.
- Promotional feed absence does not establish that a product is out of stock across Okala.
- Prefer explicit operational states over silent failure.

## Accessibility & Inclusion

Persian RTL reading order, keyboard access, visible focus, reduced-motion support, responsive layouts, and live announcements for scan progress are required.
