import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { LocationRecord, ScanRecord } from "@better-buy/shared";
import { ReadNotice } from "../dashboard/Primitives";
import { faNumber, sourceLabel } from "../dashboard/format";
import type { useScanPolling } from "./useScanPolling";
import type { useStartScan } from "./useStartScan";
import { useCancelScan } from "./useCancelScan";
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
  const cancel = useCancelScan();
  return (
    <>
      {active && (
        <Card asChild>
          <section className="active-scan" role="status">
            <div>
              <strong>
                {polling.error
                  ? "وضعیت اسکن تازه‌سازی نشد"
                  : active.status === "queued"
                    ? "اسکن در انتظار بررسی است"
                    : "در حال پیدا کردن تخفیف‌ها…"}
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
              {active.execution && (
                <details>
                  <summary>جزئیات به‌روزرسانی</summary>
                  <p>
                    {faNumber.format(active.execution.completedPages)} صفحه
                    دریافت‌شده ·{" "}
                    {faNumber.format(active.execution.observedRows)} رکورد
                    مشاهده‌شده
                  </p>
                  <p>
                    {faNumber.format(active.execution.completedUnits)} از{" "}
                    {faNumber.format(active.execution.totalUnits)} بخش تکمیل شده
                  </p>
                </details>
              )}
              {cancel.error && (
                <p className="form-error">
                  لغو تأیید نشد؛ وضعیت اسکن را بررسی کنید.{" "}
                  {cancel.error.message}
                </p>
              )}
            </div>
            <div>
              <Button
                variant="outline"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(active.id)}
              >
                {cancel.isPending ? "در حال لغو…" : "لغو به‌روزرسانی"}
              </Button>
              {polling.error && (
                <Button
                  variant="outline"
                  disabled={polling.isFetching}
                  onClick={() => void polling.refetch()}
                >
                  بررسی دوباره وضعیت
                </Button>
              )}
              <Button variant="outline" onClick={() => onOpenContext(active)}>
                نمایش موقعیت اسکن
              </Button>
            </div>
          </section>
        </Card>
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
              <Button
                variant="outline"
                disabled={start.submitting}
                onClick={start.retryIntent}
              >
                بررسی دوباره درخواست قبلی
              </Button>
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
