import type { LocationRecord } from "@better-buy/shared";
import type { DealSource } from "../dashboard/types";
import { faNumber } from "../dashboard/format";
export function ScanControls({
  locations,
  selected,
  source,
  threshold,
  blocked,
  submitting,
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
  onLocation: (id: string) => void;
  onSource: (source: DealSource) => void;
  onThreshold: (n: number) => void;
  onStart: () => void;
}) {
  return (
    <section className="scan-controls" aria-label="موقعیت و شروع اسکن">
      <div className="context-fields">
        <label>
          موقعیت تحویل
          <select
            id="selected-location"
            value={selected}
            onChange={(e) => onLocation(e.target.value)}
            aria-label="موقعیت تحویل"
          >
            {!selected && <option value="">یک موقعیت اضافه کنید</option>}
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        {source === "digikalajet" ? (
          <div className="historical-source">
            <span>فروشگاه</span>
            <strong>دیجی‌کالا جت · فقط مشاهده</strong>
            <button onClick={() => onSource("snappmarket")}>
              بازگشت به اسکن فعال
            </button>
          </div>
        ) : (
          <label>
            فروشگاه
            <select
              value={source}
              onChange={(e) =>
                onSource(e.target.value === "okala" ? "okala" : "snappmarket")
              }
            >
              <option value="snappmarket">اسنپ‌مارکت</option>
              <option value="okala">اکالا</option>
            </select>
          </label>
        )}
      </div>
      <div className="scan-action">
        <button
          className="primary scan-button"
          disabled={blocked || source === "digikalajet"}
          onClick={onStart}
        >
          {submitting ? "در حال شروع…" : "شروع اسکن"}
        </button>
        {source !== "digikalajet" && (
          <details className="scan-options">
            <summary>
              گزینه‌های اسکن <span>{faNumber.format(threshold)}٪</span>
            </summary>
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
          </details>
        )}
      </div>
    </section>
  );
}
