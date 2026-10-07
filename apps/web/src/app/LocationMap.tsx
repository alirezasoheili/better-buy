"use client";

import { useCallback, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Rectangle,
  TileLayer,
  useMapEvents,
} from "react-leaflet";
import { divIcon, Marker as LeafletMarker, type LatLngLiteral } from "leaflet";
import { isWithinTehranBoundary, TEHRAN_BOUNDARY } from "@better-buy/shared";

const TEHRAN_CENTER: LatLngLiteral = { lat: 35.7, lng: 51.4 };
const TEHRAN_BOUNDS: [[number, number], [number, number]] = [
  [TEHRAN_BOUNDARY.minLatitude, TEHRAN_BOUNDARY.minLongitude],
  [TEHRAN_BOUNDARY.maxLatitude, TEHRAN_BOUNDARY.maxLongitude],
];

function PickPoint({
  onPick,
  onOutsidePick,
}: {
  onPick: (point: LatLngLiteral) => void;
  onOutsidePick: () => void;
}) {
  useMapEvents({
    click: (event) => {
      const point = { lat: event.latlng.lat, lng: event.latlng.lng };
      if (isWithinTehranBoundary(point.lat, point.lng)) {
        onPick(point);
      } else {
        onOutsidePick();
      }
    },
  });

  return null;
}

function SelectionPin({
  point,
  onPick,
  onOutsidePick,
}: {
  point: LatLngLiteral;
  onPick: (point: LatLngLiteral) => void;
  onOutsidePick: () => void;
}) {
  const icon = useMemo(
    () =>
      divIcon({
        className: "location-pin-icon",
        iconSize: [34, 42],
        iconAnchor: [17, 39],
        html: '<span class="location-pin-core" aria-hidden="true"></span>',
      }),
    []
  );

  const handleDragEnd = useCallback(
    (event: { target: LeafletMarker }) => {
      const marker = event.target;
      const nextPoint = marker.getLatLng();
      const next = { lat: nextPoint.lat, lng: nextPoint.lng };

      if (isWithinTehranBoundary(next.lat, next.lng)) {
        onPick(next);
      } else {
        marker.setLatLng(point);
        onOutsidePick();
      }
    },
    [onOutsidePick, onPick, point]
  );

  return (
    <Marker
      position={point}
      icon={icon}
      draggable
      keyboard
      title="موقعیت انتخاب‌شده"
      alt="موقعیت انتخاب‌شده؛ برای جابه‌جایی بکشید"
      eventHandlers={{ dragend: handleDragEnd }}
    />
  );
}

export default function LocationMap({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number;
  longitude: number;
  onChange: (point: LatLngLiteral) => void;
}) {
  const suppliedPoint = { lat: latitude, lng: longitude };
  const hasValidPoint = isWithinTehranBoundary(latitude, longitude);
  const center = hasValidPoint ? suppliedPoint : TEHRAN_CENTER;
  const [mapNotice, setMapNotice] = useState<"outside" | "tiles" | null>(null);

  const handlePick = useCallback(
    (point: LatLngLiteral) => {
      setMapNotice(null);
      onChange(point);
    },
    [onChange]
  );
  const handleOutsidePick = useCallback(() => {
    setMapNotice("outside");
  }, []);
  const handleTileError = useCallback(() => {
    setMapNotice("tiles");
  }, []);

  const recenter = useCallback(
    (map: import("leaflet").Map | null) => {
      map?.setView(
        hasValidPoint ? { lat: latitude, lng: longitude } : TEHRAN_CENTER
      );
    },
    [latitude, longitude, hasValidPoint]
  );
  const status =
    !hasValidPoint || mapNotice === "outside"
      ? "این محدوده خارج از شهر تهران است؛ یک نقطه داخل کادر انتخاب کنید."
      : mapNotice === "tiles"
        ? "نمایش نقشه موقتاً در دسترس نیست؛ می‌توانید مختصات را از فیلدهای پایین وارد کنید."
        : "نقطه را بکشید یا روی نقشه کلیک کنید. محدوده پشتیبانی فعلاً تهران است.";

  return (
    <div
      className="location-map"
      role="region"
      aria-label="نقشه انتخاب موقعیت در تهران"
    >
      <MapContainer
        ref={recenter}
        center={center}
        zoom={14}
        minZoom={11}
        maxZoom={18}
        maxBounds={TEHRAN_BOUNDS}
        maxBoundsViscosity={0.88}
        scrollWheelZoom
        className="leaflet-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: handleTileError }}
        />
        <Rectangle
          bounds={TEHRAN_BOUNDS}
          pathOptions={{
            color: "var(--primary)",
            weight: 2,
            dashArray: "7 7",
            fillColor: "var(--primary)",
            fillOpacity: 0.035,
          }}
        />
        <PickPoint onPick={handlePick} onOutsidePick={handleOutsidePick} />
        <SelectionPin
          point={center}
          onPick={handlePick}
          onOutsidePick={handleOutsidePick}
        />
      </MapContainer>
      <p
        className={`location-map-status${!hasValidPoint || mapNotice ? " is-warning" : ""}`}
        role="status"
        aria-live="polite"
      >
        <span aria-hidden="true" />
        {status}
      </p>
    </div>
  );
}
