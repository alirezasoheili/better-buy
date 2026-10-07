"use client";
import { DealShelf } from "../deals/DealShelf";
import { useDealFilters } from "../deals/useDealFilters";
import { LocationRail } from "../locations/LocationRail";
import { ScanControls } from "../scans/ScanControls";
import { useState } from "react";
import type { LocationRecord, ScanRecord } from "@better-buy/shared";
import { isWithinTehranBoundary } from "@better-buy/shared";
import OkalaSettings from "../../app/OkalaSettings";
import { useStartScan } from "../scans/useStartScan";
import type { DealSource } from "./types";
import { Icon } from "./Icon";
import { useDashboardData } from "./useDashboardData";
import { useScanLedger } from "../scans/useScanLedger";
import { useProviderConnection } from "../providers/useProviderConnection";
import { SettingsPanel } from "../providers/SnappSettings";
import { HistoryPanel } from "../scans/HistoryPanel";
import { LocationEditor } from "../locations/LocationEditor";
import { ActivationPanel, ProviderDisabledNotice } from "./EmptyStates";

export function Dashboard() {
  const [dismissedNotice, setDismissedNotice] = useState("");
  const [message, setMessage] = useState(""),
    [view, setView] = useState<"deals" | "history" | "settings">("deals"),
    [threshold, setThreshold] = useState(40),
    [source, setSource] = useState<DealSource>("snappmarket"),
    [mode, setMode] = useState<"partial" | "full">("partial"),
    [scanOptionsOpen, setScanOptionsOpen] = useState(false);
  const [locationForm, setLocationForm] = useState(false),
    [editing, setEditing] = useState<LocationRecord | null>(null);
  const {
    locations,
    selected,
    setSelected,
    scans,
    busy,
    needsLocation,
    dataError,
    load,
  } = useDashboardData();
  const ledger = useScanLedger({
    busy,
    selected,
    scans,
    source,
    threshold,
    setThreshold,
    setMode,
  });
  const { scan, setScan, deals, dealGroups, setSelectedRunId } = ledger;
  const { start, submitting } = useStartScan(
    { locationId: selected, source, threshold, mode },
    locations,
    (run) => {
      setScan(run);
      setView("deals");
    },
    setMessage
  );
  const runScan = (overrides?: Parameters<typeof start>[0]) => {
    setSelectedRunId(null);
    setMessage("");
    setDismissedNotice("");
    return start(overrides);
  };
  const retryScan = (run: ScanRecord) => {
    if (run.source === "digikalajet") {
      setMessage(
        "اسکن‌های دیجی‌کالا جت فعلاً فقط برای مشاهده هستند و قابل تکرار نیستند."
      );
      return;
    }
    setSelectedRunId(null);
    setSelected(run.locationId);
    setThreshold(run.threshold);
    setSource(run.source);
    setMode(run.mode);
    void runScan({
      locationId: run.locationId,
      threshold: run.threshold,
      source: run.source,
      mode: run.mode,
    });
  };
  const openRun = (run: ScanRecord) => {
    setSelectedRunId(run.id);
    setSelected(run.locationId);
    setScan(run);
    setThreshold(run.threshold);
    setSource(run.source);
    setMode(run.mode);
    setView("deals");
  };
  const connection = useProviderConnection(source);
  const openConnectionSettings = () => {
    if (source === "digikalajet") {
      setSource("snappmarket");
      setSelectedRunId(null);
    }
    setView("settings");
  };
  const handleScanAction = () => {
    if (scanning || !validLocation) return;
    if (source === "digikalajet") {
      setMessage(connection.message);
      return;
    }
    if (!connection.canScan) {
      setView("settings");
      return;
    }
    void runScan();
  };

  const filters = useDealFilters(dealGroups, scan);
  const scanning =
    submitting || scan?.status === "queued" || scan?.status === "running";
  const validLocation = locations.some(
    (location) =>
      location.id === selected &&
      isWithinTehranBoundary(location.latitude, location.longitude)
  );
  const requiresActivation = !busy && !selected;
  const notice = message || ledger.scanMessage || dataError;
  return (
    <main
      className={`app-shell ${connection.canScan && !scanning && view === "deals" ? "scan-ready" : ""}`}
      aria-hidden={locationForm || undefined}
    >
      <LocationRail
        locations={locations}
        selected={selected}
        connection={connection}
        view={view}
        onSelect={(id) => {
          setSelectedRunId(null);
          setSelected(id);
        }}
        onCreate={() => {
          setEditing(null);
          setLocationForm(true);
        }}
        onEdit={(location) => {
          setEditing(location);
          setLocationForm(true);
        }}
        onNavigate={setView}
      />
      <section className="workspace">
        {!requiresActivation && (
          <ScanControls
            locations={locations}
            selected={selected}
            scan={scan}
            scanning={scanning}
            validLocation={validLocation}
            busy={busy}
            connection={connection}
            source={source}
            threshold={threshold}
            mode={mode}
            scanOptionsOpen={scanOptionsOpen}
            setSource={setSource}
            setThreshold={setThreshold}
            setMode={setMode}
            setScanOptionsOpen={setScanOptionsOpen}
            setSelectedRunId={setSelectedRunId}
            openConnectionSettings={openConnectionSettings}
            handleScanAction={handleScanAction}
          />
        )}
        {notice && notice !== dismissedNotice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button
              onClick={() => {
                setMessage("");
                setDismissedNotice(notice);
              }}
              aria-label="بستن"
            >
              ×
            </button>
          </div>
        )}
        {view === "settings" ? (
          <>
            {source === "snappmarket" ? (
              <SettingsPanel />
            ) : source === "okala" ? (
              <OkalaSettings />
            ) : (
              <ProviderDisabledNotice onActivate={openConnectionSettings} />
            )}
          </>
        ) : view === "history" ? (
          <HistoryPanel scans={scans} onOpen={openRun} onRetry={retryScan} />
        ) : requiresActivation ? (
          <ActivationPanel
            hasLocation={!!selected}
            onLocation={() => {
              setEditing(null);
              setLocationForm(true);
            }}
          />
        ) : (
          <DealShelf
            filters={filters}
            scan={scan}
            threshold={threshold}
            busy={busy}
            dealGroups={dealGroups}
            deals={deals}
            connection={connection}
            handleScanAction={handleScanAction}
          />
        )}
      </section>
      {locationForm && (
        <LocationEditor
          required={needsLocation}
          location={editing}
          onClose={() => {
            if (!needsLocation) setLocationForm(false);
          }}
          onSaved={async () => {
            setLocationForm(false);
            await load();
          }}
        />
      )}
      {!requiresActivation && (
        <button
          className="mobile-scan"
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
      )}
    </main>
  );
}
