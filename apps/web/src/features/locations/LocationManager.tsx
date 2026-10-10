"use client";
import { useCallback, useState } from "react";
import { Dialog } from "radix-ui";
import type { LocationRecord } from "@better-buy/shared";
import { LocationEditor } from "./LocationEditor";

type LocationView =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; location: LocationRecord };

export function LocationManager({
  locations,
  initialView,
  onClose,
  onSaved,
}: {
  locations: LocationRecord[];
  initialView: "list" | "create";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [view, setView] = useState<LocationView>({ kind: initialView });
  const [returnFocusTo] = useState(() =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  );
  const showList = () => setView({ kind: "list" });
  const focusListTitle = useCallback(
    (element: HTMLHeadingElement | null) => {
      if (view.kind === "list") element?.focus();
    },
    [view.kind]
  );
  const title =
    view.kind === "list"
      ? "موقعیت‌های تحویل"
      : view.kind === "edit"
        ? "ویرایش مکان"
        : "افزودن موقعیت تحویل";

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-backdrop" />
        <Dialog.Content
          className={
            view.kind === "list" ? "panel" : "location-sheet map-sheet"
          }
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusTo?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (view.kind !== "list") {
              event.preventDefault();
              showList();
            }
          }}
        >
          <header className="panel-heading">
            <Dialog.Title key={view.kind} tabIndex={-1} ref={focusListTitle}>
              {title}
            </Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="بستن پنجره مکان">
              ×
            </Dialog.Close>
          </header>
          {view.kind === "list" ? (
            <>
              <p className="muted">
                موقعیت تحویل، پیشنهادهای قابل بررسی را مشخص می‌کند.
              </p>
              <div className="location-list">
                {locations.map((location) => (
                  <div className="location-item" key={location.id}>
                    <div>
                      <strong>{location.name}</strong>
                      <small>
                        <bdi dir="ltr">
                          {location.latitude.toFixed(4)},{" "}
                          {location.longitude.toFixed(4)}
                        </bdi>
                        {location.isDefault && " · پیش‌فرض"}
                      </small>
                    </div>
                    <button
                      onClick={() => setView({ kind: "edit", location })}
                      aria-label={`ویرایش ${location.name}`}
                    >
                      ویرایش
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="primary"
                onClick={() => setView({ kind: "create" })}
              >
                افزودن موقعیت تحویل
              </button>
            </>
          ) : (
            <>
              <button type="button" className="back-button" onClick={showList}>
                بازگشت به موقعیت‌ها
              </button>
              <LocationEditor
                key={view.kind === "edit" ? view.location.id : "create"}
                location={view.kind === "edit" ? view.location : null}
                onSaved={() => {
                  onSaved();
                  if (initialView === "create") onClose();
                  else showList();
                }}
              />
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
