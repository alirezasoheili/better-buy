import { expect, test, type Page } from "@playwright/test";

type DashboardFixture = {
  locations?: unknown[];
  scans?: unknown[];
  dealGroups?: unknown[];
};

async function mockDashboard(page: Page, fixture: DashboardFixture = {}) {
  const snappRequests: string[] = [];
  const okalaRequests: string[] = [];
  const scanRequests: unknown[] = [];
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      json: {
        session: {
          id: "session-1",
          userId: "user-1",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        user: {
          id: "user-1",
          name: "کاربر آزمایشی",
          email: "test@example.com",
        },
      },
    });
  });
  await page.route("**/api/locations", async (route) => {
    await route.fulfill({
      json: {
        data: fixture.locations ?? [
          {
            id: "location-1",
            name: "خانه",
            latitude: 35.7,
            longitude: 51.4,
            isDefault: true,
          },
        ],
      },
    });
  });
  await page.route("**/api/settings/snappmarket**", async (route) => {
    snappRequests.push(route.request().method() + " " + route.request().url());
    await route.fulfill({ status: 404, json: { error: "NOT_FOUND" } });
  });
  await page.route("**/api/settings/okala**", async (route) => {
    okalaRequests.push(route.request().method() + " " + route.request().url());
    await route.fulfill({ status: 503, json: { error: "UNAVAILABLE" } });
  });
  await page.route("**/api/scans", async (route) => {
    if (route.request().method() === "POST") {
      scanRequests.push(route.request().postDataJSON());
      await route.fulfill({
        json: { data: { id: "scan-1", status: "queued" } },
      });
      return;
    }
    await route.fulfill({ json: { data: fixture.scans ?? [] } });
  });
  await page.route("**/api/scans/scan-1", async (route) => {
    await route.fulfill({
      json: {
        data: {
          id: "scan-1",
          locationId: "location-1",
          source:
            (scanRequests.at(-1) as { source?: string } | undefined)?.source ??
            "snappmarket",
          threshold: 40,
          status: "running",
          vendorCount: 0,
          productCount: 0,
        },
      },
    });
  });
  await page.route("**/api/scans/*/deals", async (route) => {
    await route.fulfill({ json: { data: [] } });
  });
  await page.route("**/api/scans/*/deal-groups", async (route) => {
    await route.fulfill({ json: { data: fixture.dealGroups ?? [] } });
  });
  return { snappRequests, okalaRequests, scanRequests };
}

test("guides a first-time user to location and credential-free Snapp or Okala scanning", async ({
  page,
}) => {
  const requests = await mockDashboard(page, { locations: [] });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "برای اولین اسکن آماده شوید" })
  ).toBeVisible();
  await expect(page.getByText("محصول روی قفسه")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "افزودن موقعیت تحویل" })
  ).toBeVisible();
  await expect(
    page.getByText(
      "پس از انتخاب موقعیت، اسکن اسنپ‌مارکت یا اکالا را شروع کنید؛ نیازی به ورود به فروشگاه یا وارد کردن توکن نیست."
    )
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "اتصال اسنپ‌مارکت" })
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "اتصال اکالا" })).toHaveCount(
    0
  );
  expect(requests.snappRequests).toEqual([]);
});

test("a fresh signed-in user with a location starts Snapp without credential setup", async ({
  page,
}) => {
  const requests = await mockDashboard(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "برای اولین اسکن آماده شوید" })
  ).not.toBeVisible();
  const scanButton =
    page.viewportSize()!.width <= 720
      ? page.locator(".mobile-scan")
      : page.locator(".scan-button");
  await expect(scanButton).toContainText("اسکن تخفیف‌ها");
  await expect(scanButton).toBeEnabled();
  await scanButton.click();
  await expect(page.getByText("اسکن در جریان است")).toBeVisible();
  expect(requests.scanRequests).toEqual([
    {
      locationId: "location-1",
      threshold: 40,
      source: "snappmarket",
      mode: "partial",
    },
  ]);
  expect(requests.snappRequests).toEqual([]);
});

test("Snapp settings explain automatic access without any credential-entry fields", async ({
  page,
}) => {
  const requests = await mockDashboard(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "تنظیمات فروشگاه", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "تنظیمات اسنپ‌مارکت" })
  ).toBeVisible();
  await expect(
    page.getByText(
      "برای اسکن اسنپ‌مارکت نیازی به ورود یا وارد کردن توکن نیست.",
      { exact: true }
    )
  ).toBeVisible();
  await expect(
    page.locator(
      ".settings-page input, .settings-page textarea, .settings-page form"
    )
  ).toHaveCount(0);
  expect(requests.snappRequests).toEqual([]);
});

test("a fresh signed-in user starts Okala without settings or customer setup", async ({
  page,
}) => {
  const requests = await mockDashboard(page);
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "فروشگاه", exact: true })
    .selectOption("okala");
  const scanButton =
    page.viewportSize()!.width <= 720
      ? page.locator(".mobile-scan")
      : page.locator(".scan-button");
  await expect(scanButton).toContainText("اسکن اکالا");
  await expect(scanButton).toBeEnabled();
  await expect(page.locator(".rail-foot")).toContainText(
    "بدون نیاز به ورود اکالا"
  );
  await scanButton.click();
  await expect(page.getByText("اسکن در جریان است")).toBeVisible();
  expect(requests.scanRequests).toEqual([
    {
      locationId: "location-1",
      threshold: 40,
      source: "okala",
      mode: "partial",
    },
  ]);
  expect(requests.okalaRequests).toEqual([]);
});
test("Okala settings explain public access and campaign coverage without login fields", async ({
  page,
}) => {
  const requests = await mockDashboard(page);
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "فروشگاه", exact: true })
    .selectOption("okala");
  await page
    .getByRole("button", { name: "تنظیمات فروشگاه", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "تنظیمات اکالا" })
  ).toBeVisible();
  await expect(
    page.getByText("برای اسکن اکالا نیازی به ورود یا وارد کردن توکن نیست.", {
      exact: true,
    })
  ).toBeVisible();
  await expect(
    page.locator(
      ".settings-page input, .settings-page textarea, .settings-page form"
    )
  ).toHaveCount(0);
  await expect(
    page.getByText(/این فهرست شامل تمام کالاهای اکالا نیست/)
  ).toBeVisible();
  expect(requests.okalaRequests).toEqual([]);
});

test("a failed automatic Snapp scan keeps successful results and offers another scan", async ({
  page,
}) => {
  const requests = await mockDashboard(page, {
    scans: [
      {
        id: "previous",
        locationId: "location-1",
        locationName: "خانه",
        threshold: 40,
        source: "snappmarket",
        mode: "partial",
        status: "succeeded",
        createdAt: "2026-08-23T10:00:00.000Z",
        finishedAt: "2026-08-23T10:01:00.000Z",
        vendorCount: 1,
        productCount: 1,
        dealCount: 1,
      },
    ],
    dealGroups: [
      {
        key: "group-1",
        groupKeyVersion: 1,
        scanId: "previous",
        title: "پیشنهاد اسکن قبلی",
        image: null,
        categoryTitle: "خوراکی",
        priceRials: 100000,
        discountRials: 50000,
        finalPriceRials: 50000,
        discountRatio: 50,
        state: "new",
        vendors: [
          {
            offerKey: "10:1",
            productVariationId: "1",
            vendorId: "10",
            vendorTitle: "فروشگاه",
            vendorCode: null,
            priceRials: 100000,
            discountRials: 50000,
            finalPriceRials: 50000,
            discountRatio: 50,
            stock: 2,
            state: "new",
          },
        ],
      },
    ],
  });
  await page.route("**/api/scans/scan-1", async (route) => {
    await route.fulfill({
      json: {
        data: {
          id: "scan-1",
          locationId: "location-1",
          source: "snappmarket",
          threshold: 40,
          status: "failed",
          errorCode: "GUEST_AUTH_REJECTED",
          errorMessage:
            "دسترسی خودکار اسنپ‌مارکت برقرار نشد؛ بعداً دوباره اسکن کنید",
        },
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "پیشنهاد اسکن قبلی" })
  ).toBeVisible();
  const scanButton =
    page.viewportSize()!.width <= 720
      ? page.locator(".mobile-scan")
      : page.locator(".scan-button");
  await scanButton.click();
  await expect(
    page.getByText(
      "دسترسی خودکار اسنپ‌مارکت برقرار نشد؛ بعداً دوباره اسکن کنید"
    )
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "پیشنهاد اسکن قبلی" })
  ).toBeVisible();
  await expect(scanButton).toBeEnabled();
  await expect(scanButton).toContainText("اسکن تخفیف‌ها");
  await page.getByRole("button", { name: "بستن", exact: true }).click();
  await expect(
    page.getByText(
      "دسترسی خودکار اسنپ‌مارکت برقرار نشد؛ بعداً دوباره اسکن کنید"
    )
  ).toHaveCount(0);
  expect(requests.snappRequests).toEqual([]);
});

test("shows an actionable scan state and cycles theme modes", async ({
  page,
}) => {
  await mockDashboard(page);
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "اسکن تخفیف‌ها" })
  ).toBeVisible();
  const scanMetrics = await page.evaluate(() => ({
    stripWidth:
      document.querySelector(".scan-strip")?.getBoundingClientRect().width ?? 0,
    controlHeights: [
      ...document.querySelectorAll(
        ".scan-strip select, .scan-strip .scan-options-trigger, .scan-strip .scan-button"
      ),
    ]
      .map((element) => Math.round(element.getBoundingClientRect().height))
      .filter((height) => height > 0),
    viewportWidth: window.innerWidth,
  }));
  if (scanMetrics.viewportWidth > 1050)
    expect(scanMetrics.stripWidth).toBeLessThanOrEqual(1120);
  expect(new Set(scanMetrics.controlHeights).size).toBe(1);
  expect(scanMetrics.controlHeights[0]).toBe(44);
  await page.getByRole("button", { name: "اسکن تخفیف‌ها" }).click();
  await expect(page.getByText("اسکن در جریان است")).toBeVisible();

  await page.getByRole("button", { name: "تغییر پوسته" }).click();
  await page.getByRole("button", { name: "تغییر پوسته" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "تغییر پوسته" }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("theme")))
    .toBe("system");
});

test("shows scan results and lets users recover from an empty filter", async ({
  page,
}) => {
  await mockDashboard(page, {
    scans: [
      {
        id: "scan-1",
        locationId: "location-1",
        locationName: "خانه",
        threshold: 40,
        source: "snappmarket",
        mode: "partial",
        status: "succeeded",
        createdAt: "2026-08-23T10:00:00.000Z",
        startedAt: "2026-08-23T10:00:00.000Z",
        finishedAt: "2026-08-23T10:01:00.000Z",
        vendorCount: 1,
        productCount: 1,
        dealCount: 1,
        errorCode: null,
        errorMessage: null,
      },
    ],
    dealGroups: [
      {
        key: "group-1",
        groupKeyVersion: 1,
        scanId: "scan-1",
        title: "چای سیاه ایرانی",
        image: null,
        categoryTitle: "نوشیدنی",
        priceRials: 100000,
        discountRials: 50000,
        finalPriceRials: 50000,
        discountRatio: 50,
        state: "new",
        vendors: [
          {
            offerKey: "offer-1",
            productVariationId: "product-1",
            vendorId: "vendor-1",
            vendorTitle: "فروشگاه نمونه",
            vendorCode: null,
            priceRials: 100000,
            discountRials: 50000,
            finalPriceRials: 50000,
            discountRatio: 50,
            stock: 4,
            state: "new",
          },
        ],
      },
    ],
  });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "چای سیاه ایرانی" })
  ).toBeVisible();
  await expect(page.getByText("کمترین قیمت در فروشگاه نمونه")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "گزینه‌های اسکن" })
  ).toBeVisible();
  const filterButton = page.getByRole("button", {
    name: "فیلترها و مرتب‌سازی",
  });
  await filterButton.click();
  await expect(
    page.getByRole("dialog", { name: "فیلترها و مرتب‌سازی" })
  ).toBeVisible();
  const filterPosition = await page
    .locator(".filter-overlay")
    .evaluate((element) => getComputedStyle(element).position);
  expect(filterPosition).toBe(
    page.viewportSize()?.width && page.viewportSize()!.width <= 720
      ? "absolute"
      : "fixed"
  );
  await page.getByRole("button", { name: "اعمال فیلتر" }).click();
  const layout = await page.evaluate(() => {
    const rail = document
      .querySelector(".location-rail")
      ?.getBoundingClientRect();
    const workspace = document
      .querySelector(".workspace")
      ?.getBoundingClientRect();
    return {
      hasHorizontalOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
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
  await page
    .getByRole("textbox", { name: "جست‌وجوی کالا یا فروشگاه" })
    .fill("ناموجود");
  await expect(
    page.getByRole("heading", { name: "چیزی با این فیلتر پیدا نشد" })
  ).toBeVisible();
  await page.getByRole("button", { name: "پاک‌کردن فیلترها" }).click();
  await expect(
    page.getByRole("heading", { name: "چای سیاه ایرانی" })
  ).toBeVisible();
});

const completedRun = {
  id: "scan-1",
  locationId: "location-1",
  locationName: "خانه",
  source: "snappmarket",
  threshold: 40,
  mode: "partial",
  status: "succeeded",
  createdAt: "2026-10-07T12:00:00.000Z",
  startedAt: "2026-10-07T12:00:00.000Z",
  finishedAt: "2026-10-07T12:00:01.000Z",
  vendorCount: 1,
  productCount: 1,
  dealCount: 1,
  errorCode: null,
  errorMessage: null,
};
const shelfGroup = (title: string, scanId = "scan-1") => ({
  key: title,
  groupKeyVersion: 1,
  scanId,
  title,
  image: null,
  categoryTitle: "خوراکی",
  priceRials: 100000,
  discountRials: 50000,
  finalPriceRials: 50000,
  discountRatio: 50,
  state: "new",
  vendors: [
    {
      offerKey: "10:1",
      productVariationId: "1",
      vendorId: "10",
      vendorTitle: "فروشگاه",
      vendorCode: null,
      priceRials: 100000,
      discountRials: 50000,
      finalPriceRials: 50000,
      discountRatio: 50,
      stock: 2,
      state: "new",
    },
  ],
});

test("polls a successful scan to completion and stops after the terminal state", async ({
  page,
}) => {
  const requests = await mockDashboard(page);
  let completed = false;
  let polls = 0;
  await page.route("**/api/scans", async (route) => {
    if (route.request().method() === "POST") {
      requests.scanRequests.push(route.request().postDataJSON());
      await route.fulfill({
        json: { data: { id: "scan-1", status: "queued" } },
      });
    } else
      await route.fulfill({ json: { data: completed ? [completedRun] : [] } });
  });
  await page.route("**/api/scans/scan-1", async (route) => {
    polls++;
    completed = true;
    await route.fulfill({ json: { data: completedRun } });
  });
  await page.route("**/api/scans/scan-1/deal-groups", async (route) => {
    await route.fulfill({ json: { data: [shelfGroup("پیشنهاد تازه")] } });
  });
  await page.goto("/");
  const scanButton =
    page.viewportSize()!.width <= 720
      ? page.locator(".mobile-scan")
      : page.locator(".scan-button");
  await scanButton.click();
  await expect(
    page.getByRole("heading", { name: "پیشنهاد تازه" })
  ).toBeVisible();
  await expect(page.getByText("اسکن کامل شد؛ قفسه تازه است.")).toBeVisible();
  await expect(scanButton).toBeEnabled();
  await page.waitForTimeout(1500);
  expect(polls).toBe(1);
});

test("discards in-flight polling when the selected location changes", async ({
  page,
}) => {
  await mockDashboard(page, {
    locations: [
      {
        id: "location-1",
        name: "خانه",
        latitude: 35.7,
        longitude: 51.4,
        isDefault: true,
      },
      { id: "location-2", name: "دفتر", latitude: 35.72, longitude: 51.41 },
    ],
  });
  let polls = 0;
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/scans/scan-1", async (route) => {
    polls++;
    await pending;
    await route
      .fulfill({
        json: {
          data: {
            ...completedRun,
            status: "failed",
            errorMessage: "خطای مکان قبلی",
          },
        },
      })
      .catch(() => {});
  });
  await page.goto("/");
  const scanButton =
    page.viewportSize()!.width <= 720
      ? page.locator(".mobile-scan")
      : page.locator(".scan-button");
  await scanButton.click();
  await expect.poll(() => polls).toBe(1);
  if (page.viewportSize()!.width <= 720)
    await page
      .getByRole("combobox", { name: "انتخاب مکان" })
      .selectOption("location-2");
  else await page.locator(".location").filter({ hasText: "دفتر" }).click();
  await expect(page.locator(".scan-context strong")).toHaveText("دفتر");
  release();
  await page.waitForTimeout(1500);
  await expect(page.getByText("خطای مکان قبلی")).toHaveCount(0);
  await expect(page.getByText("اسکن در جریان است")).toHaveCount(0);
  expect(polls).toBe(1);
});

test("keeps a late ledger response from a previous provider out of the current shelf", async ({
  page,
}) => {
  await mockDashboard(page, { scans: [completedRun] });
  let requested = false;
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/scans/scan-1/deal-groups", async (route) => {
    requested = true;
    await pending;
    await route
      .fulfill({ json: { data: [shelfGroup("پیشنهاد اسنپ قبلی")] } })
      .catch(() => {});
  });
  await page.goto("/");
  await expect.poll(() => requested).toBe(true);
  await page
    .getByRole("combobox", { name: "فروشگاه", exact: true })
    .selectOption("okala");
  release();
  await expect(
    page.getByRole("combobox", { name: "فروشگاه", exact: true })
  ).toHaveValue("okala");
  await page.waitForTimeout(300);
  await expect(
    page.getByRole("heading", { name: "پیشنهاد اسنپ قبلی" })
  ).toHaveCount(0);
});

test("opens historical Jet results while keeping new Jet scans disabled", async ({
  page,
}) => {
  const historical = {
    ...completedRun,
    id: "jet-history",
    source: "digikalajet",
  };
  const requests = await mockDashboard(page, {
    scans: [historical],
    dealGroups: [shelfGroup("پیشنهاد تاریخی جت", "jet-history")],
  });
  await page.goto("/");
  await page.getByRole("button", { name: "تاریخچه اسکن", exact: true }).click();
  await page.locator(".run-row").click();
  await expect(
    page.getByRole("heading", { name: "پیشنهاد تاریخی جت" })
  ).toBeVisible();
  await expect(page.getByText("دیجی‌کالا جت · فقط مشاهده")).toBeVisible();
  const scanButton =
    page.viewportSize()!.width <= 720
      ? page.locator(".mobile-scan")
      : page.locator(".scan-button");
  await expect(scanButton).toBeDisabled();
  expect(requests.scanRequests).toEqual([]);
});

test("selects a remaining location after deleting the selected location", async ({
  page,
}) => {
  let locations = [
    {
      id: "location-1",
      name: "خانه",
      latitude: 35.7,
      longitude: 51.4,
      isDefault: true,
    },
    {
      id: "location-2",
      name: "دفتر",
      latitude: 35.72,
      longitude: 51.41,
      isDefault: false,
    },
  ];
  await mockDashboard(page);
  await page.route("**/api/locations", async (route) => {
    await route.fulfill({ json: { data: locations } });
  });
  await page.route("**/api/locations/location-1", async (route) => {
    locations = locations.filter((location) => location.id !== "location-1");
    await route.fulfill({ status: 204 });
  });
  await page.goto("/");
  await expect(page.locator(".scan-context strong")).toHaveText("خانه");
  if (page.viewportSize()!.width <= 720)
    await page.getByRole("button", { name: "ویرایش مکان انتخاب‌شده" }).click();
  else await page.getByRole("button", { name: "ویرایش خانه" }).click();
  await expect(
    page.getByRole("dialog", { name: "ویرایش مکان", exact: true })
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("location-editor.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "حذف مکان و تاریخچه" }).click();
  await page.getByRole("button", { name: "حذف همیشگی" }).click();
  await expect(page.locator(".scan-context strong")).toHaveText("دفتر");
  const scanButton =
    page.viewportSize()!.width <= 720
      ? page.locator(".mobile-scan")
      : page.locator(".scan-button");
  await expect(scanButton).toBeEnabled();
});

test("a failed automatic Okala scan keeps successful results and offers another scan", async ({
  page,
}) => {
  const requests = await mockDashboard(page, {
    scans: [
      {
        id: "previous",
        locationId: "location-1",
        locationName: "خانه",
        threshold: 40,
        source: "okala",
        mode: "partial",
        status: "succeeded",
        createdAt: "2026-08-23T10:00:00.000Z",
        finishedAt: "2026-08-23T10:01:00.000Z",
        vendorCount: 1,
        productCount: 1,
        dealCount: 1,
      },
    ],
    dealGroups: [
      {
        key: "group-1",
        groupKeyVersion: 1,
        scanId: "previous",
        title: "پیشنهاد اسکن قبلی",
        image: null,
        categoryTitle: "خوراکی",
        priceRials: 100000,
        discountRials: 50000,
        finalPriceRials: 50000,
        discountRatio: 50,
        state: "new",
        vendors: [
          {
            offerKey: "10:1",
            productVariationId: "1",
            vendorId: "10",
            vendorTitle: "فروشگاه",
            vendorCode: null,
            priceRials: 100000,
            discountRials: 50000,
            finalPriceRials: 50000,
            discountRatio: 50,
            stock: 2,
            state: "new",
          },
        ],
      },
    ],
  });
  await page.route("**/api/scans/scan-1", async (route) => {
    await route.fulfill({
      json: {
        data: {
          id: "scan-1",
          locationId: "location-1",
          source: "okala",
          threshold: 40,
          status: "failed",
          errorCode: "UPSTREAM_FORBIDDEN",
          errorMessage:
            "دسترسی خودکار اکالا برقرار نشد؛ بعداً دوباره اسکن کنید",
        },
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "فروشگاه", exact: true })
    .selectOption("okala");
  await expect(
    page.getByRole("heading", { name: "پیشنهاد اسکن قبلی" })
  ).toBeVisible();
  const scanButton =
    page.viewportSize()!.width <= 720
      ? page.locator(".mobile-scan")
      : page.locator(".scan-button");
  await scanButton.click();
  await expect(
    page.getByText("دسترسی خودکار اکالا برقرار نشد؛ بعداً دوباره اسکن کنید")
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "پیشنهاد اسکن قبلی" })
  ).toBeVisible();
  await expect(scanButton).toBeEnabled();
  await expect(scanButton).toContainText("اسکن اکالا");
  await page.getByRole("button", { name: "بستن", exact: true }).click();
  await expect(
    page.getByText("دسترسی خودکار اکالا برقرار نشد؛ بعداً دوباره اسکن کنید")
  ).toHaveCount(0);
  expect(requests.snappRequests).toEqual([]);
});
