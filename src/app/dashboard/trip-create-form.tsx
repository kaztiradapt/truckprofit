"use client";

import type { CircleMarker, Map as LeafletMap } from "leaflet";
import { useEffect, useRef, useState } from "react";

import { createTrip } from "@/app/actions/owner";

type RoutePoint = { latitude: number; longitude: number };
type PointKind = "origin" | "destination";

type TripCreateFormProps = {
  organizationId: string;
  vehicles: Array<{ id: string; displayName: string; plateNumber: string }>;
  drivers: Array<{ id: string; displayName: string }>;
  today: string;
};

export function TripCreateForm({ organizationId, vehicles, drivers, today }: TripCreateFormProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const originMarker = useRef<CircleMarker | null>(null);
  const destinationMarker = useRef<CircleMarker | null>(null);
  const activePointRef = useRef<PointKind>("origin");
  const [activePoint, setActivePoint] = useState<PointKind>("origin");
  const [originPoint, setOriginPoint] = useState<RoutePoint | null>(null);
  const [destinationPoint, setDestinationPoint] = useState<RoutePoint | null>(null);

  function choosePoint(point: PointKind) {
    activePointRef.current = point;
    setActivePoint(point);
  }

  useEffect(() => {
    let cancelled = false;
    let mountedMap: LeafletMap | null = null;

    void import("leaflet").then((leaflet) => {
      if (cancelled || !mapContainer.current) return;
      mountedMap = leaflet.map(mapContainer.current, { zoomControl: true, attributionControl: true }).setView([48.1, 67.1], 4);
      map.current = mountedMap;
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mountedMap);
      mountedMap.on("click", (event) => {
        const point = { latitude: Number(event.latlng.lat.toFixed(6)), longitude: Number(event.latlng.lng.toFixed(6)) };
        const isOrigin = activePointRef.current === "origin";
        const markerRef = isOrigin ? originMarker : destinationMarker;
        markerRef.current?.remove();
        markerRef.current = leaflet.circleMarker(event.latlng, {
          radius: 8,
          weight: 3,
          color: isOrigin ? "#166b4f" : "#de7b32",
          fillColor: "#ffffff",
          fillOpacity: 1,
        }).addTo(mountedMap!).bindTooltip(isOrigin ? "Погрузка" : "Выгрузка", { permanent: true, direction: "top" });
        if (isOrigin) {
          setOriginPoint(point);
          choosePoint("destination");
        } else {
          setDestinationPoint(point);
        }
      });
      window.setTimeout(() => mountedMap?.invalidateSize(), 0);
    });

    return () => {
      cancelled = true;
      mountedMap?.remove();
      map.current = null;
    };
  }, []);

  return (
    <form action={createTrip} className="flow-card trip-create-card">
      <div className="flow-card-heading"><span className="flow-step">2</span><span><b>Рейс</b><small>Маршрут, адреса и точки на карте</small></span></div>
      <input type="hidden" name="organization_id" value={organizationId} />
      <input type="hidden" name="origin_latitude" value={originPoint?.latitude ?? ""} readOnly />
      <input type="hidden" name="origin_longitude" value={originPoint?.longitude ?? ""} readOnly />
      <input type="hidden" name="destination_latitude" value={destinationPoint?.latitude ?? ""} readOnly />
      <input type="hidden" name="destination_longitude" value={destinationPoint?.longitude ?? ""} readOnly />
      <div className="flow-fields trip-fields">
        <label className="flow-field flow-field-wide"><span>Название рейса</span><input name="title" placeholder="Например: Алматы → Москва" required /></label>
        <label className="flow-field"><span>Автомобиль</span><select name="vehicle_id" required disabled={!vehicles.length}><option value="">Выберите машину</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.plateNumber}</option>)}</select></label>
        <label className="flow-field"><span>Водитель</span><select name="driver_id"><option value="">Назначить позже</option>{drivers.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
        <label className="flow-field"><span>Город погрузки</span><input name="origin_city" placeholder="Например: Алматы" required /></label>
        <label className="flow-field"><span>Город выгрузки</span><input name="destination_city" placeholder="Например: Москва" required /></label>
        <label className="flow-field flow-field-wide"><span>Адрес погрузки</span><input name="origin_address" placeholder="Улица, дом, склад или ориентир" required /></label>
        <label className="flow-field flow-field-wide"><span>Адрес выгрузки</span><input name="destination_address" placeholder="Улица, дом, склад или ориентир" required /></label>
        <label className="flow-field"><span>Тип пробега</span><select name="load_state" defaultValue="LOADED"><option value="LOADED">С грузом</option><option value="EMPTY">Порожний</option><option value="UNKNOWN">Неизвестно</option></select></label>
        <label className="flow-field"><span>Дата старта</span><input name="started_at" type="date" defaultValue={today} required /></label>
        <div className="route-map-field flow-field-wide">
          <span>Точные точки на карте <small>необязательно</small></span>
          <div className="route-map-controls">
            <button type="button" className={activePoint === "origin" ? "active" : ""} onClick={() => choosePoint("origin")}>1. Точка погрузки{originPoint ? " ✓" : ""}</button>
            <button type="button" className={activePoint === "destination" ? "active" : ""} onClick={() => choosePoint("destination")}>2. Точка выгрузки{destinationPoint ? " ✓" : ""}</button>
          </div>
          <div ref={mapContainer} className="route-map" role="application" aria-label="Карта выбора погрузки и выгрузки" />
          <small>Выберите тип точки и нажмите нужное место на карте. Адрес всё равно указывается текстом выше.</small>
        </div>
      </div>
      <div className="flow-card-action"><button type="submit" disabled={!vehicles.length}>Создать рейс</button></div>
    </form>
  );
}
