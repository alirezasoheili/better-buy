import type { DealGroupRecord, ScanRecord } from "@better-buy/shared";
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
  historical: boolean;
}) {
  const { query, setQuery, sort, setSort, visible, reset } = filters;
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
              {faNumber.format(
                dealGroups.reduce((n, g) => n + g.vendors.length, 0)
              )}{" "}
              پیشنهاد فروشگاهی
            </p>
            <p>نتیجه‌ها متعلق به زمان اسکن نمایش‌داده‌شده‌اند.</p>
            {scan?.context == null && scan && (
              <p>
                موقعیت و پوشش تاریخی این نتیجه تأیید نشده؛ مقایسه زمانی انجام
                نمی‌شود.
              </p>
            )}
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
                : "به‌روزرسانی انجام شد و نتیجه ذخیره شده است؛ برای دیدن پیشنهادها، نتیجه همین اسکن را دوباره دریافت کنید."}
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
      {scan && (
        <p className="coverage-note">
          نتیجه‌ها از فهرست‌های تخفیف پشتیبانی‌شده‌اند و تمام کالاهای فروشگاه‌ها
          را پوشش نمی‌دهند.
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
          <p>با «پیدا کردن تخفیف‌ها» پیشنهادهای این موقعیت را دریافت کنید.</p>
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
            {query && <button onClick={reset}>پاک‌کردن جست‌وجو</button>}
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
              <h2>چیزی با این جست‌وجو پیدا نشد</h2>
              <p>عبارت جست‌وجو را پاک کنید یا تغییر دهید.</p>
              <button onClick={reset}>پاک‌کردن جست‌وجو</button>
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
