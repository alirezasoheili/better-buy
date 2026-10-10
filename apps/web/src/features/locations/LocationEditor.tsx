"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { AlertDialog } from "radix-ui";
import type { LocationRecord } from "@better-buy/shared";
import { isWithinTehranBoundary } from "@better-buy/shared";
import { useLocationSearch } from "./useLocationSearch";
import { useLocationMutations } from "./useLocationMutations";
const LocationMap = dynamic(() => import("../../app/LocationMap"), {
  ssr: false,
  loading: () => <div className="map-loading">در حال آماده‌سازی نقشه…</div>,
});

export function LocationEditor({
  location,
  onSaved,
}: {
  location: LocationRecord | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(location?.name ?? "");
  const [latitude, setLatitude] = useState(location?.latitude ?? 35.7);
  const [longitude, setLongitude] = useState(location?.longitude ?? 51.4);
  const [isDefault, setDefault] = useState(location?.isDefault ?? false);
  const {
    error,
    pending,
    save: saveLocation,
    remove: removeLocation,
  } = useLocationMutations(location?.id, onSaved);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchState,
    searchError,
    searchAddress,
  } = useLocationSearch();
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void saveLocation({ name, latitude, longitude, isDefault });
  };
  const remove = () => removeLocation(() => setConfirmingRemoval(false));
  return (
    <>
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
        <details onToggle={(event) => setMapOpen(event.currentTarget.open)}>
          <summary>انتخاب روی نقشه (اختیاری)</summary>
          {mapOpen && (
            <LocationMap
              latitude={latitude}
              longitude={longitude}
              onChange={({ lat, lng }) => {
                setLatitude(lat);
                setLongitude(lng);
              }}
            />
          )}
        </details>
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
        {!isWithinTehranBoundary(latitude, longitude) && (
          <p className="form-error" role="status">
            این موقعیت خارج از محدوده تهران است.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            disabled={pending || !isWithinTehranBoundary(latitude, longitude)}
          >
            {pending ? "در حال ذخیره…" : "ذخیره مکان"}
          </button>
          {location && (
            <button
              type="button"
              className="danger"
              disabled={pending}
              onClick={() => setConfirmingRemoval(true)}
            >
              حذف مکان و تاریخچه
            </button>
          )}
        </div>
      </form>
      {location && (
        <AlertDialog.Root
          open={confirmingRemoval}
          onOpenChange={setConfirmingRemoval}
        >
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="sheet-backdrop" />
            <AlertDialog.Content className="panel delete-confirmation">
              <AlertDialog.Title>حذف «{location.name}»؟</AlertDialog.Title>
              <AlertDialog.Description>
                همه تاریخچه اسکن‌ها و پیشنهادهای این موقعیت برای همیشه حذف
                می‌شوند. این کار قابل بازگشت نیست.
              </AlertDialog.Description>
              <div>
                <AlertDialog.Cancel asChild>
                  <button type="button" disabled={pending}>
                    انصراف
                  </button>
                </AlertDialog.Cancel>
                <button
                  type="button"
                  className="danger"
                  disabled={pending}
                  onClick={() => void remove()}
                >
                  حذف همیشگی
                </button>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      )}
    </>
  );
}
