# Better Buy

Better Buy compares discounted products from SnappMarket and Okala for saved delivery locations in Tehran. Signed-in users can keep scan history, provider carts, wishlist alerts, and browser push notifications.

## Architecture

- `apps/api` is the backend, written in Go. One server process serves HTTP, drains the durable SQLite scan queue, runs wishlist schedules, and delivers notifications.
- `apps/web` is the Next and React frontend. Its production build is a static export in `apps/web/out`.
- `packages/shared` contains TypeScript contracts and helpers used by the frontend.
- The browser's `/sw.js` handles web push events. Scan work runs in the Go server and does not use a separate process.

## Local development

Install the frontend dependencies and Go toolchain, then set the environment variables listed in `.env.example` in your shell. The server does not automatically load `.env` files.

```sh
pnpm install
go -C apps/api run ./cmd/migrate
pnpm dev
```

The API listens on `127.0.0.1:8787`; the web development server listens on `127.0.0.1:3000`. For local sign-in without Google OAuth, set `DEV_MODE=true`. The development-only test login route is disabled by default.

`VPS_DATABASE_PATH` selects the SQLite database. The default is `../../.data/better-buy-vps.sqlite`, relative to the API process working directory. Point it at the existing database when preserving existing accounts and scan history.

## Build and migrate

```sh
pnpm build
go -C apps/api run ./cmd/migrate
```

The frontend build writes static files to `apps/web/out`. The Go server is built as part of `pnpm build`; `pnpm api:build` builds just the backend.

## Configuration

The API requires `BETTER_AUTH_SECRET`, `BOX_KEY`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`. Configure `APP_ORIGIN`, `BETTER_AUTH_URL`, and `CORS_ORIGIN` for the site. Wishlist scheduling and API rate limits are enabled by default. Browser push requires `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` together.

## Current limits

The Go queue and core API are implemented, but the rewrite is not ready for production rollout. Snapp store-campaign enrichment and Okala shared-offer caching remain incomplete. Existing-database compatibility, full HTTP/provider parity, real push delivery, and idle memory on the VPS have not been verified. The VPS RAM sample previously shared in this conversation showed about 91.8 MiB RSS for HTTP and 56.2 MiB for the separate scan process; Go memory savings have not been measured.

No production database or deployment has been changed.
