import { expect, test, type Page } from "@playwright/test";

async function mockDashboard(page: Page) {
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
        data: [{ id: "location-1", name: "خانه", latitude: 35.7, longitude: 51.4, isDefault: true }],
      },
    });
  });
  await page.route("**/api/settings/snappmarket", async (route) => {
    await route.fulfill({ json: { data: { tokenConfigured: false, tokenExpired: false, tokenExpiresAt: null } } });
  });
  await page.route("**/api/settings/okala", async (route) => {
    await route.fulfill({ json: { data: { tokenConfigured: false, tokenExpired: false, tokenExpiresAt: null } } });
  });
  await page.route("**/api/scans", async (route) => {
    await route.fulfill({ json: { data: [] } });
  });
}

test("shows an actionable first-scan state and switches the Caffeine theme", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/");

  await expect(page.getByText("نیازمند راه‌اندازی")).toBeVisible();
  await expect(page.getByRole("button", { name: "تنظیم اتصال" }).first()).toBeVisible();

  await page.getByRole("button", { name: "تغییر پوسته" }).click();
  await page.getByRole("button", { name: "تغییر پوسته" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
