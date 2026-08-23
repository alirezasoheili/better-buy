# Better Buy

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single local user in Iran who wants to quickly compare unusually deep grocery discounts from supported stores across several saved delivery locations.

## Product Purpose

Better Buy manually scans supported store APIs, keeps products discounted by at least 40%, and makes changes between scans visible. Success means the user can choose a location, run a scan, and identify worthwhile available deals without searching stores one by one.

## Positioning

The product turns a location-specific promotional feed into a durable, comparable shelf of high-discount products, including what is new and what disappeared since the previous run.

## Operating Context

The application runs on one Windows computer through localhost. It is used occasionally before grocery shopping. The user maintains named latitude/longitude locations, supplies replaceable store credentials, and starts every scan manually.

## Capabilities and Constraints

- Persian RTL web interface.
- Hono API, Next.js frontend, SQLite history, and no scheduled execution.
- API collection only in v1; DOM scraping, notifications, and purchasing are excluded.
- SnappMarket price amounts are presented as the tomans supplied by the API, without a unit conversion.
- Authentication material must stay out of browser-readable responses and logs.

## Evidence on Hand

The supplied market-party response establishes vendor-grouped products with discount ratio, original price, discount amount, stock, imagery, category, delivery, and vendor metadata. No commercial claims or external brand assets are available.

## Product Principles

- Make the best deal legible at a glance.
- Treat location and scan time as essential context.
- Preserve successful history even when upstream collection fails.
- Keep credentials local, redacted, and replaceable.
- Prefer explicit operational states over silent failure.

## Accessibility & Inclusion

Persian RTL reading order, keyboard access, visible focus, reduced-motion support, responsive layouts, and live announcements for scan progress are required.
