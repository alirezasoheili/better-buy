import type { ScanRecord } from "@better-buy/shared";
import { faNumber, faDate, sourceLabel } from "../dashboard/format";
export function HistoryPanel({
  scans,
  onOpen,
  onRetry,
  blocked,
}: {
  scans: ScanRecord[];
  onOpen: (s: ScanRecord) => void;
  onRetry: (s: ScanRecord) => void;
  blocked: boolean;
}) {
  return (
    <section className="history-page">
      <header className="section-heading">
        <h1>تاریخچه اسکن‌ها</h1>
        <p>هر نتیجه با موقعیت، فروشگاه و زمان خودش نگهداری می‌شود.</p>
      </header>
      {scans.length ? (
        <div className="run-list">
          {scans.map((s) => (
            <article className="run-item" key={s.id}>
              <div>
                <h2>{s.locationName}</h2>
                <p>
                  {sourceLabel(s.source)} · حداقل {faNumber.format(s.threshold)}
                  ٪
                </p>
                <time dateTime={s.createdAt}>
                  {faDate.format(new Date(s.createdAt))}
                </time>
              </div>
              <div>
                <strong>
                  {s.status === "succeeded"
                    ? `${faNumber.format(s.dealCount)} پیشنهاد`
                    : s.status === "failed"
                      ? "اسکن ناموفق"
                      : s.status === "queued"
                        ? "در انتظار بررسی"
                        : "در حال بررسی"}
                </strong>
                {s.errorMessage && (
                  <p className="form-error">{s.errorMessage}</p>
                )}
                <details>
                  <summary>جزئیات اسکن</summary>
                  <p>
                    {faNumber.format(s.vendorCount)} فروشگاه بررسی‌شده ·{" "}
                    {faNumber.format(s.productCount)} رکورد کالا
                  </p>
                  <p>حالت ثبت‌شده: {s.mode === "full" ? "کامل" : "جزئی"}</p>
                </details>
              </div>
              {s.status === "succeeded" ? (
                <button className="run-row" onClick={() => onOpen(s)}>
                  نمایش نتیجه
                </button>
              ) : s.status === "failed" && s.source !== "digikalajet" ? (
                <button disabled={blocked} onClick={() => onRetry(s)}>
                  اسکن تازه با این گزینه‌ها
                </button>
              ) : s.source === "digikalajet" ? (
                <span className="muted">اسکن تازه غیرفعال</span>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>هنوز اسکن ثبت نشده</h2>
          <p>پس از اولین اسکن، نتیجه و زمان آن اینجا نمایش داده می‌شود.</p>
        </div>
      )}
    </section>
  );
}
