"use client";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Dialog } from "radix-ui";
import type { LocationRecord } from "@better-buy/shared";
import { useLocationSearch } from "./useLocationSearch";
import { useLocationMutations } from "./useLocationMutations";
const LocationMap = dynamic(() => import("../../app/LocationMap"), {
  ssr: false,
  loading: () => <div className="map-loading">در حال آماده‌سازی نقشه…</div>,
});

export function LocationEditor({
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
  const [isDefault, setDefault] = useState(location?.isDefault ?? false);
  const {
    error,
    save: saveLocation,
    remove: removeLocation,
  } = useLocationMutations(location?.id, onSaved);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchState,
    searchError,
    searchAddress,
  } = useLocationSearch();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [returnFocusTo] = useState(() =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  );
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void saveLocation({ name, latitude, longitude, isDefault });
  };
  const remove = () => removeLocation(() => setConfirmingRemoval(false));
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !required) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-backdrop">
          <Dialog.Content
            ref={dialogRef}
            className="location-sheet map-sheet"
            aria-describedby={undefined}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              dialogRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              returnFocusTo?.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (required) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (required) event.preventDefault();
            }}
            aria-labelledby="location-title"
            tabIndex={-1}
          >
            <button
              className="sheet-close"
              onClick={onClose}
              aria-label="بستن پنجره مکان"
            >
              ×
            </button>
            <span>قفسه محلی</span>
            <Dialog.Title asChild>
              <h2 id="location-title">
                {location ? "ویرایش مکان" : "افزودن مکان روی نقشه"}
              </h2>
            </Dialog.Title>
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
                <label htmlFor="location-address-search">
                  جست‌وجوی نشانی در تهران
                </label>
                <div className="location-search-control">
                  <input
                    id="location-address-search"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
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
                  <div
                    className="location-search-results"
                    aria-label="نتایج جست‌وجوی نشانی"
                  >
                    {searchResults.map((result) => (
                      <button
                        type="button"
                        key={`${result.latitude}:${result.longitude}:${result.displayName}`}
                        onClick={() => {
                          setLatitude(result.latitude);
                          setLongitude(result.longitude);
                          setSearchQuery(result.displayName);
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
                  <button
                    type="button"
                    className="danger"
                    onClick={() => setConfirmingRemoval(true)}
                  >
                    حذف مکان و تاریخچه
                  </button>
                )}
              </div>
            </form>
            {confirmingRemoval && location && (
              <section
                className="delete-confirmation"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="delete-location-title"
              >
                <h3 id="delete-location-title">حذف «{location.name}»؟</h3>
                <p>
                  همه تاریخچه اسکن‌ها و پیشنهادهای این موقعیت برای همیشه حذف
                  می‌شوند. این کار قابل بازگشت نیست.
                </p>
                <div>
                  <button
                    type="button"
                    onClick={() => setConfirmingRemoval(false)}
                  >
                    انصراف
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void remove()}
                  >
                    حذف همیشگی
                  </button>
                </div>
              </section>
            )}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
