import type {
  DealGroupRecord,
  DealRecord,
  ScanRecord,
} from "@better-buy/shared";
import { Panel } from "../dashboard/Primitives";
import type { DealSource } from "../dashboard/types";
import { faDate, faNumber, sourceLabel } from "../dashboard/format";
import { DealRow } from "./DealRow";
import type { useDealFilters } from "./useDealFilters";
import type { useScanLedger } from "../scans/useScanLedger";
export function DealShelf({
  filters,
  scan,
  threshold,
  source,
  busy,
  results,
  hasResults,
  dealGroups,
  deals,
  historical,
}: {
  filters: ReturnType<typeof useDealFilters>;
  scan: ScanRecord | null;
  threshold: number;
  source: DealSource;
  busy: boolean;
  results: ReturnType<typeof useScanLedger>["results"];
  hasResults: boolean;
  dealGroups: DealGroupRecord[];
  deals: DealRecord[];
  historical: boolean;
}) {
  const {
    query,
    setQuery,
    stateFilter,
    setStateFilter,
    vendor,
    setVendor,
    minPrice,
    setMinPrice,
    sort,
    setSort,
    vendors,
    visible,
    counts,
    activeCount,
    reset,
  } = filters;
  return (
    <section className="deal-section" aria-labelledby="offers-title">
      <header className="section-heading">
        <div>
          <h1 id="offers-title">{historical ? "نتیجه تاریخی" : "پیشنهادها"}</h1>
          <p>
            {scan
              ? `${scan.locationName} · ${sourceLabel(scan.source)} · حداقل ${faNumber.format(scan.threshold)}٪`
              : `حداقل ${faNumber.format(threshold)}٪ تخفیف`}
          </p>
          {scan && (
            <p className="snapshot-time">
              <time dateTime={scan.finishedAt ?? scan.createdAt}>
                {faDate.format(new Date(scan.finishedAt ?? scan.createdAt))}
              </time>
              {results.error && hasResults && (
                <strong> · نتیجه ذخیره‌شده؛ تازه‌سازی نشد</strong>
              )}
            </p>
          )}
        </div>
        {hasResults && (
          <details className="scan-details">
            <summary>جزئیات نتیجه</summary>
            <p>{faNumber.format(scan?.vendorCount ?? 0)} فروشگاه بررسی‌شده</p>
            <p>
              {faNumber.format(scan?.productCount ?? 0)} رکورد کالا ·{" "}
              {faNumber.format(deals.length)} پیشنهاد فروشگاهی
            </p>
            <p>نتیجه‌ها متعلق به زمان اسکن نمایش‌داده‌شده‌اند.</p>
          </details>
        )}
      </header>
      {results.error && (
        <div className="result-error" role="status">
          <div>
            <strong>
              {hasResults
                ? "تازه‌سازی نتیجه انجام نشد"
                : "نتیجه اسکن دریافت نشد"}
            </strong>
            <p>
              {hasResults
                ? "نتیجه ذخیره‌شده همین اسکن قابل مشاهده است."
                : "اسکن ذخیره شده است؛ برای دیدن پیشنهادها، نتیجه همین اسکن را دوباره دریافت کنید."}
            </p>
          </div>
          <button
            disabled={results.isFetching}
            onClick={() => void results.refetch()}
          >
            {results.isFetching ? "در حال دریافت…" : "دریافت دوباره نتیجه"}
          </button>
        </div>
      )}
      {source === "okala" && scan && (
        <p className="coverage-note">
          پیشنهادهای فهرست عمومی تبلیغاتی اکالا؛ این فهرست تمام کالاهای اکالا را
          پوشش نمی‌دهد.
        </p>
      )}
      {busy || (!!scan && !hasResults && results.isPending) ? (
        <div className="result-loading" role="status">
          <p>
            {scan ? "در حال دریافت نتیجه ذخیره‌شده…" : "در حال دریافت اطلاعات…"}
          </p>
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : !scan ? (
        <div className="empty">
          <h2>هنوز نتیجه‌ای برای این انتخاب ندارید</h2>
          <p>با «شروع اسکن» پیشنهادهای این موقعیت و فروشگاه را بررسی کنید.</p>
        </div>
      ) : !hasResults ? null : !dealGroups.length ? (
        <div className="empty">
          <h2>پیشنهادی با این حداقل تخفیف پیدا نشد</h2>
          <p>
            نتیجه اسکن کامل دریافت شده است. می‌توانید حداقل تخفیف را برای اسکن
            بعدی تغییر دهید.
          </p>
        </div>
      ) : (
        <>
          <div className="results-toolbar">
            <label className="search">
              جست‌وجو
              <input
                type="search"
                aria-label="جست‌وجوی کالا یا فروشگاه"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="نام کالا یا فروشگاه"
              />
            </label>
            <label className="sort-control">
              مرتب‌سازی
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="price">کمترین قیمت</option>
                <option value="discount">بیشترین تخفیف</option>
              </select>
            </label>
            <Panel
              title="فیلتر پیشنهادها"
              trigger={
                <button className="filter-trigger">
                  فیلترها
                  {activeCount > 0 && ` (${faNumber.format(activeCount)})`}
                </button>
              }
            >
              <label>
                فروشگاه عرضه‌کننده
                <select
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                >
                  <option value="all">همه فروشگاه‌ها</option>
                  {vendors.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                حداقل قیمت
                <select
                  value={minPrice}
                  onChange={(e) => setMinPrice(Number(e.target.value))}
                >
                  <option value="0">همه قیمت‌ها</option>
                  {[100000, 200000, 300000, 400000].map((n) => (
                    <option key={n} value={n}>
                      بیش از {faNumber.format(n)} تومان
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={reset}>پاک‌کردن فیلترها</button>
              <p className="muted">
                تغییر فیلتر فقط نتیجه همین اسکن را تغییر می‌دهد.
              </p>
            </Panel>
            {activeCount > 0 && (
              <button className="reset-filters" onClick={reset}>
                پاک‌کردن فیلترها
              </button>
            )}
          </div>
          <div className="feed-filters" aria-label="مقایسه با اسکن قبلی">
            {(
              [
                ["all", "همه پیشنهادها", counts.all],
                ["new", "پیشنهادهای جدید", counts.new],
                ["still_available", "در فهرست فعلی", counts.still],
                ["no_longer_present", "دیگر در این فهرست نیست", counts.gone],
              ] as const
            ).map(([state, label, count]) => (
              <button
                key={state}
                aria-pressed={stateFilter === state}
                onClick={() => setStateFilter(state)}
              >
                {label} <span>{faNumber.format(count)}</span>
              </button>
            ))}
          </div>
          <p className="result-count" role="status">
            {faNumber.format(visible.length)} محصول
            {results.isFetching && " · در حال تازه‌سازی"}
          </p>
          {visible.length ? (
            <div className="deal-list">
              {visible.map((group) => (
                <DealRow
                  key={`${scan.id}:${group.key}`}
                  group={group}
                  source={scan.source}
                />
              ))}
            </div>
          ) : (
            <div className="empty">
              <h2>چیزی با این فیلتر پیدا نشد</h2>
              <p>فیلترها را پاک کنید یا عبارت جست‌وجو را تغییر دهید.</p>
              <button onClick={reset}>پاک‌کردن فیلترها</button>
            </div>
          )}
          <p className="observation-note">
            قیمت و موجودی، مشاهده زمان اسکن است. پیش از خرید در فروشگاه بررسی
            کنید.
          </p>
          <button
            className="refresh-result"
            disabled={results.isFetching}
            onClick={() => void results.refetch()}
          >
            تازه‌سازی نتیجه
          </button>
        </>
      )}
    </section>
  );
}
