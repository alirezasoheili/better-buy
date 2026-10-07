# Better Buy

Backend structure, Effect v4 boundaries, service lifetimes, collector changes, and execution limits are documented in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Effect v4 refactor — local validation, 2026-10-07

The backend now uses pinned `effect@4.0.1`. The frontend uses pinned TanStack Query `5.104.1` for server state and polling, with a separate cache per authenticated session and no direct `useEffect`/`useLayoutEffect` calls in its source.

| Check                                              | Baseline                                     | Refactor                                |
| -------------------------------------------------- | -------------------------------------------- | --------------------------------------- |
| `pnpm typecheck`                                   | PASS                                         | PASS                                    |
| `pnpm test`                                        | PASS: 69 Worker, 8 shared; no web unit tests | PASS: 96 Worker, 10 shared, 5 web       |
| `pnpm build`                                       | PASS                                         | PASS                                    |
| `pnpm test:e2e`                                    | PASS: 14 desktop/mobile checks               | PASS: 24 desktop/mobile checks          |
| Static Worker web export                           | Existing assets retained                     | PASS: fresh `build:worker` export       |
| Wrangler deployment dry run                        | —                                            | PASS, including the fresh static export |
| Formatting of refactored modules / diff whitespace | —                                            | PASS                                    |

No baseline check failed and no requested check remains blocked. Tests cover credential-free Snapp access, bounded guest renewal/Okala refresh, per-request retry/backoff and cancellation, completeness/stock/deduplication, persistence rollback/progress/terminal state, tenant isolation/exclusivity, session cache isolation, frontend context races, history, and accessible location editing/deletion. Focused behavior fixes reject failed Okala nearby-store envelopes, guard late terminal writes, prevent stale frontend responses, and restore location editor accessibility and selection after deletion.

This refactor was **not deployed** and did not modify a remote database or apply migrations. The pre-existing static output was restored after export validation. Retailer responses and auth sessions in this run were fixtures; D1-interface regressions used in-memory SQLite. Live retailer availability, external Google OAuth, deployed D1 behavior, and production scan timing are separate evidence. Existing live/deployment observations below describe the earlier Snapp implementation, not a release of this refactor.

ابزار پیدا کردن تخفیف‌های اسنپ‌مارکت و اکالا، و مقایسه آن‌ها بین اسکن‌های دستی. تاریخچه دیجی‌کالا جت همچنان قابل مشاهده است؛ اسکن تازه آن فعلاً غیرفعال است.

یک بک‌اند واحد روی Cloudflare Worker اجرا می‌شود (Hono + D1 + Better Auth) و هم محلی و هم در استقرار، همین کد است.

## اجرا

```bash
pnpm install
pnpm dev
```

سپس [http://127.0.0.1:3000](http://127.0.0.1:3000) را باز کنید، با گوگل وارد شوید، یک موقعیت تحویل معتبر در تهران انتخاب کنید و اسکن اسنپ‌مارکت را شروع کنید. ورود با شماره موبایل، کد پیامک یا توکن شخصی اسنپ‌مارکت لازم نیست. برای اکالا همچنان باید «تنظیمات اتصال» را تکمیل کنید. API روی `127.0.0.1:8787` با `wrangler dev` اجرا می‌شود و داده‌ها در D1 محلی نگهداری می‌شوند.

برای اولین اجرا، migration های D1 را محلی اعمال کنید:

```bash
pnpm --filter @better-buy/worker exec wrangler d1 migrations apply better-buy --local
```

Migration `0005_remove_snapp_customer_credentials.sql` فقط اطلاعات اتصال قدیمی اسنپ‌مارکت را حذف می‌کند؛ اطلاعات اکالا و جت و تمام حساب‌ها، موقعیت‌ها و تاریخچه حفظ می‌شوند. اسکن اسنپ‌مارکت حتی پیش از اعمال این migration نیز اطلاعات قدیمی را نمی‌خواند.

مقادیر محلی لازم (کلید رمزنگاری اطلاعات اکالا، ورود گوگل، ورود اکالا) را در `apps/worker/.dev.vars` بگذارید — نمونه در `apps/worker/.dev.vars.example`.

## ورود

- **Google:** ورود اصلی از طریق Better Auth انجام می‌شود؛ در حالت محلی نیز همین جریان کار می‌کند.
- **SnappMarket:** Worker به‌صورت خودکار نشست مهمان PWA را دریافت می‌کند. یک شناسه دستگاه و توکن در طول جمع‌آوری صفحات استفاده می‌شود؛ انقضا رعایت می‌شود و پس از پاسخ 401 فقط یک بار دسترسی تازه و همان صفحه دوباره درخواست می‌شود. توکن مهمان در مرورگر، لاگ یا اطلاعات اتصال کاربر ذخیره نمی‌شود. نسخه PWA در collector تنظیم شده است. آماده بودن دکمه اسکن به معنی تأیید ارتباط با فروشگاه نیست؛ خطای دریافت دسترسی یا پاسخ ناقص، اسکن را ناموفق می‌کند و نتیجه موفق قبلی حفظ می‌شود.
- **ورود با پیامک اکالا:** برای دریافت توکن اکالا با شماره موبایل، مقدار `OKALA_CLIENT_SECRET` باید در `apps/worker/.dev.vars` (محلی) یا متغیرهای سکرت Worker (استقرار) تنظیم شده باشد. کد پیامک ذخیره نمی‌شود؛ access token و refresh token با `BOX_KEY` رمزنگاری می‌شوند و هنگام اسکن به‌صورت خودکار تازه می‌شوند.

## استقرار

```bash
pnpm cf:deploy
```

فایل‌های استاتیک وب (`apps/web/out`) به‌عنوان assets کنار Worker منتشر می‌شوند؛ API و وب هم‌مبدا هستند.

## بررسی

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Formatting and Git hooks

`pnpm install` installs the Husky hooks through the `prepare` script. Before each
commit, lint-staged formats staged files with Prettier and includes those formatting
changes in the commit, then runs `pnpm typecheck` and `pnpm test`. Unsupported file
types and generated output are skipped; a failed check stops the commit.

Use `pnpm format` to format the repository or `pnpm format:check` to check formatting
without changing files. Formatting rules are in `.prettierrc.json`, with generated
files excluded by `.prettierignore`.

## SnappMarket validation — 2026-10-07

- Exact `/market-party/{latitude}/{longitude}` feed at the existing Tehran sample location: HTTP 401 without authorization. The public PWA guest-token request returned HTTP 200, `data.access_token`, and `expires_in: 259200`; the same feed with that guest returned HTTP 200, `status: true`, and 34 of 34 vendors.
- The modified collector was then run against the live service from the local Node environment: one guest request and one complete feed page, 33 vendors, 330 unique vendor/product records, and 32 eligible in-stock deals at the 40% threshold. These are separate live observations; the feed changes over time.
- `pnpm typecheck`, `pnpm test` (69 Worker and 8 shared tests), `pnpm build`, and `pnpm test:e2e` (14 desktop/mobile checks) passed. No requested check was blocked. Web unit tests use `passWithNoTests`; browser behavior is covered by Playwright.
- API persistence/migration regressions use in-memory SQLite through a D1 interface adapter with mocked auth sessions and upstream responses. Browser tests also use session/API fixtures. Live Snapp feed validation exercised the collector locally; a signed-in scan from the deployed Worker and the external Better Buy Google OAuth flow were not exercised.

## Deployment — 2026-10-07

- Published the Worker and static frontend to [Better Buy](https://better-buy.better-buy-worker.workers.dev), version `b2c460f6-e030-4509-853b-dfc93f1be340`, serving 100% of traffic. The static export build and Wrangler deployment dry run passed; existing remote variables and secrets were retained.
- Applied `0005_remove_snapp_customer_credentials.sql` to the configured remote D1 database after publishing the new code. It removed 14 legacy Snapp settings rows. The 8 Okala settings rows, 26 locations, 162 scans, 15,784 deals, 19 users, and 19 accounts remained present with unchanged counts. No pending migrations remain.
- Recorded a D1 Time Travel recovery bookmark and the prior Worker version locally in `apps/worker/.data/deployment-recovery.json` before release.
- Live smoke checks passed: root page and matching deployed page bundle HTTP 200; `/healthz` HTTP 200; signed-out `/api/me`, Okala settings, and scan submission HTTP 401; dev-only test login HTTP 404. The deployed page bundle matches the local build and contains no Snapp credential-route references. A signed-in production scan remains outside these smoke checks.
