# SnappMarket discount feeds and category APIs for Better Buy

Latest follow-up: see **Store-specific campaign follow-up: 20645 and 2192** below. Those requests used the user's supplied location and app version rather than the original Vanak probe.

Verified by direct live requests on 10 October 2026. Test location: public coordinates near Vanak, Tehran (`lat=35.7577`, `long=51.4095`). Counts and IDs below are observations, not constants. Inspection used the public site's 16 referenced JavaScript bundles plus small catalog requests. No customer login, OTP, orders, or account data were used.

## Main finding

Better Buy currently collects the vendor-grouped Market Party feed. Snapp also exposes ordinary discounted category products, homepage promotional collections, and per-store campaign collections. These offer useful additional discovery paths. They overlap; deduplicate using product ID plus store ID and retain source metadata. No exhaustive comparison against the current collector was performed, so the number of net-new offers is unknown.

Base URL: `https://svc.snapp.market`.

Common query parameters used successfully:

```text
client=PWA
deviceType=PWA
appVersion=1.403.1
lat=<selected latitude>
long=<selected longitude>
UDID=<one device UUID for the session>
```

Use `Accept: application/json`. Tests also sent `Origin: https://snapp.market`, `Referer: https://snapp.market/`, and a normal user-agent. These tests did not establish which optional headers are strictly required. The appVersion value works today; it is not a claim that this is the site's latest release. The website's inspected release was `ren-b8917940-mobile`.

## Verified endpoint map

All are GET except the two filter-configuration endpoints.

| Purpose                                                  | Endpoint                                                            | Tested parameters beyond common parameters                                                                                                                             | Access observed                                                    | Response                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Category tree                                            | `/express-search/categories`                                        | None                                                                                                                                                                   | No token; 200                                                      | `categories[]`, each with `id`, `title`, `slug`, `sub_categories[]`                                                |
| Discounted category discovery across stores              | `/express-search/v1/pb/products`                                    | `category_slug=dairy&filters=has_discount&page=0&size=5`                                                                                                               | No token; 200                                                      | `items[]`, `total`, `pagination`; item has price and discount, but no stock or complete vendor metadata in samples |
| Product-based category filter configuration              | `/express-search/mobile/search/page-configs/product_based_category` | POST JSON: `category_slug`, `configs:["sort","brand","filter"]`, `lat`, `long`                                                                                         | No token; 200                                                      | `filter`, `sort`, `brand`; explicitly exposes `has_discount`                                                       |
| Nearby store discovery                                   | `/express-vendor/general/vendors-list`                              | `sort=lowest_delivery_price&page=0&page_size=2&is_home=false&page_type=vendor_list&extra-filter[vendor_collection]=-1`                                                 | No token; 200                                                      | `data.finalResult[]`; `type=VENDOR`, store identity in `data`                                                      |
| Store categories                                         | `/mobile/search/categories`                                         | `vendorCode=<store code>`                                                                                                                                              | No token; 200                                                      | `items[]` with numeric category/subcategory IDs                                                                    |
| Discounted store category                                | `/express-search/product-list/vendor`                               | `vendor_code=<store code>&category_id=731205&filters=["has_discount"]&page=0&pageSize=5`                                                                               | No token; 200                                                      | `data.count`, `data.finalResult[].data`; includes stock, vendor ID, product ID, prices, categories                 |
| Store category filter configuration                      | `/express-search/mobile/search/page-configs/vendor_category`        | POST JSON: `vendor_code`, `category_id`, `configs:["sort","brand","filter"]`                                                                                           | No token; 200                                                      | `filter`, `sort`, `brand`; exposed `has_discount` and `expired_guarantee` in sample                                |
| Homepage campaign discovery                              | `/express-home/mobile/v3/user/new-home`                             | Common parameters; the site additionally sends `sourceOS`, `isStandAlone=0`, `modern_render=false`, `split_page=false`, `superType=4`, `extra-filter={"super_type":4}` | Anonymous 401; guest bearer 200                                    | `data.result[]`; campaign sections and banner metadata                                                             |
| Store campaign discovery and delivery                    | `/express-home/vendor/<store code>`                                 | `variable=<store code>`                                                                                                                                                | Guest bearer; 200                                                  | `vendorInfo`, `sections[]`; product-list sections have `value=<collection ID>`                                     |
| Campaign product discovery, product-based representation | `/express-search/product-list/<collection ID>/product-based`        | `page=0&page_size=3`                                                                                                                                                   | No token; 200 for two discovered collections                       | `items[]`, `total`, `page`, `page_size`; sample products had no stock and null `document_id`                       |
| Campaign products with concrete store and stock data     | `/express-search/mobile/v1/product/product-list`                    | `extra-filter=<JSON below>&page=0&page_size=5`                                                                                                                         | No token; 200                                                      | `data.count`, `data.finalResult[].data`; sample includes vendor object, stock, category, price and discount        |
| Campaign preview grouped by store                        | `/express-search/product-list/<collection ID>/vendor-based`         | `page=0&page_size=3`                                                                                                                                                   | No token; 200 for sale collection; another collection returned 204 | `vendors[].products[]`; includes stock and vendor IDs; sampled 10 products per store                               |
| Full-page store campaign browsing                        | `/express-search/product-list/<collection ID>/vendor/<store code>`  | `variable=<collection ID>&secondVariable=<store code>&page=0&page_size=5`                                                                                              | No token; 200 for sale collection                                  | `data.count`, `data.finalResult[].data`; includes stock, identities, price and categories                          |
| Market Party homepage preview                            | `/landing/market-party/<latitude>/<longitude>`                      | `deal_type=supermarket&isPro=false`                                                                                                                                    | Anonymous 401; guest bearer 200                                    | `data.products.List`, campaign timing and capacity; sampled 16 products                                            |
| Store Market Party products                              | `/market-party/<store code>`                                        | `variable=<store code>&page=0&page_size=3&isPro=false`                                                                                                                 | Guest bearer; 200                                                  | `data.products.List`, `PageSize`, `TotalCount`                                                                     |

The category filter POST operations only retrieve UI configuration; they do not change account or order state.

### Important parameter differences

- Product-based category browsing: `filters=has_discount` worked.
- Store category browsing: `filters=JSON.stringify(["has_discount"])` worked. A plain `filters=has_discount` returned HTTP 204 for both tested stores. Do not reuse one encoding for both APIs.
- Store category pages: the current site sends camelCase `pageSize`; the test returned 5 rows for `pageSize=5`.
- Store campaign pages: `page_size=5` returned 5 rows, with different rows on page 1.
- Cross-store campaign `/mobile/v1/product/product-list`: both `page_size=3` and `pageSize=3` returned 10 rows. Requested size was not honored in this test. Pages 0 and 1 differed. Do not calculate progress or offsets from the requested size.
- Store category uses `vendor_code`; store category discovery uses `vendorCode`.
- Global category IDs are arrays; store category IDs are numbers. Preserve this distinction.
- Some returned category `link` fields pointed at a development hostname. Construct calls against the verified production base URL using validated IDs; do not follow arbitrary response URLs.

## Live observations

- 19 top-level category entries were returned.
- Dairy without a discount filter reported `total=1660`.
- Dairy with `filters=has_discount` reported `total=386`. Ten sampled products over pages 0 and 1 had positive discounts and distinct product IDs.
- A store's dairy category reported 345 products unfiltered and 26 with the correctly encoded discount filter. Pages 0 and 1 each returned five distinct products, including concrete stock quantities.
- A dynamically discovered sale collection, titled `حراج روز پرتخفیف`, reported 6,254 rows through the older concrete-offer endpoint. The first two pages returned ten rows each with different IDs; the first page included roughly 68–69% discounts and actual store/stock fields.
- That collection's product-based endpoint separately reported `total=6544`. The totals differ; treat these as different representations, not interchangeable counts or an exhaustive-catalog guarantee.
- Store-specific sale browsing reported `count=847` and returned five distinct products on each tested page. Some had 40% and 30% discounts.
- Store-grouped sale browsing returned three stores per page, with different stores on page 1. Each sampled store included ten products. `total=3` repeated on both pages; it is not a reliable global store total here.
- `/express-search/v1/pb/products/<product ID>` returned product detail, not a complete list of store offers or stock. Do not mistake that endpoint for offer enumeration.
- `/bundles/carousel` returned HTTP 204 in the test. Its path exists, but no usable bundle payload was established here.

These are small live samples, not full scans. No end-of-pagination boundary or maximum page-size limit was established for the new feeds.

## Discover promotional collections dynamically

Homepage `data.result[]` entries with `section_type === "product-collection"` contain an `id` and title. Nested banner entries may contain a positive `product_collection_id` or `linkType === "product-collection"` with a `linkId`. Validate and deduplicate these IDs.

A guest-authorized store detail response contains `sections[]`. Select `type === "product-list"`, reading the positive numeric `value` as the collection ID.

Store sections observed included:

- `حراج روز پرتخفیف`
- `نوشیدنی پرتخفیف`
- `تنقلات پرتخفیف`
- `ماست و پنیر کف قیمت`
- `دست‌چینِ بهترین‌ها`
- `با قهوه می چسبه!`
- Brand promotional collections

Never hardcode today's campaign IDs. A promotional section's title does not guarantee that every returned item satisfies Better Buy's threshold. Keep the existing stock and discount rules.

Cross-store concrete campaign query:

```js
const extraFilter = {
  product_list_id: discoveredCollectionId,
  super_type_category_id: 0,
  super_type_brand_id: 0,
  new_home: true,
  chain_id: 0,
  vendor_id: 0,
};
// URLSearchParams should encode JSON.stringify(extraFilter) as "extra-filter".
```

## Runnable anonymous category example

PowerShell 7; run with the selected location's coordinates:

```powershell
curl.exe -G 'https://svc.snapp.market/express-search/v1/pb/products' `
  --data-urlencode 'category_slug=dairy' `
  --data-urlencode 'filters=has_discount' `
  --data-urlencode 'page=0' `
  --data-urlencode 'size=5' `
  --data-urlencode 'lat=35.7577' `
  --data-urlencode 'long=51.4095' `
  --data-urlencode 'client=PWA' `
  --data-urlencode 'deviceType=PWA' `
  --data-urlencode 'appVersion=1.403.1' `
  -H 'Accept: application/json'
```

## Example backend request helper

These examples demonstrate request construction, not a replacement for Better Buy's Effect HTTP policy. Integrate the verified paths into the existing request/timeout/retry services.

```ts
const apiBase = "https://svc.snapp.market";

async function snappGet(
  path: string,
  params: Record<string, string | number>,
  location: { latitude: number; longitude: number },
  guestToken?: string
) {
  const url = new URL(path, apiBase);
  const query = {
    client: "PWA",
    deviceType: "PWA",
    appVersion: "1.403.1",
    lat: location.latitude,
    long: location.longitude,
    ...params,
  };
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (guestToken) headers.Authorization = `Bearer ${guestToken}`;
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Snapp HTTP ${response.status}`);
  return response.json(); // Validate the endpoint-specific schema before use.
}

// Global category tree (anonymous).
const categoryTree = await snappGet("/express-search/categories", {}, location);

// Cross-store discounted product discovery (anonymous).
const discounted = await snappGet(
  "/express-search/v1/pb/products",
  {
    category_slug: selectedCategory.slug,
    filters: "has_discount",
    page: 0,
    size: 20, // Example size; only 3 and 5 were live-tested for this endpoint.
  },
  location
);

// Concrete discounted offers for a selected store/category (anonymous).
const storeOffers = await snappGet(
  "/express-search/product-list/vendor",
  {
    vendor_code: selectedStore.code,
    category_id: selectedStoreCategory.id,
    filters: JSON.stringify(["has_discount"]),
    page: 0,
    pageSize: 5,
  },
  location
);

// Guest session is the same customer-free access flow already used by Better Buy.
const store = await snappGet(
  `/express-home/vendor/${selectedStore.code}`,
  {
    variable: selectedStore.code,
  },
  location,
  guestToken
);
const saleSections = store.sections.filter(
  (section: { type: string; value: number }) =>
    section.type === "product-list" &&
    Number.isInteger(section.value) &&
    section.value > 0
);

// Concrete cross-store promotional offers (anonymous).
const campaignOffers = await snappGet(
  "/express-search/mobile/v1/product/product-list",
  {
    "extra-filter": JSON.stringify({
      product_list_id: selectedCollectionId,
      super_type_category_id: 0,
      super_type_brand_id: 0,
      new_home: true,
      chain_id: 0,
      vendor_id: 0,
    }),
    page: 0,
    page_size: 5, // Observed response still contained 10 rows; inspect actual rows.
  },
  location
);
```

`location`, selected IDs, and `guestToken` are application inputs, not credentials to ask the customer to paste. No generated guest bearer token is included in this guide. Better Buy already implements `/oauth2/default/token` with the public PWA client-credentials grant; reuse its session ownership and bounded renewal.

## Integration recommendation

1. Keep the working Market Party collector.
2. Add dynamically discovered campaign collections as a separate source or scan mode. The concrete-offer endpoint is a better fit than the product-only representation when Better Buy requires store identity and stock.
3. Add category browsing on demand, using the category tree and `has_discount` filter. Fetch concrete store-category offers when stock and exact store context are required.
4. Use store grouped campaign responses for discovery/previews, not proof of a full store catalog.
5. Preserve price units. In these schemas `discount` is an amount, while `discountRatio`/`discount_ratio` is a percentage. Compute the amount-based final price as `price - discount`; retain raw fields. Do not apply the discount percentage twice.
6. Preserve product/store identity. Do not merge different store offers by product ID alone. Product-only rows with missing store/stock metadata should remain discovery results until verified.
7. Retain original feed source, location, collection time, threshold, category, stock evidence, and campaign restrictions. Market Party may have timing/quantity caps; do not erase them when combining sources. Do not present Pro, coupon, or eligibility-specific benefits as universally available.
8. Use bounded pagination with duplicate-page detection, actual response sizes, and explicit incomplete results. Requested sizes and `total` fields are inconsistent between representations. Do not silently call a partial traversal complete.
9. Do not attach all category/store/campaign traversals to the existing 22-second collection phase. Prefer a selected category or selected campaign first; measure duration before broadening the scan. This guide does not establish that a full new feed fits the current Worker budget.

These are live public frontend endpoints with no verified partner API contract. Their availability and response schema can change. This discovery does not assert commercial republication rights.

## Sources inspected

- https://snapp.market/
- https://static.snapp.express/renaissance/ui/b8917940/js/main-4.eb9a7d812cdf13b8.js
- https://static.snapp.express/renaissance/ui/b8917940/js/main-5.83c10891f418f6da.js
- https://github.com/alirezasoheili/better-buy/blob/main/apps/worker/src/providers/snapp/collector.ts
- Direct read-only requests to the paths listed above, using the selected public test location.

## Verified categories and subcategories

| Category                  | Slug                         | ID array     | Subcategory count |
| ------------------------- | ---------------------------- | ------------ | ----------------- |
| محصولات کالابرگی          | `kalabarg`                   | `[99999999]` | 25                |
| لبنیات و بستنی            | `dairy`                      | `[731205]`   | 10                |
| تنقلات                    | `junk-food`                  | `[731206]`   | 11                |
| نوشیدنی                   | `beverages`                  | `[731215]`   | 11                |
| خواربار و نان             | `groceries-bread`            | `[731207]`   | 11                |
| میوه و سبزیجات تازه       | `fruits-vegetables`          | `[731211]`   | 2                 |
| آرایشی و بهداشتی          | `health-beauty`              | `[731210]`   | 12                |
| کودک و نوزاد              | `child-baby`                 | `[731209]`   | 5                 |
| دخانیات                   | `smoking`                    | `[731220]`   | 3                 |
| صبحانه                    | `breakfast`                  | `[731208]`   | 6                 |
| چاشنی و افزودنی           | `spice-seasoning`            | `[731212]`   | 6                 |
| کنسرو، غذای آماده و منجمد | `canned-prepared-food`       | `[731213]`   | 9                 |
| پروتیین و تخم مرغ         | `meat-egg`                   | `[731214]`   | 6                 |
| خشکبار، دسر و شیرینی      | `dried-fruits-nuts`          | `[731216]`   | 6                 |
| دستمال و شوینده           | `tissues-household-cleaning` | `[731217]`   | 6                 |
| خانه و سبک زندگی          | `home-lifestyle`             | `[731218]`   | 9                 |
| لوازم برقی و دیجیتال      | `digital-appliances`         | `[731219]`   | 7                 |
| مد و پوشاک                | `fashion`                    | `[731221]`   | 3                 |
| پت شاپ                    | `pet-shop`                   | `[731222]`   | 2                 |

IDs and slugs are a dated snapshot; discover them from the API in production. کالابرگ eligibility is a separate condition, not an ordinary product discount.

### محصولات کالابرگی

| Subcategory                    | Slug                     | ID     |
| ------------------------------ | ------------------------ | ------ |
| شیر                            | `milk`                   | 731224 |
| پنیر آشپزی                     | `pizza-cheese`           | 731225 |
| پنیر صبحانه                    | `cheese`                 | 731226 |
| ماست                           | `yogurt`                 | 731227 |
| قندو شکر و نبات                | `sugar`                  | 731244 |
| ماکارونی و لازانیا و رشته      | `pasta-spaghetti`        | 731245 |
| برنج                           | `rice`                   | 731247 |
| روغن پخت و پز و سالاد          | `cooking-salad-oil`      | 731249 |
| روغن سرخ کردنی                 | `frying-oil`             | 731250 |
| روغن زیتون                     | `olive-oil`              | 731251 |
| حبوبات و سویا                  | `legumes-soy`            | 731252 |
| مواد غذایی کودک                | `baby-food`              | 731262 |
| سبزیجات و صیفی جات تازه        | `vegetables`             | 731278 |
| میوه تازه                      | `fruit`                  | 731279 |
| خیارشور و زیتون                | `pickled-cucumber-olive` | 731283 |
| غذای نیمه آماده منجمد و یخچالی | `frozen-food`            | 731290 |
| کنسرو سبزیجات و حبوبات         | `canned-vegetables`      | 731292 |
| تخم مرغ و ماکیان               | `egg`                    | 731295 |
| گوشت قرمز                      | `meat`                   | 731296 |
| مرغ                            | `chicken`                | 731297 |
| ماهی و میگو                    | `fish-shrimp`            | 731299 |
| سایر گوشت ها                   | `other-meats`            | 731300 |
| قهوه و هات چاکلت               | `coffee`                 | 731306 |
| خرما                           | `date`                   | 731313 |
| لبنیات گیاهی                   | `plant-based-dairy`      | 731544 |

### لبنیات و بستنی

| Subcategory    | Slug                | ID     |
| -------------- | ------------------- | ------ |
| شیر            | `milk`              | 731224 |
| پنیر آشپزی     | `pizza-cheese`      | 731225 |
| پنیر صبحانه    | `cheese`            | 731226 |
| ماست           | `yogurt`            | 731227 |
| دوغ            | `doogh`             | 731228 |
| کره            | `butter`            | 731229 |
| خامه           | `cream`             | 731230 |
| کشک            | `whey`              | 731231 |
| بستنی و فالوده | `ice-cream`         | 731232 |
| لبنیات گیاهی   | `plant-based-dairy` | 731544 |

### تنقلات

| Subcategory             | Slug                       | ID     |
| ----------------------- | -------------------------- | ------ |
| شکلات و آبنبات و تافی   | `chocolate-candies-toffee` | 731233 |
| کیک و کلوچه             | `cakes-cookies`            | 731234 |
| بیسکویت و ویفر          | `biscuits-wafers`          | 731235 |
| پفک و اسنک              | `snacks`                   | 731236 |
| چیپس                    | `chips`                    | 731237 |
| پاپ کورن و گندمک        | `popcorn`                  | 731238 |
| آلوچه و لواشک           | `fruit-roll`               | 731239 |
| پاستیل و مارشمالو       | `pastilles-marshmallows`   | 731240 |
| آدامس و خوشبوکننده دهان | `gum-breath-freshener`     | 731241 |
| آجیل تک و مغز آجیل      | `nuts`                     | 731242 |
| بار و تنقلات مغذی       | `bar-nutritious-snacks`    | 731243 |

### نوشیدنی

| Subcategory                | Slug                 | ID       |
| -------------------------- | -------------------- | -------- |
| آب معدنی، طعم دار و گازدار | `water`              | 731301   |
| ماءالشعیر                  | `beer`               | 731302   |
| آبمیوه بدون گاز            | `juice`              | 731303   |
| چای سیاه                   | `black-tea`          | 731304   |
| چای سبز و دمنوش            | `green-herbal-tea`   | 731305   |
| قهوه و هات چاکلت           | `coffee`             | 731306   |
| نوشیدنی انرژی زا           | `energy-drink`       | 731307   |
| نوشابه                     | `soft-drink`         | 731308   |
| شربت                       | `syrup`              | 731309   |
| عرقیجات                    | `herbal-distillates` | 731310   |
| آبمیوه گازدار              | `carbonated-juice`   | 15000009 |

### خواربار و نان

| Subcategory               | Slug                | ID     |
| ------------------------- | ------------------- | ------ |
| قندو شکر و نبات           | `sugar`             | 731244 |
| ماکارونی و لازانیا و رشته | `pasta-spaghetti`   | 731245 |
| نان                       | `bread`             | 731246 |
| برنج                      | `rice`              | 731247 |
| رب                        | `paste`             | 731248 |
| روغن پخت و پز و سالاد     | `cooking-salad-oil` | 731249 |
| روغن سرخ کردنی            | `frying-oil`        | 731250 |
| روغن زیتون                | `olive-oil`         | 731251 |
| حبوبات و سویا             | `legumes-soy`       | 731252 |
| غلات                      | `cereal`            | 731253 |
| آرد و پودر سوخاری         | `flour-breadcrumbs` | 731254 |

### میوه و سبزیجات تازه

| Subcategory             | Slug         | ID     |
| ----------------------- | ------------ | ------ |
| سبزیجات و صیفی جات تازه | `vegetables` | 731278 |
| میوه تازه               | `fruit`      | 731279 |

### آرایشی و بهداشتی

| Subcategory          | Slug                   | ID     |
| -------------------- | ---------------------- | ------ |
| بهداشت زنان          | `womens-health`        | 731266 |
| شامپو و مراقبت مو    | `hair-care`            | 731267 |
| بهداشت جنسی          | `sexual-health`        | 731268 |
| بهداشت و مراقبت بدن  | `body-care`            | 731269 |
| بهداشت و مراقبت صورت | `face-care`            | 731270 |
| دستمال مرطوب         | `wipes`                | 731271 |
| آرایش مو             | `hair-styling`         | 731272 |
| بهداشت دهان و دندان  | `oral-health`          | 731273 |
| آرایشی و عطر و ادکلن | `beauty-perfume`       | 731274 |
| اصلاح صورت و بدن     | `shaving-hair-removal` | 731275 |
| صابون                | `soap`                 | 731276 |
| اسپری و ضدتعریق      | `deodorants-spray`     | 731277 |

### کودک و نوزاد

| Subcategory            | Slug                  | ID     |
| ---------------------- | --------------------- | ------ |
| اسباب بازی و بازی فکری | `toys-mental-game`    | 731261 |
| مواد غذایی کودک        | `baby-food`           | 731262 |
| بهداشت کودک            | `child-health`        | 731263 |
| لوازم کودک و نوزاد     | `baby-child-products` | 731264 |
| پوشک کودک              | `baby-diaper`         | 731265 |

### دخانیات

| Subcategory     | Slug                 | ID     |
| --------------- | -------------------- | ------ |
| سیگار           | `cigarettes`         | 731334 |
| توتون و تنباکو  | `tobacco`            | 731335 |
| ملزومات دخانیات | `tobacco-essentials` | 731337 |

### صبحانه

| Subcategory                   | Slug                           | ID     |
| ----------------------------- | ------------------------------ | ------ |
| غلات صبحانه                   | `breakfast-cereal`             | 731255 |
| مربا                          | `jam`                          | 731256 |
| عسل                           | `honey`                        | 731257 |
| حلوا ارده و شیره              | `halva-arde`                   | 731258 |
| شکلات صبحانه                  | `breakfast-chocolate`          | 731259 |
| کره بادام زمینی و کرم بیسکویت | `peanut-butter-cream-biscuits` | 731260 |

### چاشنی و افزودنی

| Subcategory            | Slug                     | ID     |
| ---------------------- | ------------------------ | ------ |
| سس                     | `sauce`                  | 731280 |
| زعفران                 | `saffron`                | 731281 |
| ادویه و افزودنی        | `spice`                  | 731282 |
| خیارشور و زیتون        | `pickled-cucumber-olive` | 731283 |
| ترشی و شور             | `pickles`                | 731284 |
| آبلیمو و سرکه و آبغوره | `liquid-seasoning`       | 731285 |

### کنسرو، غذای آماده و منجمد

| Subcategory                    | Slug                 | ID     |
| ------------------------------ | -------------------- | ------ |
| تون ماهی                       | `tuna-fish`          | 731286 |
| غذای نیمه آماده                | `ready-to-cook`      | 731287 |
| مایه غذا                       | `semi-prepared-food` | 731288 |
| غذای آماده مصرف                | `food-to-go`         | 731289 |
| غذای نیمه آماده منجمد و یخچالی | `frozen-food`        | 731290 |
| کمپوت                          | `compote`            | 731291 |
| کنسرو سبزیجات و حبوبات         | `canned-vegetables`  | 731292 |
| سبزیجات و صیفیجات منجمد        | `frozen-vegetables`  | 731293 |
| انواع خمیر                     | `dough`              | 731294 |

### پروتیین و تخم مرغ

| Subcategory      | Slug          | ID     |
| ---------------- | ------------- | ------ |
| تخم مرغ و ماکیان | `egg`         | 731295 |
| گوشت قرمز        | `meat`        | 731296 |
| مرغ              | `chicken`     | 731297 |
| سوسیس و کالباس   | `sausages`    | 731298 |
| ماهی و میگو      | `fish-shrimp` | 731299 |
| سایر گوشت ها     | `other-meats` | 731300 |

### خشکبار، دسر و شیرینی

| Subcategory      | Slug                  | ID     |
| ---------------- | --------------------- | ------ |
| آجیل و تخمه      | `nuts-seeds`          | 731311 |
| خشکبار و شیرینی  | `dried-fruits-sweets` | 731312 |
| خرما             | `date`                | 731313 |
| دسر              | `dessert`             | 731314 |
| ژله              | `jelly`               | 731315 |
| پودر کیک و پنکیک | `cake-powder`         | 731316 |

### دستمال و شوینده

| Subcategory                | Slug                   | ID     |
| -------------------------- | ---------------------- | ------ |
| دستمال کاغذی و توالت       | `tissues-toilet-paper` | 731317 |
| شستشوی ظروف                | `dish-washing`         | 731318 |
| شستشوی لباس                | `laundry-detergent`    | 731319 |
| فوم و مایع دستشویی         | `hand-wash-liquid`     | 731320 |
| نظافت خانه و آشپزخانه      | `household-cleaning`   | 731321 |
| نظافت حمام و سرویس بهداشتی | `toilet-cleaning`      | 731322 |

### خانه و سبک زندگی

| Subcategory           | Slug                      | ID       |
| --------------------- | ------------------------- | -------- |
| لوازم یکبارمصرف       | `disposable-supplies`     | 731323   |
| کیسه فریزر            | `freezer-bag`             | 731324   |
| کیسه زباله            | `garbage-bag`             | 731325   |
| لوازم پیک نیک و سفر   | `picnic-supplies`         | 731326   |
| لوازم خانه و آشپزخانه | `home-kitchen-appliances` | 731327   |
| کتاب و لوازم تحریر    | `stationery`              | 731328   |
| ابزار سلامت           | `healthtools`             | 731329   |
| ابزار و خودرو         | `health-tools`            | 731330   |
| لوازم خانه            | `home-goods`              | 15000024 |

### لوازم برقی و دیجیتال

| Subcategory                | Slug                          | ID       |
| -------------------------- | ----------------------------- | -------- |
| نور و روشنایی              | `lighting`                    | 731331   |
| باتری، محافظ و رابط        | `battery-power-strips`        | 731332   |
| لوازم برقی شخصی            | `personal-care-electronics`   | 731537   |
| کابل، شارژر و مبدل         | `cables-chargers-adapters`    | 731538   |
| هدفون، هدست و هندزفری      | `headphones-headsets-earbuds` | 731539   |
| تجهیزات ذخیره سازی اطلاعات | `data-storage-devices`        | 731541   |
| لوازم برقی آشپزخانه        | `kitchen-appliances`          | 15000018 |

### مد و پوشاک

| Subcategory | Slug        | ID     |
| ----------- | ----------- | ------ |
| لباس زیر    | `underwear` | 731338 |
| جوراب       | `socks`     | 731339 |
| پوشاک       | `clothing`  | 731340 |

### پت شاپ

| Subcategory          | Slug                     | ID     |
| -------------------- | ------------------------ | ------ |
| غذا و کنسرو حیوانات  | `animal-food`            | 731343 |
| لوازم بهداشت حیوانات | `animal-health-supplies` | 731345 |

## Store-specific campaign follow-up: 20645 and 2192

Direct live inspection on 10 October 2026, recorded at 13:25 UTC. This follow-up used the two user-supplied URLs, their location, `appVersion=1.403.17`, and `filters=[]`. The product requests succeeded anonymously with HTTP 200. Store-home checks used a public PWA guest bearer, with no customer login or checkout. These are observations of a changing upstream feed, not permanent catalog totals.

### Result

| Collection / store code | Store                            | Numeric vendor ID | Reported count / fetched rows | Unique product-store identities | Stock-backed offers at least 40% | Highest discount |
| ----------------------- | -------------------------------- | ----------------- | ----------------------------- | ------------------------------- | -------------------------------- | ---------------- |
| `20645 / 3kjwqk`        | یاران دریان، سازمان برنامه شمالی | `114444`          | 210 / 210                     | 209                             | 0                                | 31%              |
| `2192 / pz91qe`         | اسمارت ارم                       | `114458`          | 639 / 639                     | 621                             | 7                                | 45%              |

The first collection can contain worthwhile discounts while contributing nothing to Better Buy's existing 40% filter. Do not silently lower that filter to make an adapter look productive. The second collection provides seven qualifying candidates; it has not been compared against a simultaneous Market Party snapshot, so **seven net-new offers is not established**.

The seven qualifying identities in the second collection were:

| Product ID | Title                                            | Discount | Stock |
| ---------- | ------------------------------------------------ | -------- | ----- |
| `9631264`  | کیسه فریزر تجزیه پذیر چسبدار پتروکلین 100 عددی   | 45%      | 15    |
| `5983470`  | کیسه فریزر تجزیه پذیر رولی پتروکلین 200 عددی     | 45%      | 36    |
| `9631293`  | سفره یکبار مصرف پرفرژدار پتروکلین 50 متری        | 45%      | 11    |
| `9704355`  | کیسه فریزر یادداشتی ضخیم پتروکلین 250 عددی       | 45%      | 17    |
| `9677321`  | سفره یکبار مصرف پرفرژدار طرحدار پتروکلین 50 متری | 45%      | 8     |
| `5984388`  | کیسه فریزر تجزیه پذیر بزرگ پتروکلین 100 عددی     | 45%      | 20    |
| `15104492` | نکتار انبه رانی 300 میلی لیتری                   | 40%      | 12    |

### Contract and pagination

```text
GET /express-search/product-list/{collectionId}/vendor/{vendorCode}
page=0
page_size=100
variable={collectionId}
secondVariable={vendorCode}
filters=[]
+ common PWA and selected-location parameters
```

Collection ID and store code are separate inputs: this is a collection within a specific store, not a request for every discounted product in that store. Discover current collections from the store's home sections rather than hardcoding these two collection IDs for all vendors.

Parse the product response as `data.finalResult[]`, selecting rows with `type=PRODUCT` and reading their nested `data`. Observed product fields include `id`, `vendor_id`, `document_id`, `price`, `discount`, `discountRatio`, `stock`, `title`, and category IDs. In these responses, `discount` is the amount deducted from `price`; compute final price as `price - discount`. Amount-derived percentage agreed with `discountRatio` within 0.1 percentage point throughout the fetched rows. Example: product `9631264` had price `390000`, discount `175500`, final price `214500`, and 45% discount. Keep existing validated currency-unit handling.

Unlike the previously sampled cross-store concrete campaign route, **these two store-specific requests honored `page_size=100`**:

| Collection | Returned row counts by page, including empty terminal | Requests including terminal |
| ---------- | ----------------------------------------------------- | --------------------------- |
| `20645`    | 100, 100, 10, 0                                       | 4                           |
| `2192`     | 100, 100, 100, 100, 100, 100, 39, 0                   | 8                           |

At size 10, boundary checks returned 10 rows on page 20 and zero on page 21 for collection 20645; nine rows on page 63 and zero on page 64 for collection 2192. These checks support the observed offset behavior for this pair. They do not prove every collection honors the requested size or that pagination is immutable.

There was one duplicate identity in the first enumeration and 18 in the second. All numbered pages through an empty terminal were fetched; deduplication produced 209 and 621 identities. Preserve raw count, unique count, duplicate count, observed page size, and terminal status separately. A raw upstream count differing from unique count does not by itself prove missing pages. Duplicates could originate in the feed or from changes during offset pagination; this probe did not establish their cause. Use product ID plus numeric vendor ID for merging. Detect replayed pages and conflicting repeated prices or stock; ambiguous coverage must not imply an offer disappeared.

### Ownership and delivery checks

`GET /express-home/vendor/{vendorCode}?variable={vendorCode}` returned a **root-level** `vendorInfo` and `sections`, not `data.vendorInfo`. Use a separate validated response schema from the product-list schema.

For each requested code, `vendorInfo.id` matched every product row's `vendor_id`: `3kjwqk → 114444`, `pz91qe → 114458`. Every observed `document_id` also matched its product/vendor identity. Each store's `vendorInfo.deliveryData.doesDeliver` was true at the supplied location; its delivery ID and nested detail vendor ID matched the same numeric owner. This establishes consistent ownership and reported delivery for these samples, resolving those particular uncertainties for this route. It does not resolve the conflicting IDs in the earlier cross-store Rani investigation.

Guest-visible price and positive stock are established; full discount conditions or checkout applicability are not. Do not interpret a delivery method's `is_pro` flag as proof that a product discount requires Pro, and do not interpret an empty product badge list as proof that it is unconditional. Retain existing benefit/eligibility rules until verified using relevant public product or campaign metadata.

### Concrete S05 implementation follow-up

1. Add a store-specific collection adapter to the existing enrichment boundary. Keep the one automatic discount feed and its 40% default; collection/category selection remains backend discovery.
2. Start with these two captured contracts as evidence cases, then discover collection IDs from location-scoped store-home sections. Validate code-to-numeric ownership and delivery using the home schema before accepting rows.
3. Request bounded 100-row pages where honored. Track actual returned sizes, terminal pages, duplicates, conflicting observations, HTTP/schema errors, elapsed time, and request budget. Store-specific pagination behavior must have its own handling rather than inheriting the cross-store route's ten-row assumption.
4. Normalize stock, amount/percentage agreement, price units, identities, provenance, and eligibility through the existing offer pipeline. Deduplicate both within the adapter and against Market Party by product/store identity. Do not inflate the displayed count with duplicate source records.
5. Run a same-location, same-threshold baseline comparison in one scan window. Report qualifying candidates, overlap, unique additions, and unresolved eligibility separately. This is the check that determines whether users actually see more offers.
6. Add meaningful regressions for root-level vendor home, ownership mismatch, duplicate/conflicting rows, page replay, bounded termination, and merging the same offer from two sources. Enable only the verified coverage and eligibility scope after these checks. A collection with zero qualifying offers is a valid result.

These findings update the API evidence only. No Better Buy source code, feature flag, deployment, or customer account was changed by this inspection.
