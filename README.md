# Better Buy

ابزار محلی برای پیدا کردن تخفیف‌های اسنپ‌مارکت، دیجی‌کالا جت و اکالا، و مقایسه آن‌ها بین اسکن‌های دستی.

یک بک‌اند واحد روی Cloudflare Worker اجرا می‌شود (Hono + D1 + Better Auth) و هم محلی و هم در استقرار، همین کد است.

## اجرا

```bash
pnpm install
pnpm dev
```

سپس [http://127.0.0.1:3000](http://127.0.0.1:3000) را باز کنید، با گوگل وارد شوید و از «تنظیمات اتصال» توکن فروشگاه موردنظر را ثبت کنید. API روی `127.0.0.1:8787` با `wrangler dev` اجرا می‌شود و داده‌ها در D1 محلی نگهداری می‌شوند.

برای اولین اجرا، migration های D1 را محلی اعمال کنید:

```bash
pnpm --filter @better-buy/worker exec wrangler d1 migrations apply better-buy --local
```

مقادیر محلی لازم (کلید رمزنگاری، ورود گوگل، ورود اکالا) را در `apps/worker/.dev.vars` بگذارید — نمونه در `apps/worker/.dev.vars.example`.

## ورود

- **Google:** ورود اصلی از طریق Better Auth انجام می‌شود؛ در حالت محلی نیز همین جریان کار می‌کند.
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
