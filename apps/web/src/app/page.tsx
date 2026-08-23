"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import OkalaSettings from "./OkalaSettings";
import { authClient } from "./auth-client";
import { ThemeToggle } from "@/components/theme-toggle";
import type {
  DealRecord,
  DealGroupRecord,
  LocationRecord,
  LocationSearchResult,
  ProviderSettingsStatus,
  ScanRecord,
  SettingsStatus,
} from "@better-buy/shared";
import { toman } from "@better-buy/shared";

const LocationMap = dynamic(() => import("./LocationMap"), {
  ssr: false,
  loading: () => <div className="map-loading">در حال آماده‌سازی نقشه…</div>,
});

/*
THESIS: Better Buy is a live grocery shelf, not an admin dashboard; location, discount and recency remain attached to every decision.
OWN-WORLD: Warm white shelf stock, charcoal ink, signal orange price tabs, ruled rows and oversized Persian price numerals.
STORY: Pick a delivery shelf, scan it, then recognize new, surviving and vanished bargains without hunting store by store.
FIRST VIEWPORT: Location rail at right, full-width scan strip above a filterable deal ledger, with the scan action anchoring the upper left.
FORM: Shelf-label scanner, the user-approved direction; dense operational staging with a mobile sticky scan action. Seed f9c6effb is retained for process reproducibility; the explicit user-pinned direction overrides its assigned candidate.
*/

const faNumber = new Intl.NumberFormat("fa-IR");
const faDate = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "medium",
  timeStyle: "short",
});
type DealSource = "snappmarket" | "digikalajet" | "okala";
type ActiveSource = Exclude<DealSource, "digikalajet">;
type ConnectionState = {
  source: DealSource;
  label: string;
  status: "ready" | "missing" | "expired" | "unavailable" | "disabled";
  canScan: boolean;
  message: string;
};

const sourceLabel = (source: DealSource) =>
  source === "digikalajet"
    ? "دیجی‌کالا جت"
    : source === "okala"
      ? "اکالا"
      : "اسنپ‌مارکت";
const displayToman = (
  amount: number,
  source: "snappmarket" | "digikalajet" | "okala",
) =>
  source === "digikalajet" || source === "okala"
    ? Math.round(amount / 10)
    : toman(amount);
const money = (
  amount: number,
  source: "snappmarket" | "digikalajet" | "okala",
) => `${faNumber.format(displayToman(amount, source))} تومان`;
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";
const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${apiBase}${url}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.message ?? body.error ?? "درخواست ناموفق بود");
  return body.data as T;
};

const loadDealLedger = async (scanId: string) => {
  const [rawDeals, groupedDeals] = await Promise.all([
    api<DealRecord[]>(`/api/scans/${scanId}/deals`),
    api<DealGroupRecord[]>(`/api/scans/${scanId}/deal-groups`),
  ]);
  return { rawDeals, groupedDeals };
};

const activeGroupStock = (group: DealGroupRecord) =>
  group.vendors
    .filter((vendor) => vendor.state !== "no_longer_present")
    .reduce((total, vendor) => total + vendor.stock, 0);

function Icon({
  name,
}: {
  name: "pin" | "scan" | "settings" | "history" | "plus" | "search" | "edit";
}) {
  const paths = {
    pin: "M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Zm0-9a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z",
    scan: "M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M7 12h10",
    settings:
      "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7-3.5 2-1-2-3-2 .4-1.4-1.3.2-2.1h-3.6l.2 2.1-1.4 1.3-2-.4-2 3 2 1v2l-2 1 2 3 2-.4 1.4 1.3-.2 2.1h3.6l-.2-2.1 1.4-1.3 2 .4 2-3-2-1v-2Z",
    history: "M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6M12 8v4l3 2",
    plus: "M12 5v14M5 12h14",
    search: "m20 20-4.5-4.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
    edit: "m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Zm9-12 3.5 3.5",
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d={paths[name]} />
    </svg>
  );
}

export default function Page() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending)
    return (
      <main className="auth-loading" aria-live="polite">
        <span className="loading-bar" />
        در حال بررسی ورود امن…
      </main>
    );
  if (!session) return <GoogleSignIn />;
  return <Dashboard />;
}

function GoogleSignIn() {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const login = async () => {
    setError("");
    setSubmitting(true);
    try {
      await authClient.signIn.social({ provider: "google", callbackURL: "/" });
    } catch {
      setError("شروع ورود با گوگل ممکن نشد؛ دوباره تلاش کنید.");
      setSubmitting(false);
    }
  };
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <div className="auth-mark">ب</div>
        <p className="auth-kicker">قفسهٔ خصوصی تخفیف‌های شما</p>
        <h1 id="sign-in-title">تخفیف‌های بهترِ خرید روزانه را پیدا کن.</h1>
        <p>
          با گوگل وارد شوید تا مکان‌های ذخیره‌شده، اسکن‌ها و اتصال فروشگاه‌ها
          فقط در حساب خودتان باقی بمانند.
        </p>
        <button
          className="google-button"
          onClick={() => void login()}
          disabled={submitting}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285f4"
              d="M21.35 12.25c0-.7-.06-1.22-.2-1.77H12v3.34h5.37c-.11.83-.71 2.08-2.04 2.92l-.02.11 2.96 2.29.2.02c1.87-1.72 2.88-4.25 2.88-6.91Z"
            />
            <path
              fill="#34a853"
              d="M12 21.75c2.63 0 4.84-.87 6.45-2.36l-3.07-2.42c-.82.57-1.92.97-3.38.97-2.58 0-4.77-1.71-5.55-4.07l-.1.01-3.08 2.38-.04.1A9.75 9.75 0 0 0 12 21.75Z"
            />
            <path
              fill="#fbbc05"
              d="M6.45 13.87A5.87 5.87 0 0 1 6.14 12c0-.65.11-1.28.3-1.87v-.12l-3.11-2.42-.1.05A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.06.98 4.36l3.22-2.49Z"
            />
            <path
              fill="#ea4335"
              d="M12 6.06c1.84 0 3.08.8 3.79 1.46l2.77-2.7C16.83 3.2 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.77 5.39l3.21 2.49C7.23 7.77 9.42 6.06 12 6.06Z"
            />
          </svg>
          {submitting ? "در حال باز کردن گوگل…" : "ادامه با گوگل"}
        </button>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <small>
          ورود فقط با گوگل انجام می‌شود. توکن‌های فروشگاهی رمزنگاری شده‌اند و با
          حساب دیگری به اشتراک گذاشته نمی‌شوند.
        </small>
      </section>
    </main>
  );
}

function Dashboard() {
  const [locations, setLocations] = useState<LocationRecord[]>([]),
    [selected, setSelected] = useState(""),
    [settings, setSettings] = useState<SettingsStatus | null>(null),
    [scans, setScans] = useState<ScanRecord[]>([]),
    [scan, setScan] = useState<ScanRecord | null>(null),
    [deals, setDeals] = useState<DealRecord[]>([]),
    [dealGroups, setDealGroups] = useState<DealGroupRecord[]>([]);
  const [busy, setBusy] = useState(true),
    [message, setMessage] = useState(""),
    [view, setView] = useState<"deals" | "history" | "settings">("deals"),
    [query, setQuery] = useState(""),
    [stateFilter, setStateFilter] = useState("all"),
    [vendor, setVendor] = useState("all"),
    [minPrice, setMinPrice] = useState(0),
    [sort, setSort] = useState("discount"),
    [threshold, setThreshold] = useState(40),
    [source, setSource] = useState<DealSource>("snappmarket"),
    [mode, setMode] = useState<"partial" | "full">("partial"),
    [okalaSettings, setOkalaSettings] = useState<ProviderSettingsStatus | null>(
      null,
    );
  const [locationForm, setLocationForm] = useState(false),
    [needsLocation, setNeedsLocation] = useState(false),
    [editing, setEditing] = useState<LocationRecord | null>(null),
    [selectedRunId, setSelectedRunId] = useState<string | null>(null),
    [providerErrors, setProviderErrors] = useState<
      Partial<Record<ActiveSource, string>>
    >({});
  const dealsRequestRef = useRef(0);
  const initialContextHydratedRef = useRef(false);
  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      api<LocationRecord[]>("/api/locations"),
      api<SettingsStatus>("/api/settings/snappmarket"),
      api<ProviderSettingsStatus>("/api/settings/okala"),
      api<ScanRecord[]>("/api/scans"),
    ]);
    const [locationsResult, settingsResult, okalaResult, scansResult] = results;
    const errors: Partial<Record<ActiveSource, string>> = {};
    const errorText = (result: PromiseRejectedResult) =>
      result.reason instanceof Error
        ? result.reason.message
        : "وضعیت اتصال در دسترس نیست";

    if (locationsResult.status === "fulfilled") {
      const ls = locationsResult.value;
      setLocations(ls);
      setNeedsLocation(ls.length === 0);
      if (ls.length === 0) {
        setEditing(null);
        setLocationForm(true);
      }
      setSelected(
        (v) => v || ls.find((l) => l.isDefault)?.id || ls[0]?.id || "",
      );
    } else {
      setMessage(errorText(locationsResult));
    }
    if (settingsResult.status === "fulfilled") {
      setSettings(settingsResult.value);
    } else {
      errors.snappmarket = errorText(settingsResult);
    }
    if (okalaResult.status === "fulfilled") {
      setOkalaSettings(okalaResult.value);
    } else {
      errors.okala = errorText(okalaResult);
    }
    if (scansResult.status === "fulfilled") {
      setScans(scansResult.value);
    } else {
      setMessage(errorText(scansResult));
    }
    setProviderErrors(errors);
    setBusy(false);
  }, []);
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (busy || !selected) return;
    const currentScanIsContextual =
      scan &&
      !selectedRunId &&
      scan.locationId === selected &&
      scan.source === source &&
      scan.threshold === threshold &&
      (scan.status === "queued" ||
        scan.status === "running" ||
        scan.status === "failed");
    if (currentScanIsContextual) return;

    const hydrateInitialContext =
      !initialContextHydratedRef.current && !selectedRunId;
    initialContextHydratedRef.current = true;
    const requestId = ++dealsRequestRef.current;
    const matchingRuns = scans
      .filter(
        (run) =>
          run.locationId === selected &&
          run.source === source &&
          run.status === "succeeded",
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const requestedRun = selectedRunId
      ? scans.find(
          (run) =>
            run.id === selectedRunId &&
            run.locationId === selected &&
            run.source === source &&
            run.threshold === threshold &&
            run.status === "succeeded",
        )
      : null;
    const latest =
      requestedRun ??
      (hydrateInitialContext
        ? matchingRuns[0]
        : matchingRuns.find((run) => run.threshold === threshold));

    setScan(latest ?? null);
    if (hydrateInitialContext && latest) {
      setThreshold(latest.threshold);
      setMode(latest.mode);
    }
    setDeals([]);
    setDealGroups([]);
    if (!latest) return;
    void loadDealLedger(latest.id)
      .then(({ rawDeals, groupedDeals }) => {
        if (
          dealsRequestRef.current === requestId &&
          selected === latest.locationId &&
          source === latest.source &&
          threshold === latest.threshold
        ) {
          setDeals(rawDeals);
          setDealGroups(groupedDeals);
        }
      })
      .catch((error) => {
        if (dealsRequestRef.current === requestId)
          setMessage(
            error instanceof Error
              ? error.message
              : "بارگذاری تخفیف‌ها ناموفق بود",
          );
      });
  }, [
    busy,
    scans,
    selected,
    selectedRunId,
    source,
    threshold,
    scan?.id,
    scan?.status,
  ]);
  useEffect(() => {
    if (!scan || (scan.status !== "queued" && scan.status !== "running"))
      return;
    const pollingId = scan.id;
    const pollingLocationId = scan.locationId;
    const pollingSource = scan.source;
    const pollingThreshold = scan.threshold;
    const timer = setInterval(async () => {
      try {
        const current = await api<ScanRecord>(`/api/scans/${pollingId}`);
        if (current.id !== pollingId) return;
        setScan(current);
        if (current.status === "succeeded") {
          const requestId = ++dealsRequestRef.current;
          const { rawDeals, groupedDeals } = await loadDealLedger(current.id);
          if (
            dealsRequestRef.current === requestId &&
            selected === pollingLocationId &&
            source === pollingSource &&
            threshold === pollingThreshold
          ) {
            setDeals(rawDeals);
            setDealGroups(groupedDeals);
          }
          setMessage("اسکن کامل شد؛ قفسه تازه است.");
          void load();
        } else if (current.status === "failed") {
          setMessage(current.errorMessage ?? "اسکن ناموفق بود");
          void load();
        }
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "پیگیری وضعیت اسکن ناموفق بود",
        );
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [load, scan?.id, scan?.status, selected, source, threshold]);
  const runScan = async (overrides?: {
    locationId?: string;
    threshold?: number;
    source?: DealSource;
    mode?: "partial" | "full";
  }) => {
    const locationId = overrides?.locationId ?? selected;
    const thr = overrides?.threshold ?? threshold;
    const src = overrides?.source ?? source;
    const md = overrides?.mode ?? mode;
    if (!locationId || src === "digikalajet") return;
    setSelectedRunId(null);
    setMessage("");
    try {
      const started = await api<{ id: string; status: string }>("/api/scans", {
        method: "POST",
        body: JSON.stringify({
          locationId,
          threshold: thr,
          source: src,
          mode: md,
        }),
      });
      setScan({
        id: started.id,
        locationId,
        locationName: locations.find((l) => l.id === locationId)?.name ?? "",
        threshold: thr,
        source: src,
        mode: md,
        status: "queued",
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        vendorCount: 0,
        productCount: 0,
        dealCount: 0,
        errorCode: null,
        errorMessage: null,
      });
      setView("deals");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "شروع اسکن ممکن نشد");
    }
  };
  const retryScan = (run: ScanRecord) => {
    if (run.source === "digikalajet") {
      setMessage(
        "اسکن‌های دیجی‌کالا جت فعلاً فقط برای مشاهده هستند و قابل تکرار نیستند.",
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
  const connection = useMemo<ConnectionState>(() => {
    if (source === "digikalajet")
      return {
        source,
        label: sourceLabel(source),
        status: "disabled",
        canScan: false,
        message: "دیجی‌کالا جت فعلاً غیرفعال است؛ این نتیجه فقط خواندنی است.",
      };
    const value = source === "snappmarket" ? settings : okalaSettings;
    const providerError = providerErrors[source];
    if (providerError)
      return {
        source,
        label: sourceLabel(source),
        status: "unavailable",
        canScan: false,
        message: `${sourceLabel(source)}: ${providerError}`,
      };
    if (!value)
      return {
        source,
        label: sourceLabel(source),
        status: "unavailable",
        canScan: false,
        message: `وضعیت اتصال ${sourceLabel(source)} در دسترس نیست؛ تنظیمات را بررسی کنید.`,
      };
    if (!value.tokenConfigured)
      return {
        source,
        label: sourceLabel(source),
        status: "missing",
        canScan: false,
        message: `ابتدا توکن ${sourceLabel(source)} را در تنظیمات اتصال وارد کنید.`,
      };
    if (value.tokenExpired)
      return {
        source,
        label: sourceLabel(source),
        status: "expired",
        canScan: false,
        message: `توکن ${sourceLabel(source)} منقضی شده است؛ برای اسکن دوباره آن را تعویض کنید.`,
      };
    return {
      source,
      label: sourceLabel(source),
      status: "ready",
      canScan: true,
      message: `${sourceLabel(source)} آماده اسکن مکان انتخابی است.`,
    };
  }, [okalaSettings, providerErrors, settings, source]);
  const openConnectionSettings = () => {
    if (source === "digikalajet") {
      setSource("snappmarket");
      setSelectedRunId(null);
    }
    setView("settings");
  };
  const handleScanAction = () => {
    if (scanning) return;
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
  const vendors = useMemo(
    () =>
      [
        ...new Set(
          dealGroups.flatMap((group) =>
            group.vendors.map((groupVendor) => groupVendor.vendorTitle),
          ),
        ),
      ].sort((a, b) => a.localeCompare(b, "fa")),
    [dealGroups],
  );
  useEffect(() => {
    if (vendor !== "all" && !vendors.includes(vendor)) setVendor("all");
  }, [vendor, vendors]);
  const visible = useMemo(
    () =>
      dealGroups
        .filter(
          (group) =>
            (stateFilter === "all" || group.state === stateFilter) &&
            (vendor === "all" ||
              group.vendors.some(
                (groupVendor) => groupVendor.vendorTitle === vendor,
              )) &&
            displayToman(
              group.finalPriceRials,
              scan?.source ?? "snappmarket",
            ) >=
              minPrice &&
            `${group.title} ${group.categoryTitle ?? ""} ${group.vendors
              .map((groupVendor) => groupVendor.vendorTitle)
              .join(" ")}`.includes(query),
        )
        .sort((a, b) =>
          sort === "price"
            ? a.finalPriceRials - b.finalPriceRials
            : sort === "stock"
              ? activeGroupStock(b) - activeGroupStock(a)
              : b.discountRatio - a.discountRatio,
        ),
    [
      dealGroups,
      stateFilter,
      vendor,
      minPrice,
      query,
      sort,
      scan?.source,
    ],
  );
  const counts = {
    all: dealGroups.filter((group) => group.state !== "no_longer_present")
      .length,
    new: dealGroups.filter((group) => group.state === "new").length,
    still: dealGroups.filter((group) => group.state === "still_available")
      .length,
    gone: dealGroups.filter((group) => group.state === "no_longer_present")
      .length,
  };
  const scanning = scan?.status === "queued" || scan?.status === "running";
  return (
    <main
      className={`app-shell ${connection.canScan && !scanning && view === "deals" ? "scan-ready" : ""}`}
      aria-hidden={locationForm || undefined}
    >
      <aside className="location-rail" aria-label="مکان‌های ذخیره‌شده">
        <div className="brand">
          <span className="brand-mark">ب</span>
          <div>
            <strong>بهتر بخر</strong>
            <small>رادار تخفیف محلی</small>
          </div>
        </div>
        <ThemeToggle />
        <select
          className="mobile-location-select"
          value={selected}
          onChange={(e) => {
            setSelectedRunId(null);
            setSelected(e.target.value);
          }}
          aria-label="انتخاب مکان"
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <div className="rail-title">
          <span>قفسه‌های من</span>
          <button
            className="icon-button"
            onClick={() => {
              setEditing(null);
              setLocationForm(true);
            }}
            aria-label="افزودن مکان"
          >
            <Icon name="plus" />
          </button>
        </div>
        <div className="locations">
          {locations.map((l) => (
            <div className="location-row" key={l.id}>
              <button
                className={`location ${selected === l.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedRunId(null);
                  setSelected(l.id);
                }}
              >
                <Icon name="pin" />
                <span>
                  <strong>{l.name}</strong>
                  <small>
                    {l.latitude.toFixed(4)}، {l.longitude.toFixed(4)}
                  </small>
                </span>
              </button>
              <button
                className="location-edit"
                onClick={() => {
                  setEditing(l);
                  setLocationForm(true);
                }}
                aria-label={`ویرایش ${l.name}`}
              >
                <Icon name="edit" />
              </button>
            </div>
          ))}
        </div>
        <nav>
          <button
            className="mobile-rail-action"
            onClick={() => {
              setEditing(null);
              setLocationForm(true);
            }}
            aria-label="افزودن مکان"
          >
            <Icon name="plus" />
          </button>
          <button
            className="mobile-rail-action"
            onClick={() => {
              const l = locations.find((item) => item.id === selected);
              if (l) {
                setEditing(l);
                setLocationForm(true);
              }
            }}
            aria-label="ویرایش مکان انتخاب‌شده"
          >
            <Icon name="edit" />
          </button>
          <button
            className={view === "history" ? "active" : ""}
            onClick={() => setView("history")}
          >
            <Icon name="history" />
            تاریخچه اسکن
          </button>
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => setView("settings")}
          >
            <Icon name="settings" />
            تنظیمات اتصال
          </button>
        </nav>
        <div className="rail-foot">
          <span
            className={`status-dot ${connection.status === "ready" ? "ok" : "warn"}`}
          />
          {connection.status === "ready"
            ? "اتصال آماده است"
            : connection.status === "expired"
              ? "توکن منقضی شده"
              : connection.status === "disabled"
                ? "جت موقتاً غیرفعال است"
                : "اتصال نیاز به بررسی دارد"}
        </div>
      </aside>
      <section className="workspace">
        <header className="scan-strip">
          <div className="scan-context">
            <span>
              {scanning
                ? "اسکن در جریان است"
                : connection.status === "ready"
                  ? "آماده اسکن"
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
            <span />
            <p>
              {scanning
                ? scan.vendorCount || scan.productCount
                  ? `${faNumber.format(scan.vendorCount)} فروشگاه · ${faNumber.format(scan.productCount)} کالا خوانده شد`
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
                    const next = e.target.value as ActiveSource;
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
              <label className="threshold-control">
                <span>دامنه اسکن</span>
                <select
                  value={mode}
                  disabled={scanning}
                  onChange={(e) =>
                    setMode(e.target.value as "partial" | "full")
                  }
                >
                  <option value="partial">سریع · ۲۵ صفحه</option>
                  <option value="full">کامل · همه صفحات</option>
                </select>
              </label>
            )}
            <label className="threshold-control">
              <span>حداقل تخفیف</span>
              <select
                value={threshold}
                onChange={(e) => {
                  setSelectedRunId(null);
                  setThreshold(Number(e.target.value));
                }}
                disabled={scanning || source === "digikalajet"}
                aria-label="حداقل درصد تخفیف"
              >
                {(source === "digikalajet" || source === "okala"
                  ? [30, 35, 40, 45, 50]
                  : [15, 20, 25, 30, 35, 40, 45, 50]
                ).map((value) => (
                  <option value={value} key={value}>
                    {faNumber.format(value)}٪ به بالا
                  </option>
                ))}
              </select>
            </label>
            <button
              className="scan-button"
              disabled={scanning || source === "digikalajet"}
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
        {message && (
          <div className="notice" role="status">
            <span>{message}</span>
            <button onClick={() => setMessage("")} aria-label="بستن">
              ×
            </button>
          </div>
        )}
        {view === "settings" ? (
          <>
            {source === "snappmarket" ? (
              <SettingsPanel
                value={settings}
                onSaved={(v) => {
                  setSettings(v);
                  setProviderErrors((errors) => ({
                    ...errors,
                    snappmarket: undefined,
                  }));
                  setMessage("توکن با موفقیت و به‌صورت رمزگذاری‌شده ذخیره شد");
                }}
              />
            ) : source === "okala" ? (
              <OkalaSettings
                value={okalaSettings}
                onSaved={(v) => {
                  setOkalaSettings(v);
                  setProviderErrors((errors) => ({
                    ...errors,
                    okala: undefined,
                  }));
                  setMessage("توکن اکالا ذخیره شد");
                }}
              />
            ) : (
              <ProviderDisabledNotice onActivate={openConnectionSettings} />
            )}
          </>
        ) : view === "history" ? (
          <HistoryPanel scans={scans} onOpen={openRun} onRetry={retryScan} />
        ) : (
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
                <div className="filters">
                  <label className="search">
                    <Icon name="search" />
                    <input
                      aria-label="جست‌وجوی کالا یا فروشگاه"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="جست‌وجوی کالا یا فروشگاه"
                    />
                  </label>
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
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    aria-label="مرتب‌سازی"
                  >
                    <option value="discount">بیشترین تخفیف</option>
                    <option value="price">کمترین قیمت</option>
                    <option value="stock">بیشترین موجودی</option>
                  </select>
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
            setNeedsLocation(false);
            await load();
          }}
        />
      )}
      <button
        className="mobile-scan"
        disabled={scanning || source === "digikalajet"}
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
    </main>
  );
}

function DealRow({
  group: d,
  source,
}: {
  group: DealGroupRecord;
  source: DealSource;
}) {
  const activeVendors = d.vendors.filter(
    (groupVendor) => groupVendor.state !== "no_longer_present",
  );
  return (
    <article className={`deal-row ${d.state}`}>
      <div className="discount-tab">
        <strong>{faNumber.format(d.discountRatio)}٪</strong>
        <span>تخفیف</span>
      </div>
      <div className="product-image">
        {d.image ? (
          <img src={d.image} alt="" loading="lazy" />
        ) : (
          <span>بدون تصویر</span>
        )}
      </div>
      <div className="product-copy">
        <div className="badges">
          <span>
            {d.state === "new"
              ? "تازه"
              : d.state === "still_available"
                ? "هنوز موجود"
                : "ناپدیدشده"}
          </span>
          {d.categoryTitle && <span>{d.categoryTitle}</span>}
        </div>
        <h2>{d.title}</h2>
        <p>
          {faNumber.format(activeVendors.length)} فروشگاه · موجودی{" "}
          {faNumber.format(activeGroupStock(d))}
        </p>
        <div className="vendor-chips" aria-label="فروشندگان این کالا">
          {d.vendors.map((groupVendor) => {
            const isGone = groupVendor.state === "no_longer_present";
            return (
              <span
                className={`vendor-chip ${groupVendor.state}`}
                key={groupVendor.vendorId}
                title={
                  isGone
                    ? `${groupVendor.vendorTitle} · ناپدیدشده`
                    : `${groupVendor.vendorTitle} · موجودی ${faNumber.format(groupVendor.stock)}`
                }
              >
                <strong>{groupVendor.vendorTitle}</strong>
                <small>
                  {isGone
                    ? "ناپدیدشده"
                    : `موجودی ${faNumber.format(groupVendor.stock)}`}
                </small>
              </span>
            );
          })}
        </div>
      </div>
      <div className="price-label">
        <del>{money(d.priceRials, source)}</del>
        <strong>{money(d.finalPriceRials, source)}</strong>
        <small>
          {faNumber.format(displayToman(d.discountRials, source))} تومان
          صرفه‌جویی
        </small>
      </div>
    </article>
  );
}

function EmptyState({
  connection,
  hasDeals,
  onAction,
  onClearFilters,
}: {
  connection: ConnectionState;
  hasDeals: boolean;
  onAction: () => void;
  onClearFilters: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">۴۰٪</span>
      <h2>{hasDeals ? "چیزی با این فیلتر پیدا نشد" : "قفسه هنوز خالی است"}</h2>
      <p>
        {hasDeals
          ? "فیلترها را سبک‌تر کنید تا کالاها دوباره دیده شوند."
          : connection.canScan
            ? "یک اسکن دستی اجرا کنید تا تخفیف‌های عمیق اطراف این مکان پیدا شوند."
            : connection.message}
      </p>
      {hasDeals ? (
        <button onClick={onClearFilters}>پاک‌کردن فیلترها</button>
      ) : (
        <button onClick={onAction}>
          {connection.canScan
            ? "اولین اسکن"
            : connection.status === "disabled"
              ? "بازگشت به اسکن فعال"
              : "تنظیم اتصال"}
        </button>
      )}
    </div>
  );
}

function ProviderDisabledNotice({ onActivate }: { onActivate: () => void }) {
  return (
    <section className="provider-disabled" role="status">
      <span className="empty-mark">جت</span>
      <h1>دیجی‌کالا جت موقتاً غیرفعال است</h1>
      <p>
        تنظیم اتصال و اسکن تازه برای این منبع فعلاً در دسترس نیست. نتایج قبلی
        همچنان از تاریخچه قابل مشاهده‌اند.
      </p>
      <button onClick={onActivate}>بازگشت به تنظیمات اسکن فعال</button>
    </section>
  );
}

function SettingsPanel({
  value,
  onSaved,
}: {
  value: SettingsStatus | null;
  onSaved: (s: SettingsStatus) => void;
}) {
  const [token, setToken] = useState(""),
    [version, setVersion] = useState(value?.appVersion ?? "1.397.50"),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(""),
    [otp, setOtp] = useState(""),
    [otpSent, setOtpSent] = useState(false),
    [otpBusy, setOtpBusy] = useState(false);
  const requestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpBusy(true);
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/settings/snappmarket/otp`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mobile, appVersion: version }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.message ?? "ارسال کد ناموفق بود");
      setOtpSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ارسال کد ناموفق بود");
    } finally {
      setOtpBusy(false);
    }
  };
  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpBusy(true);
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/settings/snappmarket/login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mobile, otp, appVersion: version }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.message ?? "ورود ناموفق بود");
      onSaved(body.data as SettingsStatus);
      setOtp("");
      setOtpSent(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ورود ناموفق بود");
    } finally {
      setOtpBusy(false);
    }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      onSaved(
        await api<SettingsStatus>("/api/settings/snappmarket", {
          method: "PUT",
          body: JSON.stringify({ token, appVersion: version }),
        }),
      );
      setToken("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ذخیره نشد");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="settings-page">
      <header>
        <span>اتصال امن</span>
        <h1>تنظیمات اسنپ‌مارکت</h1>
        <p>
          توکن فقط در سرور محلی رمزگذاری می‌شود و هرگز دوباره در مرورگر نمایش
          داده نخواهد شد.
        </p>
      </header>
      <div className="credential-status">
        <span
          className={`status-dot ${value?.tokenConfigured && !value.tokenExpired ? "ok" : "warn"}`}
        />
        <div>
          <strong>
            {value?.tokenConfigured
              ? value.tokenExpired
                ? "توکن منقضی شده"
                : "توکن آماده استفاده است"
              : "هنوز توکنی ثبت نشده"}
          </strong>
          <small>
            {value?.tokenExpiresAt
              ? `اعتبار تا ${faDate.format(new Date(value.tokenExpiresAt))}`
              : "تاریخ انقضا در دسترس نیست"}
          </small>
        </div>
      </div>
      <div className="credential-status">
        <div>
          <strong>ورود با شماره موبایل</strong>
          <small>
            کد یک‌بارمصرف اسنپ‌مارکت را دریافت و توکن را خودکار ذخیره کنید.
          </small>
        </div>
      </div>
      {!otpSent ? (
        <form onSubmit={requestOtp}>
          <label>
            شماره موبایل
            <input
              required
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="۰۹۱۲۱۲۳۴۵۶۷"
              inputMode="tel"
              dir="ltr"
            />
          </label>
          <button disabled={otpBusy}>
            {otpBusy ? "در حال ارسال…" : "ارسال کد پیامک"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyOtp}>
          <label>
            کد پیامک
            <input
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="کد یک‌بارمصرف"
              inputMode="numeric"
              dir="ltr"
            />
          </label>
          <p className="otp-help">
            کد به {mobile} ارسال شد.{" "}
            <button
              type="button"
              onClick={() => {
                setOtpSent(false);
                setOtp("");
              }}
            >
              ویرایش شماره
            </button>
          </p>
          <button disabled={otpBusy}>
            {otpBusy ? "در حال ورود…" : "تأیید و اتصال اسنپ‌مارکت"}
          </button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="settings-divider">
        <span>یا ورود دستی با توکن</span>
      </div>
      <form onSubmit={save}>
        <label>
          توکن Bearer
          <textarea
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="توکن تازه را اینجا بچسبانید"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label>
          نسخه اپلیکیشن
          <input
            required
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            inputMode="decimal"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button disabled={saving}>
          {saving ? "در حال رمزگذاری…" : "ذخیره امن توکن"}
        </button>
      </form>
      <aside>
        <strong>نکته امنیتی</strong>
        <p>
          توکن داخل درخواست اولیه افشا شده است. پیش از استفاده، یک توکن تازه از
          نشست خودتان بردارید.
        </p>
      </aside>
    </section>
  );
}

function HistoryPanel({
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

function LocationEditor({
  location,
  required,
  onClose,
  onSaved,
}: {
  location: LocationRecord | null;
  required?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(location?.name ?? "");
  const [latitude, setLatitude] = useState(location?.latitude ?? 35.7);
  const [longitude, setLongitude] = useState(location?.longitude ?? 51.4);
  const [isDefault, setDefault] = useState(location?.isDefault ?? false),
    [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "results" | "empty" | "error"
  >("idle");
  const [searchError, setSearchError] = useState("");
  const searchRequestRef = useRef(0);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !required) {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, required]);
  const searchAddress = async () => {
    const query = searchQuery.trim();
    const requestId = ++searchRequestRef.current;
    if (query.length < 2) {
      setSearchResults([]);
      setSearchState("error");
      setSearchError("برای جست‌وجو حداقل دو نویسه وارد کنید.");
      return;
    }
    setSearchState("loading");
    setSearchError("");
    setSearchResults([]);
    try {
      const results = await api<LocationSearchResult[]>(
        `/api/locations/search?q=${encodeURIComponent(query)}`,
      );
      if (requestId !== searchRequestRef.current) return;
      setSearchResults(results);
      setSearchState(results.length ? "results" : "empty");
    } catch (e) {
      if (requestId !== searchRequestRef.current) return;
      setSearchState("error");
      setSearchError(e instanceof Error ? e.message : "جست‌وجو انجام نشد.");
    }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api(`/api/locations${location ? `/${location.id}` : ""}`, {
        method: location ? "PATCH" : "POST",
        body: JSON.stringify({ name, latitude, longitude, isDefault }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ذخیره نشد");
    }
  };
  const remove = async () => {
    if (!location) return;
    if (
      !window.confirm(
        "Deleting this location will also permanently delete all of its scan history and deals. Continue?",
      )
    )
      return;
    try {
      await api(`/api/locations/${location.id}`, { method: "DELETE" });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حذف نشد");
    }
  };
  const title = location
    ? "ویرایش مکان"
    : required
      ? "اول یک مکان انتخاب کنید"
      : "افزودن مکان روی نقشه";
  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
        <section
          ref={dialogRef}
          className="location-sheet map-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="location-title"
          tabIndex={-1}
      >
        <button className="sheet-close" onClick={onClose} aria-label="بستن پنجره مکان">
          ×
        </button>
        <span>قفسه محلی</span>
        <h2 id="location-title">
          {location ? "ویرایش مکان" : "افزودن مکان روی نقشه"}
        </h2>
        <form onSubmit={save}>
          <label>
            نام مکان
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً خانه یا محل کار"
            />
          </label>
          <div className="location-search" role="search">
            <label htmlFor="location-address-search">جست‌وجوی نشانی در تهران</label>
            <div className="location-search-control">
              <input
                id="location-address-search"
                value={searchQuery}
                onChange={(e) => {
                  searchRequestRef.current += 1;
                  setSearchQuery(e.target.value);
                  setSearchResults([]);
                  setSearchState("idle");
                  setSearchError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchAddress();
                  }
                }}
                placeholder="مثلاً میدان ونک"
                inputMode="search"
              />
              <button
                type="button"
                onClick={() => void searchAddress()}
                disabled={searchState === "loading"}
              >
                {searchState === "loading" ? "در حال جست‌وجو…" : "جست‌وجو"}
              </button>
            </div>
            {searchState === "error" && (
              <p className="location-search-status is-error" role="alert">
                {searchError}
              </p>
            )}
            {searchState === "empty" && (
              <p className="location-search-status" role="status">
                نتیجه‌ای در محدوده تهران پیدا نشد؛ مختصات را دستی وارد کنید.
              </p>
            )}
            {searchState === "results" && (
              <div className="location-search-results" aria-label="نتایج جست‌وجوی نشانی">
                {searchResults.map((result) => (
                  <button
                    type="button"
                    key={`${result.latitude}:${result.longitude}:${result.displayName}`}
                    onClick={() => {
                      setLatitude(result.latitude);
                      setLongitude(result.longitude);
                      setSearchQuery(result.displayName);
                      setSearchResults([]);
                      setSearchState("idle");
                    }}
                  >
                    {result.displayName}
                  </button>
                ))}
              </div>
            )}
          </div>
          <LocationMap
            latitude={latitude}
            longitude={longitude}
            onChange={({ lat, lng }) => {
              setLatitude(lat);
              setLongitude(lng);
            }}
          />
          <div className="coordinate-fields">
            <label>
              عرض جغرافیایی
              <input
                required
                type="number"
                step="any"
                min="-90"
                max="90"
                value={latitude}
                onChange={(e) => setLatitude(Number(e.target.value))}
              />
            </label>
            <label>
              طول جغرافیایی
              <input
                required
                type="number"
                step="any"
                min="-180"
                max="180"
                value={longitude}
                onChange={(e) => setLongitude(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setDefault(e.target.checked)}
            />
            مکان پیش‌فرض باشد
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button>ذخیره مکان</button>
            {location && (
              <button type="button" className="danger" onClick={remove}>
                حذف مکان و تاریخچه
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
