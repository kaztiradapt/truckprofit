"use client";

import type { CircleMarker, Map as LeafletMap } from "leaflet";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { createTrip } from "@/app/actions/owner";

type RoutePoint = { latitude: number; longitude: number };
type PointKind = "origin" | "destination";
type GeocodingResult = RoutePoint & { id: string; label: string; city: string | null };

type TripCreateFormProps = {
  organizationId: string;
  vehicles: Array<{ id: string; displayName: string; plateNumber: string }>;
  drivers: Array<{ id: string; displayName: string }>;
  today: string;
};

export function TripCreateForm({ organizationId, vehicles, drivers, today }: TripCreateFormProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const leafletModule = useRef<typeof import("leaflet") | null>(null);
  const originMarker = useRef<CircleMarker | null>(null);
  const destinationMarker = useRef<CircleMarker | null>(null);
  const activePointRef = useRef<PointKind>("origin");
  const [activePoint, setActivePoint] = useState<PointKind>("origin");
  const [originPoint, setOriginPoint] = useState<RoutePoint | null>(null);
  const [destinationPoint, setDestinationPoint] = useState<RoutePoint | null>(null);
  const [originCity, setOriginCity] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [originAddress, setOriginAddress] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const choosePoint = useCallback((point: PointKind) => {
    activePointRef.current = point;
    setActivePoint(point);
    setSearchResults([]);
    setSearchError("");
  }, []);

  const placePoint = useCallback((kind: PointKind, point: RoutePoint, focus = false) => {
    const leaflet = leafletModule.current;
    const currentMap = map.current;
    if (!leaflet || !currentMap) return;
    const isOrigin = kind === "origin";
    const markerRef = isOrigin ? originMarker : destinationMarker;
    markerRef.current?.remove();
    markerRef.current = leaflet.circleMarker([point.latitude, point.longitude], {
      radius: 8,
      weight: 3,
      color: isOrigin ? "#166b4f" : "#de7b32",
      fillColor: "#ffffff",
      fillOpacity: 1,
    }).addTo(currentMap).bindTooltip(isOrigin ? "Погрузка" : "Выгрузка", { permanent: true, direction: "top" });
    if (focus) currentMap.setView([point.latitude, point.longitude], 14);
    if (isOrigin) {
      setOriginPoint(point);
      choosePoint("destination");
    } else {
      setDestinationPoint(point);
    }
  }, [choosePoint]);

  useEffect(() => {
    let cancelled = false;
    let mountedMap: LeafletMap | null = null;

    void import("leaflet").then((leaflet) => {
      if (cancelled || !mapContainer.current) return;
      leafletModule.current = leaflet;
      mountedMap = leaflet.map(mapContainer.current, { zoomControl: true, attributionControl: true }).setView([48.1, 67.1], 4);
      map.current = mountedMap;
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mountedMap);
      mountedMap.on("click", (event) => {
        const point = { latitude: Number(event.latlng.lat.toFixed(6)), longitude: Number(event.latlng.lng.toFixed(6)) };
        placePoint(activePointRef.current, point);
      });
      window.setTimeout(() => mountedMap?.invalidateSize(), 0);
    });

    return () => {
      cancelled = true;
      mountedMap?.remove();
      map.current = null;
      leafletModule.current = null;
    };
  }, [placePoint]);

  async function searchAddress() {
    const query = searchQuery.trim();
    if (query.length < 3) {
      setSearchError("Введите минимум 3 символа.");
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    try {
      const response = await fetch(`/api/geocoding/search?q=${encodeURIComponent(query)}`);
      const payload = await response.json() as { results?: GeocodingResult[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось найти адрес.");
      const results = payload.results ?? [];
      setSearchResults(results);
      if (!results.length) setSearchError("Ничего не найдено. Уточните город, улицу или номер здания.");
    } catch (caught) {
      setSearchError(caught instanceof Error ? caught.message : "Не удалось найти адрес.");
    } finally {
      setSearching(false);
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void searchAddress();
  }

  function selectSearchResult(result: GeocodingResult) {
    const kind = activePointRef.current;
    if (kind === "origin") {
      if (result.city) setOriginCity(result.city);
      setOriginAddress(result.label);
    } else {
      if (result.city) setDestinationCity(result.city);
      setDestinationAddress(result.label);
    }
    placePoint(kind, { latitude: result.latitude, longitude: result.longitude }, true);
    setSearchQuery(result.label);
    setSearchResults([]);
    setSearchError("");
  }

  return (
    <form action={createTrip} className="flow-card trip-create-card">
      <div className="flow-card-heading"><span className="flow-step">1</span><span><b>Рейс</b><small>Маршрут, адреса и точки на карте</small></span></div>
      <input type="hidden" name="organization_id" value={organizationId} />
      <input type="hidden" name="origin_latitude" value={originPoint?.latitude ?? ""} readOnly />
      <input type="hidden" name="origin_longitude" value={originPoint?.longitude ?? ""} readOnly />
      <input type="hidden" name="destination_latitude" value={destinationPoint?.latitude ?? ""} readOnly />
      <input type="hidden" name="destination_longitude" value={destinationPoint?.longitude ?? ""} readOnly />
      <div className="flow-fields trip-fields">
        <label className="flow-field flow-field-wide"><span>Название рейса</span><input name="title" placeholder="Например: Алматы → Москва" required /></label>
        <label className="flow-field"><span>Автомобиль</span><select name="vehicle_id" required disabled={!vehicles.length}><option value="">Выберите машину</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.plateNumber}</option>)}</select></label>
        <label className="flow-field"><span>Водитель</span><select name="driver_id"><option value="">Назначить позже</option>{drivers.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
        <label className="flow-field"><span>Город погрузки</span><input name="origin_city" value={originCity} onChange={(event) => setOriginCity(event.target.value)} placeholder="Например: Алматы" required /></label>
        <label className="flow-field"><span>Город выгрузки</span><input name="destination_city" value={destinationCity} onChange={(event) => setDestinationCity(event.target.value)} placeholder="Например: Москва" required /></label>
        <label className="flow-field flow-field-wide"><span>Адрес погрузки</span><input name="origin_address" value={originAddress} onChange={(event) => setOriginAddress(event.target.value)} placeholder="Улица, дом, склад или ориентир" required /></label>
        <label className="flow-field flow-field-wide"><span>Адрес выгрузки</span><input name="destination_address" value={destinationAddress} onChange={(event) => setDestinationAddress(event.target.value)} placeholder="Улица, дом, склад или ориентир" required /></label>
        <label className="flow-field"><span>Тип пробега</span><select name="load_state" defaultValue="LOADED"><option value="LOADED">С грузом</option><option value="EMPTY">Порожний</option><option value="UNKNOWN">Неизвестно</option></select></label>
        <label className="flow-field"><span>Дата старта</span><input name="started_at" type="date" defaultValue={today} required /></label>
        <div className="route-map-field flow-field-wide">
          <span>Точные точки на карте <small>необязательно</small></span>
          <div className="route-map-controls">
            <button type="button" className={activePoint === "origin" ? "active" : ""} onClick={() => choosePoint("origin")}>1. Точка погрузки{originPoint ? " ✓" : ""}</button>
            <button type="button" className={activePoint === "destination" ? "active" : ""} onClick={() => choosePoint("destination")}>2. Точка выгрузки{destinationPoint ? " ✓" : ""}</button>
          </div>
          <div className="route-search">
            <label htmlFor="route-point-search">Поиск: {activePoint === "origin" ? "точка погрузки" : "точка выгрузки"}</label>
            <div className="route-search-input">
              <input id="route-point-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={handleSearchKeyDown} placeholder="Город, улица, склад или ориентир" />
              <button type="button" onClick={() => void searchAddress()} disabled={searching}>{searching ? "Ищу…" : "Найти"}</button>
            </div>
            {searchError ? <span className="route-search-error" role="status">{searchError}</span> : null}
            {searchResults.length ? <div className="route-search-results" role="listbox" aria-label="Найденные адреса">
              {searchResults.map((result) => <button type="button" role="option" aria-selected="false" onClick={() => selectSearchResult(result)} key={result.id}><span>{result.label}</span>{result.city ? <small>{result.city}</small> : null}</button>)}
            </div> : null}
            <small>Поиск выполняется только по кнопке. Данные карты © OpenStreetMap.</small>
          </div>
          <div ref={mapContainer} className="route-map" role="application" aria-label="Карта выбора погрузки и выгрузки" />
          <small>Выберите тип точки и нажмите нужное место на карте. Адрес всё равно указывается текстом выше.</small>
        </div>
      </div>
      <div className="flow-card-action"><button type="submit" disabled={!vehicles.length}>Создать рейс</button></div>
    </form>
  );
}
