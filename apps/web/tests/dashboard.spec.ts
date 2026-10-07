import { expect, test, type Page } from "@playwright/test";

type DashboardFixture = {
  locations?: unknown[];
  snappReady?: boolean;
  scans?: unknown[];
  dealGroups?: unknown[];
};

async function mockDashboard(page: Page, fixture: DashboardFixture = {}) {
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      json: {
        session: { id: "session-1", userId: "user-1", expiresAt: "2099-01-01T00:00:00.000Z" },
        user: { id: "user-1", name: "کاربر آزمایشی", email: "test@example.com" },
      },
    });
  });
  await page.route("**/api/locations", async (route) => {
    await route.fulfill({
      json: {
        data: fixture.locations ?? [{ id: "location-1", name: "خانه", latitude: 35.7, longitude: 51.4, isDefault: true }],
      },
    });
  });
  await page.route("**/api/settings/snappmarket", async (route) => {
    await route.fulfill({ json: { data: { tokenConfigured: fixture.snappReady ?? false, tokenExpired: false, tokenExpiresAt: null } } });
  });
  await page.route("**/api/settings/okala", async (route) => {
    await route.fulfill({ json: { data: { tokenConfigured: false, tokenExpired: false, tokenExpiresAt: null } } });
  });
  await page.route("**/api/scans", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ json: { data: { id: "scan-1", status: "queued" } } });
      return;
    }
    await route.fulfill({ json: { data: fixture.scans ?? [] } });
  });
  await page.route("**/api/scans/*/deals", async (route) => {
    await route.fulfill({ json: { data: [] } });
  });
  await page.route("**/api/scans/*/deal-groups", async (route) => {
    await route.fulfill({ json: { data: fixture.dealGroups ?? [] } });
  });
}

test("guides a first-time user through location and store activation", async ({ page }) => {
  await mockDashboard(page, { locations: [] });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "برای اولین اسکن آماده شوید" })).toBeVisible();
  await expect(page.getByText("محصول روی قفسه")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "اتصال اسنپ‌مارکت" })).toBeVisible();
  await expect(page.getByRole("button", { name: "اتصال اکالا" })).toBeVisible();

  await page.getByRole("button", { name: "اتصال اسنپ‌مارکت" }).click();
  await expect(page.getByRole("heading", { name: "تنظیمات اسنپ‌مارکت" })).toBeVisible();
});

test("keeps the dashboard visible when a saved location needs a store connection", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "برای اولین اسکن آماده شوید" })).not.toBeVisible();
  const setupButton = page.viewportSize()!.width <= 720 ? page.locator(".mobile-scan") : page.locator(".scan-button");
  await expect(setupButton).toContainText("تنظیم اتصال");
  await expect(setupButton).toBeVisible();
});

test("shows an actionable scan state and cycles theme modes", async ({ page }) => {
  await mockDashboard(page, { snappReady: true });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "اسکن تخفیف‌ها" })).toBeVisible();
  const scanMetrics = await page.evaluate(() => ({
    stripWidth: document.querySelector(".scan-strip")?.getBoundingClientRect().width ?? 0,
    controlHeights: [...document.querySelectorAll(".scan-strip select, .scan-strip .scan-options-trigger, .scan-strip .scan-button")]
      .map((element) => Math.round(element.getBoundingClientRect().height))
      .filter((height) => height > 0),
    viewportWidth: window.innerWidth,
  }));
  if (scanMetrics.viewportWidth > 1050) expect(scanMetrics.stripWidth).toBeLessThanOrEqual(1120);
  expect(new Set(scanMetrics.controlHeights).size).toBe(1);
  expect(scanMetrics.controlHeights[0]).toBe(44);
  await page.getByRole("button", { name: "اسکن تخفیف‌ها" }).click();
  await expect(page.getByText("اسکن در جریان است")).toBeVisible();

  await page.getByRole("button", { name: "تغییر پوسته" }).click();
  await page.getByRole("button", { name: "تغییر پوسته" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "تغییر پوسته" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("system");
});

test("shows scan results and lets users recover from an empty filter", async ({ page }) => {
  await mockDashboard(page, {
    snappReady: true,
    scans: [{ id: "scan-1", locationId: "location-1", locationName: "خانه", threshold: 40, source: "snappmarket", mode: "partial", status: "succeeded", createdAt: "2026-08-23T10:00:00.000Z", startedAt: "2026-08-23T10:00:00.000Z", finishedAt: "2026-08-23T10:01:00.000Z", vendorCount: 1, productCount: 1, dealCount: 1, errorCode: null, errorMessage: null }],
    dealGroups: [{ key: "group-1", groupKeyVersion: 1, scanId: "scan-1", title: "چای سیاه ایرانی", image: null, categoryTitle: "نوشیدنی", priceRials: 100000, discountRials: 50000, finalPriceRials: 50000, discountRatio: 50, state: "new", vendors: [{ offerKey: "offer-1", productVariationId: "product-1", vendorId: "vendor-1", vendorTitle: "فروشگاه نمونه", vendorCode: null, priceRials: 100000, discountRials: 50000, finalPriceRials: 50000, discountRatio: 50, stock: 4, state: "new" }] }],
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "چای سیاه ایرانی" })).toBeVisible();
  await expect(page.getByText("کمترین قیمت در فروشگاه نمونه")).toBeVisible();
  await expect(page.getByRole("button", { name: "گزینه‌های اسکن" })).toBeVisible();
  const filterButton = page.getByRole("button", { name: "فیلترها و مرتب‌سازی" });
  await filterButton.click();
  await expect(page.getByRole("dialog", { name: "فیلترها و مرتب‌سازی" })).toBeVisible();
  const filterPosition = await page.locator(".filter-overlay").evaluate((element) => getComputedStyle(element).position);
  expect(filterPosition).toBe(page.viewportSize()?.width && page.viewportSize()!.width <= 720 ? "absolute" : "fixed");
  await page.getByRole("button", { name: "اعمال فیلتر" }).click();
  const layout = await page.evaluate(() => {
    const rail = document.querySelector(".location-rail")?.getBoundingClientRect();
    const workspace = document.querySelector(".workspace")?.getBoundingClientRect();
    return {
      hasHorizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
      railWidth: rail?.width ?? 0,
      viewportWidth: window.innerWidth,
      workspaceWidth: workspace?.width ?? 0,
    };
  });
  expect(layout.hasHorizontalOverflow).toBe(false);
  if (layout.viewportWidth > 720) {
    expect(layout.railWidth).toBeLessThanOrEqual(232);
    expect(layout.workspaceWidth).toBeGreaterThan(layout.railWidth);
  } else {
    await expect(page.locator(".mobile-scan")).toBeVisible();
  }
  await page.getByRole("textbox", { name: "جست‌وجوی کالا یا فروشگاه" }).fill("ناموجود");
  await expect(page.getByRole("heading", { name: "چیزی با این فیلتر پیدا نشد" })).toBeVisible();
  await page.getByRole("button", { name: "پاک‌کردن فیلترها" }).click();
  await expect(page.getByRole("heading", { name: "چای سیاه ایرانی" })).toBeVisible();
});
