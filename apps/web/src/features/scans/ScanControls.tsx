import type { LocationRecord } from "@better-buy/shared";
import type { DealSource } from "../dashboard/types";
import { faNumber } from "../dashboard/format";
import { Panel } from "../dashboard/Primitives";
export function ScanControls({
  locations,
  selected,
  source,
  threshold,
  blocked,
  submitting,
  hasSnapshot,
  onLocation,
  onSource,
  onThreshold,
  onStart,
}: {
  locations: LocationRecord[];
  selected: string;
  source: DealSource;
  threshold: number;
  blocked: boolean;
  submitting: boolean;
  hasSnapshot: boolean;
  onLocation: (id: string) => void;
  onSource: (source: DealSource) => void;
  onThreshold: (n: number) => void;
  onStart: () => void;
}) {
  return (
    <section className="scan-controls" aria-label="موقعیت و تخفیف‌ها">
      <label className="feed-location">
        موقعیت تحویل
        <select
          id="selected-location"
          value={selected}
          onChange={(e) => onLocation(e.target.value)}
          aria-label="موقعیت تحویل"
        >
          {!selected && <option value="">یک موقعیت اضافه کنید</option>}
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <div className="feed-actions">
        <Panel title="تنظیمات تخفیف‌ها" trigger={<button>تنظیمات</button>}>
          {source === "digikalajet" ? (
            <div className="historical-source">
              <strong>دیجی‌کالا جت · فقط مشاهده</strong>
              <button onClick={() => onSource("snappmarket")}>
                بازگشت به تخفیف‌ها
              </button>
            </div>
          ) : (
            <>
              <label>
                فروشگاه
                <select
                  value={source}
                  onChange={(e) =>
                    onSource(
                      e.target.value === "okala" ? "okala" : "snappmarket"
                    )
                  }
                >
                  <option value="snappmarket">اسنپ‌مارکت</option>
                  <option value="okala">اکالا</option>
                </select>
              </label>
              <label>
                حداقل درصد تخفیف
                <select
                  aria-label="حداقل درصد تخفیف"
                  value={threshold}
                  onChange={(e) => onThreshold(Number(e.target.value))}
                >
                  {[
                    ...new Set([
                      threshold,
                      ...(source === "okala"
                        ? [30, 35, 40, 45, 50]
                        : [15, 20, 25, 30, 35, 40, 45, 50]),
                    ]),
                  ]
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <option key={n} value={n}>
                        {faNumber.format(n)}٪ به بالا
                      </option>
                    ))}
                </select>
              </label>
              <p className="muted">
                این تنظیمات در به‌روزرسانی بعدی استفاده می‌شوند.
              </p>
            </>
          )}
        </Panel>
        <button
          className="primary scan-button"
          disabled={blocked || source === "digikalajet"}
          onClick={onStart}
        >
          {submitting
            ? "در حال شروع…"
            : hasSnapshot
              ? "به‌روزرسانی تخفیف‌ها"
              : "پیدا کردن تخفیف‌ها"}
        </button>
      </div>
    </section>
  );
}
