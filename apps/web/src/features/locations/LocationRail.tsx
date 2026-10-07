import type { LocationRecord } from "@better-buy/shared";
import type { ConnectionState } from "../dashboard/types";
import { Icon } from "../dashboard/Icon";
import { ThemeToggle } from "@/components/theme-toggle";
export function LocationRail({
  locations,
  selected,
  connection,
  view,
  onSelect,
  onCreate,
  onEdit,
  onNavigate,
}: {
  locations: LocationRecord[];
  selected: string;
  connection: ConnectionState;
  view: "deals" | "history" | "settings";
  onSelect: (id: string) => void;
  onCreate: () => void;
  onEdit: (location: LocationRecord) => void;
  onNavigate: (view: "deals" | "history" | "settings") => void;
}) {
  return (
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
          onSelect(e.target.value);
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
            onCreate();
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
                onSelect(l.id);
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
                onEdit(l);
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
            onCreate();
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
              onEdit(l);
            }
          }}
          aria-label="ویرایش مکان انتخاب‌شده"
        >
          <Icon name="edit" />
        </button>
        <button
          className={view === "history" ? "active" : ""}
          onClick={() => onNavigate("history")}
        >
          <Icon name="history" />
          تاریخچه اسکن
        </button>
        <button
          className={view === "settings" ? "active" : ""}
          onClick={() => onNavigate("settings")}
        >
          <Icon name="settings" />
          تنظیمات اتصال
        </button>
      </nav>
      <div className="rail-foot">
        <span className={`status-dot ${connection.canScan ? "ok" : "warn"}`} />
        {connection.status === "automatic"
          ? "بدون نیاز به ورود اسنپ‌مارکت"
          : connection.status === "ready"
            ? "اتصال آماده است"
            : connection.status === "expired"
              ? "توکن منقضی شده"
              : connection.status === "disabled"
                ? "جت موقتاً غیرفعال است"
                : "اتصال نیاز به بررسی دارد"}
      </div>
    </aside>
  );
}
