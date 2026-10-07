import { AnimatePresence, motion } from "framer-motion";
import type {
  DealGroupRecord,
  DealRecord,
  ScanRecord,
} from "@better-buy/shared";
import type { ConnectionState } from "../dashboard/types";
import { faNumber } from "../dashboard/format";
import { Icon } from "../dashboard/Icon";
import { EmptyState } from "../dashboard/EmptyStates";
import { DealRow } from "./DealRow";
import type { useDealFilters } from "./useDealFilters";
export function DealShelf({
  filters,
  scan,
  threshold,
  busy,
  dealGroups,
  deals,
  connection,
  handleScanAction,
}: {
  filters: ReturnType<typeof useDealFilters>;
  scan: ScanRecord | null;
  threshold: number;
  busy: boolean;
  dealGroups: DealGroupRecord[];
  deals: DealRecord[];
  connection: ConnectionState;
  handleScanAction: () => void;
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
    filtersOpen,
    setFiltersOpen,
    vendors,
    visible,
    counts,
  } = filters;
  return (
    <>
      <section className="summary" aria-label="خلاصه اسکن">
        <button
          onClick={() => setStateFilter("all")}
          className={stateFilter === "all" ? "active" : ""}
          aria-pressed={stateFilter === "all"}
        >
          <span>محصول روی قفسه</span>
          <strong>{faNumber.format(counts.all)}</strong>
        </button>
        <button
          onClick={() => setStateFilter("new")}
          className={stateFilter === "new" ? "active" : ""}
          aria-pressed={stateFilter === "new"}
        >
          <span>تازه پیدا شده</span>
          <strong>{faNumber.format(counts.new)}</strong>
        </button>
        <button
          onClick={() => setStateFilter("still_available")}
          className={stateFilter === "still_available" ? "active" : ""}
          aria-pressed={stateFilter === "still_available"}
        >
          <span>هنوز موجود</span>
          <strong>{faNumber.format(counts.still)}</strong>
        </button>
        <button
          onClick={() => setStateFilter("no_longer_present")}
          className={stateFilter === "no_longer_present" ? "active" : ""}
          aria-pressed={stateFilter === "no_longer_present"}
        >
          <span>ناپدید شده</span>
          <strong>{faNumber.format(counts.gone)}</strong>
        </button>
      </section>
      <section className="deal-section">
        <div className="deal-heading">
          <div>
            <h1>
              {stateFilter === "no_longer_present"
                ? "تخفیف‌های ناپدیدشده"
                : `تخفیف‌های ${faNumber.format(scan?.threshold ?? threshold)}٪ به بالا`}
            </h1>
            <p>
              {scan?.status === "succeeded"
                ? `${faNumber.format(scan.vendorCount)} فروشگاه و ${faNumber.format(scan.productCount)} کالا بررسی شد · ${faNumber.format(dealGroups.length)} محصول منحصربه‌فرد از ${faNumber.format(deals.length)} پیشنهاد فروشگاهی.`
                : "نتیجه آخرین اسکن موفق اینجا می‌نشیند."}
            </p>
          </div>
          <div
            className="filters"
            onKeyDown={(event) => {
              if (event.key === "Escape") setFiltersOpen(false);
            }}
          >
            <label className="search">
              <Icon name="search" />
              <input
                aria-label="جست‌وجوی کالا یا فروشگاه"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جست‌وجوی کالا یا فروشگاه"
              />
            </label>
            <button
              className={`filter-trigger ${vendor !== "all" || minPrice || sort !== "discount" ? "active" : ""}`}
              type="button"
              aria-expanded={filtersOpen}
              aria-label="فیلترها و مرتب‌سازی"
              title="فیلترها و مرتب‌سازی"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Icon name={filtersOpen ? "close" : "filter"} />
              <span className="sr-only">فیلترها و مرتب‌سازی</span>
            </button>
            <AnimatePresence initial={false}>
              {filtersOpen && (
                <motion.div
                  className="filter-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget)
                      setFiltersOpen(false);
                  }}
                >
                  <motion.section
                    className="filter-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-label="فیلترها و مرتب‌سازی"
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    <div className="filter-dialog-heading">
                      <strong>فیلترها و مرتب‌سازی</strong>
                      <button
                        type="button"
                        onClick={() => setFiltersOpen(false)}
                        aria-label="بستن فیلترها"
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                    <label>
                      فروشگاه
                      <select
                        value={vendor}
                        onChange={(e) => setVendor(e.target.value)}
                        aria-label="فروشگاه"
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
                        aria-label="حداقل قیمت"
                      >
                        <option value="0">همه قیمت‌ها</option>
                        <option value="100000">بالای ۱۰۰ هزار تومان</option>
                        <option value="200000">بالای ۲۰۰ هزار تومان</option>
                        <option value="300000">بالای ۳۰۰ هزار تومان</option>
                        <option value="400000">بالای ۴۰۰ هزار تومان</option>
                      </select>
                    </label>
                    <label>
                      مرتب‌سازی
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                        aria-label="مرتب‌سازی"
                      >
                        <option value="discount">بیشترین تخفیف</option>
                        <option value="price">کمترین قیمت</option>
                        <option value="stock">بیشترین موجودی</option>
                      </select>
                    </label>
                    <button
                      className="filter-apply"
                      type="button"
                      onClick={() => setFiltersOpen(false)}
                    >
                      اعمال فیلتر
                    </button>
                  </motion.section>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        {busy ? (
          <div className="empty">
            <div className="loading-bar" />
            <h2>قفسه در حال آماده‌شدن است</h2>
          </div>
        ) : visible.length ? (
          <div className="deal-list">
            {visible.map((group) => (
              <DealRow
                key={`${group.key}-${group.state}`}
                group={group}
                source={scan?.source ?? "snappmarket"}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            connection={connection}
            hasDeals={dealGroups.length > 0}
            onAction={handleScanAction}
            onClearFilters={() => {
              setQuery("");
              setStateFilter("all");
              setVendor("all");
              setMinPrice(0);
            }}
          />
        )}
      </section>
    </>
  );
}
