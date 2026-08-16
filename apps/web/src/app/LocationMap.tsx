"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LatLngLiteral } from "leaflet";

function Recenter({ center }: { center: LatLngLiteral }) {
  const map = useMap();
  useEffect(() => { map.setView(center); }, [center, map]);
  return null;
}

function PickPoint({ onPick }: { onPick: (point: LatLngLiteral) => void }) {
  useMapEvents({ click: (event) => onPick(event.latlng) });
  return null;
}

export default function LocationMap({ latitude, longitude, onChange }: { latitude: number; longitude: number; onChange: (point: LatLngLiteral) => void }) {
  const center = { lat: latitude, lng: longitude };
  return <div className="location-map" role="application" aria-label="نقشه انتخاب موقعیت؛ برای تعیین مختصات روی نقشه کلیک کنید">
    <MapContainer center={center} zoom={14} scrollWheelZoom className="leaflet-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Recenter center={center} />
      <PickPoint onPick={onChange} />
      <CircleMarker center={center} radius={10} pathOptions={{ color: "#fffdf7", weight: 3, fillColor: "#f4511e", fillOpacity: 1 }} />
    </MapContainer>
    <p>برای انتخاب موقعیت روی نقشه کلیک کنید؛ مختصات پایین به‌صورت خودکار به‌روزرسانی می‌شوند.</p>
  </div>;
}
