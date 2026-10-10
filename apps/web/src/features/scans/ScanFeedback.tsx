import type { LocationRecord, ScanRecord } from "@better-buy/shared";
import { ReadNotice } from "../dashboard/Primitives";
import { faNumber, sourceLabel } from "../dashboard/format";
import type { useScanPolling } from "./useScanPolling";
import type { useStartScan } from "./useStartScan";
export function ScanFeedback({
  active,
  polling,
  start,
  locations,
  onOpenContext,
}: {
  active: ScanRecord | null;
  polling: ReturnType<typeof useScanPolling>;
  start: ReturnType<typeof useStartScan>;
  locations: LocationRecord[];
  onOpenContext: (run: ScanRecord) => void;
}) {
  return (
    <>
      {active && (
        <section className="active-scan" role="status">
          <div>
            <strong>
              {polling.error
                ? "وضعیت اسکن تازه‌سازی نشد"
                : active.status === "queued"
                  ? "اسکن در انتظار بررسی است"
                  : "در حال بررسی پیشنهادها…"}
            </strong>
            <p>
              {active.locationName} · {sourceLabel(active.source)} · حداقل{" "}
              {faNumber.format(active.threshold)}٪
            </p>
            {active.productCount > 0 && (
              <p>
                {faNumber.format(active.vendorCount)} فروشگاه بررسی‌شده ·{" "}
                {faNumber.format(active.productCount)} رکورد کالا
              </p>
            )}
            {polling.error && (
              <p>
                آخرین وضعیت شناخته‌شده نمایش داده می‌شود. این خطا به معنی شکست
                اسکن نیست.
              </p>
            )}
          </div>
          <div>
            {polling.error && (
              <button
                disabled={polling.isFetching}
                onClick={() => void polling.refetch()}
              >
                بررسی دوباره وضعیت
              </button>
            )}
            <button onClick={() => onOpenContext(active)}>
              نمایش موقعیت اسکن
            </button>
          </div>
        </section>
      )}
      {start.unresolved && start.uncertain && (
        <ReadNotice
          title="نتیجه شروع اسکن مشخص نیست"
          retry={() => void start.reconciliation.refetch()}
          busy={start.reconciliation.isFetching}
        >
          شروع اسکن تأیید نشد. درخواست دیگری ارسال نشده است؛ تاریخچه حساب برای
          پیدا کردن اسکن بررسی می‌شود.{" "}
          {locations.find((l) => l.id === start.uncertain?.target.locationId)
            ?.name ?? "موقعیت درخواست‌شده"}{" "}
          · {sourceLabel(start.uncertain.target.source)} · حداقل{" "}
          {faNumber.format(start.uncertain.target.threshold)}٪.{" "}
          {start.checked && !active && (
            <>
              در آخرین بررسی اسکن تازه‌ای پیدا نشد؛ نتیجه درخواست قبلی همچنان
              نامشخص است.{" "}
              <button onClick={start.allowNewAttempt}>
                ادامه با امکان اسکن تازه
              </button>
            </>
          )}
        </ReadNotice>
      )}
      {start.error && (
        <ReadNotice title="شروع اسکن انجام نشد">
          {start.error.message}
        </ReadNotice>
      )}
    </>
  );
}
