"use client";

import type { CircleMarker, Map as LeafletMap, Polyline } from "leaflet";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { createTrip } from "@/app/actions/owner";
import { currencyLabels, isSupportedCurrency, supportedCurrencies, type SupportedCurrency } from "@/domain/currencies";

type RoutePoint = { latitude: number; longitude: number };
type PointKind = "origin" | "via" | "destination";
type GeocodingResult = RoutePoint & { id: string; label: string; city: string | null };
type RoutingAlternative = {
  id: string;
  distanceKm: number;
  durationMinutes: number;
  coordinates: Array<[number, number]>;
};

type TripCreateFormProps = {
  organizationId: string;
  vehicles: Array<{ id: string; displayName: string; plateNumber: string; status: string }>;
  drivers: Array<{ id: string; displayName: string; status: string; assignedVehicleId: string | null }>;
  baseCurrency: string;
  canManageFinance: boolean;
  today: string;
};

export function TripCreateForm({ organizationId, vehicles, drivers, baseCurrency, canManageFinance, today }: TripCreateFormProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const leafletModule = useRef<typeof import("leaflet") | null>(null);
  const originMarker = useRef<CircleMarker | null>(null);
  const viaMarker = useRef<CircleMarker | null>(null);
  const destinationMarker = useRef<CircleMarker | null>(null);
  const routeLayers = useRef<Map<string, Polyline>>(new Map());
  const originAddressRef = useRef("");
  const viaAddressRef = useRef("");
  const destinationAddressRef = useRef("");
  const activePointRef = useRef<PointKind>("origin");
  const [activePoint, setActivePoint] = useState<PointKind>("origin");
  const [originPoint, setOriginPoint] = useState<RoutePoint | null>(null);
  const [viaPoint, setViaPoint] = useState<RoutePoint | null>(null);
  const [destinationPoint, setDestinationPoint] = useState<RoutePoint | null>(null);
  const [originCity, setOriginCity] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [originAddress, setOriginAddress] = useState("");
  const [viaAddress, setViaAddress] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [routeAlternatives, setRouteAlternatives] = useState<RoutingAlternative[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [routing, setRouting] = useState(false);
  const [routingError, setRoutingError] = useState("");
  const [routingProvider, setRoutingProvider] = useState<"google" | "osrm" | "">("");
  const [alternativesMode, setAlternativesMode] = useState<"provider" | "automatic-corridors" | "explicit-waypoint" | "">("");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const baseCurrencyCode: SupportedCurrency = isSupportedCurrency(baseCurrency) ? baseCurrency : "KZT";
  const [incomeCurrency, setIncomeCurrency] = useState<SupportedCurrency>(baseCurrencyCode);
  const needsFxRate = incomeCurrency !== baseCurrencyCode;
  const activeVehicles = vehicles.filter((vehicle) => vehicle.status === "ACTIVE");
  const selectedDriver = drivers.find((driver) => driver.id === driverId) ?? null;
  const selectedRoute = routeAlternatives.find((route) => route.id === selectedRouteId) ?? null;

  function selectDriver(nextDriverId: string) {
    setDriverId(nextDriverId);
    const assignedVehicleId = drivers.find((driver) => driver.id === nextDriverId)?.assignedVehicleId ?? null;
    setVehicleId(assignedVehicleId && activeVehicles.some((vehicle) => vehicle.id === assignedVehicleId) ? assignedVehicleId : "");
  }

  const choosePoint = useCallback((point: PointKind) => {
    activePointRef.current = point;
    setActivePoint(point);
    setSearchQuery(point === "origin" ? originAddressRef.current : point === "via" ? viaAddressRef.current : destinationAddressRef.current);
    setSearchResults([]);
    setSearchError("");
  }, []);

  const selectRoute = useCallback((routeId: string, routeDistanceKm?: number) => {
    setSelectedRouteId(routeId);
    if (routeDistanceKm !== undefined) setDistanceKm(String(routeDistanceKm));
    for (const [id, layer] of routeLayers.current) {
      const selected = id === routeId;
      layer.setStyle({ color: selected ? "#166b4f" : "#87948e", weight: selected ? 6 : 4, opacity: selected ? .92 : .58 });
      if (selected) layer.bringToFront();
    }
  }, []);

  const placePoint = useCallback((kind: PointKind, point: RoutePoint, focus = false) => {
    const leaflet = leafletModule.current;
    const currentMap = map.current;
    if (!leaflet || !currentMap) return;
    for (const layer of routeLayers.current.values()) layer.remove();
    routeLayers.current.clear();
    setRouteAlternatives([]);
    setSelectedRouteId("");
    setRoutingError("");
    const isOrigin = kind === "origin";
    const isVia = kind === "via";
    const markerRef = isOrigin ? originMarker : isVia ? viaMarker : destinationMarker;
    markerRef.current?.remove();
    markerRef.current = leaflet.circleMarker([point.latitude, point.longitude], {
      radius: 8,
      weight: 3,
      color: isOrigin ? "#166b4f" : isVia ? "#3568b8" : "#de7b32",
      fillColor: "#ffffff",
      fillOpacity: 1,
    }).addTo(currentMap).bindTooltip(isOrigin ? "Погрузка" : isVia ? "Через" : "Выгрузка", { permanent: true, direction: "top" });
    if (focus) currentMap.setView([point.latitude, point.longitude], 14);
    if (isOrigin) {
      setOriginPoint(point);
      choosePoint("destination");
    } else if (isVia) {
      setViaPoint(point);
    } else {
      setDestinationPoint(point);
    }
  }, [choosePoint]);

  useEffect(() => {
    let cancelled = false;
    let mountedMap: LeafletMap | null = null;
    const mountedRouteLayers = routeLayers.current;

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
      mountedRouteLayers.clear();
    };
  }, [placePoint]);

  useEffect(() => {
    const currentMap = map.current;
    const leaflet = leafletModule.current;
    if (!originPoint || !destinationPoint || !currentMap || !leaflet) return;
    const routeMap = currentMap;
    const routeLeaflet = leaflet;

    const controller = new AbortController();
    const activeRouteLayers = routeLayers.current;
    const query = new URLSearchParams({
      origin: `${originPoint.latitude},${originPoint.longitude}`,
      destination: `${destinationPoint.latitude},${destinationPoint.longitude}`,
    });
    if (viaPoint) query.set("via", `${viaPoint.latitude},${viaPoint.longitude}`);

    async function loadRoutes() {
      setRouting(true);
      try {
        const response = await fetch(`/api/routing?${query}`, { signal: controller.signal });
        const payload = await response.json() as { routes?: RoutingAlternative[]; provider?: "google" | "osrm"; alternativesMode?: "provider" | "automatic-corridors" | "explicit-waypoint"; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Не удалось построить маршрут.");
        const routes = payload.routes ?? [];
        if (controller.signal.aborted || !routes.length) return;
        setRouteAlternatives(routes);
        setRoutingProvider(payload.provider ?? "osrm");
        setAlternativesMode(payload.alternativesMode ?? "provider");
        setSelectedRouteId(routes[0].id);
        setDistanceKm(String(routes[0].distanceKm));
        for (const [index, route] of routes.entries()) {
          const selected = index === 0;
          const layer = routeLeaflet.polyline(
            route.coordinates.map(([longitude, latitude]) => [latitude, longitude]),
            { color: selected ? "#166b4f" : "#87948e", weight: selected ? 6 : 4, opacity: selected ? .92 : .58 },
          ).addTo(routeMap);
          layer.on("click", () => selectRoute(route.id, route.distanceKm));
          activeRouteLayers.set(route.id, layer);
        }
        activeRouteLayers.get(routes[0].id)?.bringToFront();
        const primaryRoute = activeRouteLayers.get(routes[0].id);
        if (primaryRoute) routeMap.fitBounds(primaryRoute.getBounds(), { padding: [24, 24] });
      } catch (caught) {
        if (!controller.signal.aborted) setRoutingError(caught instanceof Error ? caught.message : "Не удалось построить маршрут.");
      } finally {
        if (!controller.signal.aborted) setRouting(false);
      }
    }

    void loadRoutes();

    return () => controller.abort();
  }, [destinationPoint, originPoint, selectRoute, viaPoint]);

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
      originAddressRef.current = result.label;
    } else if (kind === "via") {
      setViaAddress(result.label);
      viaAddressRef.current = result.label;
    } else {
      if (result.city) setDestinationCity(result.city);
      setDestinationAddress(result.label);
      destinationAddressRef.current = result.label;
    }
    placePoint(kind, { latitude: result.latitude, longitude: result.longitude }, true);
    if (kind !== "origin") setSearchQuery(result.label);
    setSearchResults([]);
    setSearchError("");
  }

  function clearViaPoint() {
    viaMarker.current?.remove();
    viaMarker.current = null;
    setViaPoint(null);
    setViaAddress("");
    viaAddressRef.current = "";
    if (activePointRef.current === "via") setSearchQuery("");
    for (const layer of routeLayers.current.values()) layer.remove();
    routeLayers.current.clear();
    setRouteAlternatives([]);
    setSelectedRouteId("");
    setRoutingError("");
  }

  return (
    <form action={createTrip} className="flow-card trip-create-card">
      <div className="flow-card-heading"><span className="flow-step">1</span><span><b>Рейс</b><small>Маршрут, адреса и точки на карте</small></span></div>
      <input type="hidden" name="organization_id" value={organizationId} />
      <input type="hidden" name="origin_latitude" value={originPoint?.latitude ?? ""} readOnly />
      <input type="hidden" name="origin_longitude" value={originPoint?.longitude ?? ""} readOnly />
      <input type="hidden" name="destination_latitude" value={destinationPoint?.latitude ?? ""} readOnly />
      <input type="hidden" name="destination_longitude" value={destinationPoint?.longitude ?? ""} readOnly />
      <input type="hidden" name="route_geometry" value={selectedRoute ? JSON.stringify(selectedRoute.coordinates) : ""} readOnly />
      <div className="flow-fields trip-fields">
        <label className="flow-field flow-field-wide"><span>Название рейса</span><input name="title" placeholder="Например: Алматы → Москва" required /></label>
        <label className="flow-field"><span>Автомобиль</span><select name="vehicle_id" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} required disabled={!activeVehicles.length}><option value="">Выберите машину</option>{activeVehicles.map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.plateNumber}</option>)}</select></label>
        <label className="flow-field"><span>Водитель</span><select name="driver_id" value={driverId} onChange={(event) => selectDriver(event.target.value)}><option value="">Назначить позже</option>{drivers.filter((driver) => driver.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select>{selectedDriver?.assignedVehicleId ? <small>Закреплённая машина подставлена автоматически.</small> : null}</label>
        <label className="flow-field"><span>Город погрузки</span><input name="origin_city" value={originCity} onChange={(event) => setOriginCity(event.target.value)} placeholder="Например: Алматы" required /></label>
        <label className="flow-field"><span>Город выгрузки</span><input name="destination_city" value={destinationCity} onChange={(event) => setDestinationCity(event.target.value)} placeholder="Например: Москва" required /></label>
        <label className="flow-field flow-field-wide"><span>Адрес погрузки</span><input name="origin_address" value={originAddress} onChange={(event) => { setOriginAddress(event.target.value); originAddressRef.current = event.target.value; }} placeholder="Улица, дом, склад или ориентир" required /></label>
        <label className="flow-field flow-field-wide"><span>Адрес выгрузки</span><input name="destination_address" value={destinationAddress} onChange={(event) => { setDestinationAddress(event.target.value); destinationAddressRef.current = event.target.value; }} placeholder="Улица, дом, склад или ориентир" required /></label>
        <label className="flow-field"><span>Тип пробега</span><select name="load_state" defaultValue="LOADED"><option value="LOADED">С грузом</option><option value="EMPTY">Порожний</option><option value="UNKNOWN">Неизвестно</option></select></label>
        <label className="flow-field"><span>Плановый километраж</span><input name="distance_km" type="number" inputMode="decimal" min="0.1" max="100000" step="0.1" value={distanceKm} onChange={(event) => setDistanceKm(event.target.value)} placeholder="Подставится по маршруту" required /></label>
        <label className="flow-field"><span>Дата старта</span><input name="started_at" type="date" defaultValue={today} required /></label>
        {canManageFinance ? <fieldset className="trip-income-section">
          <legend>Доход рейса <small>вносится вместе с рейсом · учёт в {baseCurrencyCode}</small></legend>
          <div className="trip-income-grid">
            <label className="flow-field"><span>Заказчик</span><input name="customer_name" placeholder="Например: ТОО Логистика" required /></label>
            <label className="flow-field"><span>Сумма дохода</span><input name="income_amount" inputMode="decimal" placeholder="0" required /></label>
            <label className="flow-field"><span>Валюта</span><select name="income_currency" value={incomeCurrency} onChange={(event) => setIncomeCurrency(event.target.value as SupportedCurrency)}>{supportedCurrencies.map((item) => <option key={item} value={item}>{currencyLabels[item]}</option>)}</select></label>
            <label className="flow-field"><span>Ожидаемая оплата</span><input name="expected_payment_at" type="date" /></label>
            {needsFxRate ? <label className="flow-field flow-field-wide fx-rate-field"><span>Курс к {baseCurrencyCode}</span><input name="fx_rate" inputMode="decimal" placeholder={`1 ${incomeCurrency} = сколько ${baseCurrencyCode}`} required /><small>Курс на дату договорённости с заказчиком.</small></label> : <input type="hidden" name="fx_rate" value="1" />}
            <label className="flow-field flow-field-wide"><span>Комментарий к оплате</span><input name="income_comment" placeholder="Необязательно" /></label>
          </div>
        </fieldset> : <p className="trip-finance-access-note">Доход добавляет сотрудник с правом «Финансы». Рейс будет создан без финансовых данных.</p>}
        <div className="route-map-field flow-field-wide">
          <span>Точные точки на карте <small>необязательно</small></span>
          <div className="route-map-controls">
            <button type="button" className={activePoint === "origin" ? "active" : ""} onClick={() => choosePoint("origin")}>1. Точка погрузки{originPoint ? " ✓" : ""}</button>
            <button type="button" className={activePoint === "via" ? "active" : ""} onClick={() => choosePoint("via")}>2. Через <small>необязательно</small>{viaPoint ? " ✓" : ""}</button>
            <button type="button" className={activePoint === "destination" ? "active" : ""} onClick={() => choosePoint("destination")}>3. Точка выгрузки{destinationPoint ? " ✓" : ""}</button>
            {viaPoint ? <button type="button" className="route-via-clear" onClick={clearViaPoint}>Убрать «Через»</button> : null}
          </div>
          {viaAddress ? <p className="route-via-summary"><b>Маршрут через:</b> {viaAddress}</p> : null}
          <div className="route-search">
            <label htmlFor="route-point-search">Поиск: {activePoint === "origin" ? "точка погрузки" : activePoint === "via" ? "промежуточная точка «Через»" : "точка выгрузки"}</label>
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
          <div ref={mapContainer} className="route-map" role="application" aria-label="Карта выбора погрузки, промежуточной точки и выгрузки" />
          {routing ? <div className="route-building" role="status">Строю варианты автомобильного маршрута…</div> : null}
          {routingError ? <span className="route-search-error" role="status">{routingError}</span> : null}
          {routeAlternatives.length ? <div className="route-alternatives" aria-label="Варианты маршрута">
            <div><b>Варианты маршрута</b><small>Нажмите вариант или линию на карте</small></div>
            <div className="route-alternative-list">{routeAlternatives.map((route, index) => <button type="button" className={selectedRouteId === route.id ? "active" : ""} onClick={() => selectRoute(route.id, route.distanceKm)} key={route.id}>
              <span>Вариант {index + 1}</span><strong>{route.distanceKm.toLocaleString("ru-RU")} км</strong><small>≈ {Math.floor(route.durationMinutes / 60)} ч {route.durationMinutes % 60} мин</small>
            </button>)}</div>
            <small>{routingProvider === "google"
              ? alternativesMode === "explicit-waypoint" ? "Маршрут построен через выбранную промежуточную точку Google Routes." : "Альтернативы рассчитаны Google Routes."
              : alternativesMode === "explicit-waypoint"
                ? "Все показанные маршруты проходят через выбранную промежуточную точку."
              : alternativesMode === "automatic-corridors"
                ? "Основной маршрут рассчитан OSRM; дополнительные варианты найдены автоматически по другим дорожным коридорам."
                : "Альтернативы рассчитаны OSRM / OpenStreetMap."} Фактическое время зависит от границ, пробок и ограничений для грузовиков.</small>
          </div> : null}
          <small>Погрузка и выгрузка обязательны для расчёта. Если нужен конкретный коридор, добавьте необязательную точку «Через» поиском или нажатием на карту.</small>
        </div>
      </div>
      <div className="flow-card-action"><button type="submit" disabled={!activeVehicles.length}>Создать рейс{canManageFinance ? " с доходом" : ""}</button></div>
    </form>
  );
}
