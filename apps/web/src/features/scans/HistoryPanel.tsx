import type { ScanRecord } from "@better-buy/shared";
import { faNumber, faDate, sourceLabel } from "../dashboard/format";
export function HistoryPanel({
  scans,
  onOpen,
  onRetry,
}: {
  scans: ScanRecord[];
  onOpen: (s: ScanRecord) => void;
  onRetry: (s: ScanRecord) => void;
}) {
  return (
    <section className="history-page">
      <header>
        <span>ردپای خرید</span>
        <h1>تاریخچه اسکن‌ها</h1>
        <p>
          هر نتیجه موفق دست‌نخورده می‌ماند تا تغییر قفسه را بین دو اسکن ببینید.
        </p>
      </header>
      {scans.length ? (
        <div className="run-list">
          {scans.map((s) => (
            <div className="run-item" key={s.id}>
              <button
                className="run-row"
                onClick={() => s.status === "succeeded" && onOpen(s)}
                disabled={s.status !== "succeeded"}
              >
                <time>{faDate.format(new Date(s.createdAt))}</time>
                <strong>{s.locationName}</strong>
                <span className={`run-status ${s.status}`}>
                  {s.status === "succeeded"
                    ? `${faNumber.format(s.dealCount)} تخفیف`
                    : s.status === "failed"
                      ? "ناموفق"
                      : "در حال اجرا"}
                </span>
                <small>
                  {s.status === "failed"
                    ? s.source === "digikalajet"
                      ? `${s.errorMessage ?? "اسکن ناموفق"} · تکرار موقتاً غیرفعال است`
                      : s.errorMessage
                    : `${faNumber.format(s.vendorCount)} فروشگاه · ${sourceLabel(s.source)}`}
                </small>
              </button>
              {s.status === "failed" &&
                (s.source === "digikalajet" ? (
                  <span className="run-retry disabled" role="status">
                    تکرار غیرفعال
                  </span>
                ) : (
                  <button className="run-retry" onClick={() => onRetry(s)}>
                    تلاش دوباره
                  </button>
                ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>هنوز اسکن ثبت نشده</h2>
          <p>اسکن‌های بعدی با زمان و مکانشان اینجا باقی می‌مانند.</p>
        </div>
      )}
    </section>
  );
}
