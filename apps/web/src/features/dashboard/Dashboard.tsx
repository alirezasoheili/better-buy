"use client";
import { useState } from "react";
import { isWithinTehranBoundary, type ScanRecord } from "@better-buy/shared";
import { AppHeader } from "./AppHeader";
import { ReadNotice } from "./Primitives";
import { useDashboardData } from "./useDashboardData";
import { ScanControls } from "../scans/ScanControls";
import { HistoryPanel } from "../scans/HistoryPanel";
import { useScanLedger } from "../scans/useScanLedger";
import { useScanPolling, isActiveScan } from "../scans/useScanPolling";
import { useStartScan } from "../scans/useStartScan";
import { LocationManager } from "../locations/LocationManager";
import { DealShelf } from "../deals/DealShelf";
import { useDealFilters } from "../deals/useDealFilters";
import type { DealSource } from "./types";
import { ScanFeedback } from "../scans/ScanFeedback";
export function Dashboard() {
  const data = useDashboardData();
  const [view, setView] = useState<"deals" | "history">("deals");
  const [selection, setSelection] = useState<{
    source: DealSource | null;
    threshold: number | null;
    runId: string | null;
  }>({ source: null, threshold: null, runId: null });
  const [locationDialog, setLocationDialog] = useState<
    "list" | "create" | null
  >(null);
  const latest = data.scans
    .filter((r) => r.locationId === data.selected && r.status === "succeeded")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const source = selection.source ?? "snappmarket";
  const threshold =
    selection.threshold ??
    latest.find((r) => r.source === source)?.threshold ??
    40;
  const activeRecord = data.scans.find(isActiveScan) ?? null;
  const polling = useScanPolling(activeRecord);
  const active = isActiveScan(polling.data) ? polling.data : activeRecord;
  const start = useStartScan({
    locationId: data.selected,
    source,
    threshold,
    mode: "partial",
  });
  const filters = useDealFilters();
  const ledger = useScanLedger({
    busy: data.busy,
    selected: data.selected,
    scans: data.scans,
    source,
    selectedRunId: selection.runId,
    query: filters.query,
    sort: filters.sort,
    coordinateRevision:
      data.locations.find((l) => l.id === data.selected)?.coordinateRevision ??
      1,
  });
  const valid = data.locations.some(
    (l) =>
      l.id === data.selected && isWithinTehranBoundary(l.latitude, l.longitude)
  );
  const blocked =
    start.submitting ||
    start.unresolved ||
    !!active ||
    !valid ||
    data.busy ||
    !data.locationsQuery.data ||
    !data.scansQuery.data;
  const latestAttempt = data.scans
    .filter(
      (r) =>
        r.locationId === data.selected &&
        r.source === source &&
        r.threshold === threshold
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const changeLocation = (id: string) => {
    data.setSelected(id);
    setSelection({ ...selection, threshold: null, runId: null });
  };
  const openRun = (r: ScanRecord) => {
    data.setSelected(r.locationId);
    setSelection({ source: r.source, threshold: r.threshold, runId: r.id });
    setView("deals");
  };
  const newScan = () => {
    if (blocked) return;
    setSelection({ ...selection, runId: null });
    start.start();
  };
  return (
    <main className="app-shell">
      <AppHeader
        onLocations={() => setLocationDialog("list")}
        onHistory={() => setView("history")}
        onHome={() => setView("deals")}
        view={view}
      />
      <div className="workspace">
        <ScanControls
          locations={data.locations}
          selected={data.selected}
          source={source}
          threshold={threshold}
          blocked={blocked}
          submitting={start.submitting}
          hasSnapshot={!!ledger.scan}
          onLocation={changeLocation}
          onSource={(source) =>
            setSelection({ source, threshold: null, runId: null })
          }
          onThreshold={(threshold) =>
            setSelection({ ...selection, threshold, runId: null })
          }
          onStart={newScan}
        />
        {data.locationsQuery.error && (
          <ReadNotice
            title="موقعیت‌ها دریافت نشدند"
            retry={() => void data.locationsQuery.refetch()}
            busy={data.locationsQuery.isFetching}
          >
            {data.locationsQuery.data
              ? "موقعیت‌های ذخیره‌شده نمایش داده می‌شوند؛ تازه‌سازی انجام نشد."
              : "برای انتخاب موقعیت، دریافت دوباره را امتحان کنید."}
          </ReadNotice>
        )}
        {data.scansQuery.error && (
          <ReadNotice
            title="تاریخچه اسکن دریافت نشد"
            retry={() => void data.scansQuery.refetch()}
            busy={data.scansQuery.isFetching}
          >
            وضعیت اسکن‌های حساب را دوباره بررسی کنید.
          </ReadNotice>
        )}
        <ScanFeedback
          active={active ?? null}
          polling={polling}
          start={start}
          locations={data.locations}
          onOpenContext={(run) => {
            data.setSelected(run.locationId);
            setSelection({
              source: run.source,
              threshold: run.threshold,
              runId: null,
            });
            setView("deals");
          }}
        />
        {view === "history" ? (
          <>
            <button className="back-button" onClick={() => setView("deals")}>
              بازگشت به پیشنهادها
            </button>
            <HistoryPanel
              scans={data.scans}
              onOpen={openRun}
              blocked={blocked}
              onRetry={(r) => {
                if (blocked) return;
                openRun(r);
                setSelection({
                  source: r.source,
                  threshold: r.threshold,
                  runId: null,
                });
                start.start({
                  locationId: r.locationId,
                  source: r.source,
                  threshold: r.threshold,
                  mode: r.mode,
                });
              }}
            />
          </>
        ) : data.needsLocation ? (
          <section className="empty onboarding">
            <h1>موقعیت تحویل را اضافه کنید</h1>
            <p>
              برای پیدا کردن پیشنهادهای اطراف، نشانی یا مختصات یک موقعیت در
              تهران را ثبت کنید.
            </p>
            <button
              className="primary"
              onClick={() => setLocationDialog("create")}
            >
              افزودن موقعیت تحویل
            </button>
            <p className="muted">
              اسنپ‌مارکت و اکالا بدون ورود به فروشگاه بررسی می‌شوند.
            </p>
          </section>
        ) : !valid && !data.busy && !data.locationsQuery.error ? (
          <ReadNotice title="موقعیت خارج از محدوده خدمات است">
            فعلاً موقعیت‌های داخل تهران پشتیبانی می‌شوند. موقعیت را از بخش
            موقعیت‌ها ویرایش کنید.
          </ReadNotice>
        ) : (
          <>
            {latestAttempt?.status === "failed" && !selection.runId && (
              <ReadNotice title="اسکن ناموفق بود">
                {latestAttempt.errorMessage ?? "پیشنهادها کامل دریافت نشدند."}{" "}
                {ledger.scan && "نتیجه موفق قبلی همچنان نمایش داده می‌شود."}
              </ReadNotice>
            )}
            {latestAttempt?.status === "cancelled" && !selection.runId && (
              <ReadNotice title="به‌روزرسانی لغو شد">
                {ledger.scan
                  ? "نتیجه موفق قبلی همچنان نمایش داده می‌شود."
                  : "نتیجه‌ای از این به‌روزرسانی منتشر نشده است."}
              </ReadNotice>
            )}
            <DealShelf
              filters={filters}
              scan={ledger.scan}
              threshold={threshold}
              source={source}
              busy={data.busy}
              results={ledger.results}
              hasResults={ledger.hasResults}
              dealGroups={ledger.dealGroups}
              historical={
                !!selection.runId && ledger.scan?.id === selection.runId
              }
              nextCursor={ledger.nextCursor}
              onLoadMore={ledger.loadMore}
              hasPreviousPages={ledger.hasPreviousPages}
              onFirstPage={ledger.firstPage}
            />
            {ledger.results.error &&
              ledger.requestedScan?.status === "succeeded" &&
              ledger.requestedScan.id !== ledger.scan?.id && (
                <p role="status">
                  به‌روزرسانی تازه با موفقیت ذخیره شد؛ دریافت آن انجام نشد.
                  نتیجه موفق قبلی با زمان خودش نمایش داده می‌شود.
                </p>
              )}
          </>
        )}
      </div>
      {locationDialog && (
        <LocationManager
          locations={data.locations}
          initialView={locationDialog}
          onClose={() => setLocationDialog(null)}
          onSaved={(saved) => {
            if (saved) changeLocation(saved.id);
            // Finish the old history read before publishing the new start into
            // its cache. Otherwise that read can erase the newly reserved scan.
            const firstCollection =
              saved &&
              data.locations.length === 0 &&
              !active &&
              !start.unresolved;
            void data.load().then(() => {
              if (firstCollection && saved) {
                setSelection({
                  source: "snappmarket",
                  threshold: 40,
                  runId: null,
                });
                start.start({
                  locationId: saved.id,
                  source: "snappmarket",
                  threshold: 40,
                });
              }
            });
          }}
        />
      )}
    </main>
  );
}
