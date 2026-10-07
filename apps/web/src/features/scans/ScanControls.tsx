import type { Dispatch, SetStateAction } from "react";
import type { LocationRecord, ScanRecord } from "@better-buy/shared";
import type { ConnectionState, DealSource } from "../dashboard/types";
import { faNumber, faDate } from "../dashboard/format";
import { Icon } from "../dashboard/Icon";
type Props = {
  locations: LocationRecord[];
  selected: string;
  scan: ScanRecord | null;
  scanning: boolean;
  validLocation: boolean;
  busy: boolean;
  connection: ConnectionState;
  source: DealSource;
  threshold: number;
  mode: "partial" | "full";
  scanOptionsOpen: boolean;
  setSource: (source: DealSource) => void;
  setThreshold: (value: number) => void;
  setMode: (mode: "partial" | "full") => void;
  setScanOptionsOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedRunId: (id: string | null) => void;
  openConnectionSettings: () => void;
  handleScanAction: () => void;
};
export function ScanControls({
  locations,
  selected,
  scan,
  scanning,
  validLocation,
  busy,
  connection,
  source,
  threshold,
  mode,
  scanOptionsOpen,
  setSource,
  setThreshold,
  setMode,
  setScanOptionsOpen,
  setSelectedRunId,
  openConnectionSettings,
  handleScanAction,
}: Props) {
  return (
    <header className="scan-strip">
      <div className="scan-context">
        <span>
          {scanning
            ? "اسکن در جریان است"
            : connection.canScan && validLocation
              ? "آماده شروع اسکن"
              : "نیازمند راه‌اندازی"}
        </span>
        <strong>
          {locations.find((l) => l.id === selected)?.name ??
            "یک مکان را انتخاب کنید"}
        </strong>
        <small>
          {scan?.finishedAt
            ? `آخرین اسکن ${faDate.format(new Date(scan.finishedAt))}`
            : "هنوز اسکن موفقی ندارید"}
        </small>
      </div>
      <div
        className={`scanner ${scanning ? "running" : ""}`}
        aria-live="polite"
      >
        <div className="scanner-visual" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <p>
          {scanning
            ? scan?.vendorCount || scan?.productCount
              ? `${faNumber.format(scan?.vendorCount ?? 0)} فروشگاه · ${faNumber.format(scan?.productCount ?? 0)} کالا خوانده شد`
              : "قفسه‌های اطراف در حال خواندن‌اند…"
            : connection.message}
        </p>
      </div>
      <div className="scan-actions">
        {source === "digikalajet" ? (
          <div className="provider-history-state" role="status">
            <span>نتیجه تاریخی</span>
            <strong>دیجی‌کالا جت · فقط مشاهده</strong>
            <button type="button" onClick={openConnectionSettings}>
              بازگشت به اسکن فعال
            </button>
          </div>
        ) : (
          <label className="threshold-control">
            <span>فروشگاه</span>
            <select
              value={source}
              disabled={scanning}
              onChange={(e) => {
                const next =
                  e.target.value === "okala" ? "okala" : "snappmarket";
                setSelectedRunId(null);
                setSource(next);
                if (next === "okala" && threshold < 30) setThreshold(30);
              }}
            >
              <option value="snappmarket">اسنپ‌مارکت</option>
              <option value="okala">اکالا</option>
            </select>
          </label>
        )}
        {source !== "digikalajet" && (
          <button
            className="disclosure-button scan-options-trigger"
            type="button"
            aria-expanded={scanOptionsOpen}
            onClick={() => setScanOptionsOpen((open) => !open)}
          >
            <Icon name="settings" />
            گزینه‌های اسکن
          </button>
        )}
        {scanOptionsOpen && source !== "digikalajet" && (
          <div className="scan-advanced">
            <label className="threshold-control">
              <span>دامنه اسکن</span>
              <select
                value={mode}
                disabled={scanning}
                onChange={(e) =>
                  setMode(e.target.value === "full" ? "full" : "partial")
                }
              >
                <option value="partial">سریع · پیشنهادهای پرفروش</option>
                <option value="full">
                  {source === "okala"
                    ? "کامل · همه پیشنهادهای این فهرست"
                    : "کامل · همه پیشنهادها"}
                </option>
              </select>
            </label>
            <label className="threshold-control">
              <span>حداقل تخفیف</span>
              <select
                value={threshold}
                onChange={(e) => {
                  setSelectedRunId(null);
                  setThreshold(Number(e.target.value));
                }}
                disabled={scanning}
                aria-label="حداقل درصد تخفیف"
              >
                {(source === "okala"
                  ? [30, 35, 40, 45, 50]
                  : [15, 20, 25, 30, 35, 40, 45, 50]
                ).map((value) => (
                  <option value={value} key={value}>
                    {faNumber.format(value)}٪ به بالا
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <button
          className="scan-button"
          disabled={
            busy || scanning || !validLocation || source === "digikalajet"
          }
          onClick={handleScanAction}
        >
          <Icon name={connection.canScan ? "scan" : "settings"} />
          {scanning
            ? "در حال اسکن"
            : source === "digikalajet"
              ? "جت موقتاً غیرفعال"
              : connection.canScan
                ? `اسکن ${source === "okala" ? "اکالا" : "تخفیف‌ها"}`
                : "تنظیم اتصال"}
        </button>
      </div>
    </header>
  );
}
