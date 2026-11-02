# Go API

The API, persistent scan queue, wishlist scheduler, notification processing, push delivery, and maintenance run in one Go server process. The scan queue is stored in SQLite and drained by a goroutine in that process; there is no separate scan service to run. Successful provider responses and completed scan pages are also checkpointed in SQLite, so a restart reuses completed provider responses and continues with missing pages.

From the repository root:

```sh
go -C apps/api run ./cmd/migrate
go -C apps/api run ./cmd/server
```

Run `go -C apps/api run ./cmd/backup` to create a consistent SQLite backup and prune backups older than the configured retention period. Set `VPS_BACKUP_DIR` and `VPS_BACKUP_RETENTION_DAYS` to override its defaults.

The server listens on `127.0.0.1:8787` by default. It reads configuration from the process environment. See the root `.env.example` for the required auth, database, and optional push settings. The server does not load `.env` files itself.

The existing SQLite application migrations and scan-queue schema are embedded in the Go module. Point `VPS_DATABASE_PATH` at the existing database to preserve user, location, scan, and deal data. Migration and existing-database compatibility still need runtime verification before rollout.

The frontend remains the Next and React application in `apps/web`; its TypeScript shared package contains UI contracts and formatting helpers. The Go backend has no TypeScript or JavaScript runtime. `apps/web/public/sw.js` runs in browsers for push notifications; it is not a server process.

Snapp store-campaign enrichment and Okala shared-offer caching are not implemented in this Go port. Provider behavior, full API compatibility, push delivery, and idle memory have not yet been verified against a running deployment. No deployment has been performed.
