"use client";

import type { CircleMarker, Map as LeafletMap, Marker, Polyline } from "leaflet";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { closestRouteToPlannedDistance } from "@/domain/route-alternative";
import { routeGeocodingQueries } from "@/domain/route-endpoint";

type EventType = "CHECKPOINT" | "REST" | "LOADING" | "UNLOADING" | "OTHER";
type LocationPoint = {
  id: string;
  latitude: number;
  longitude: number;
  horizontalAccuracyM: number | null;
  recordedAt: string;
  eventType: EventType;
  note: string | null;
};
type Endpoint = { latitude: number | null; longitude: number | null; label: string; city: string };
type RoutingAlternative = { distanceKm: number; coordinates: Array<[number, number]> };
type ResolvedEndpoint = { latitude: number; longitude: number };
type RouteRecord = {
  title: string;
  vehicleId: string;
  driverId: string | null;
  originCity: string;
  destinationCity: string;
  originAddress: string;
  destinationAddress: string;
  distanceKm: number | null;
  loadState: string;
  startedAt: string | null;
};
type GeocodingResponse = {
  results?: Array<{ latitude: number; longitude: number }>;
  error?: string;
};

const eventLabels: Record<EventType, string> = {
  CHECKPOINT: "Контрольная точка",
  REST: "Ночёвка / отдых",
  LOADING: "Погрузка",
  UNLOADING: "Выгрузка",
  OTHER: "Другое",
};

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("ru-KZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function pointCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return `${count} точка`;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} точки`;
  return `${count} точек`;
}

async function resolveEndpoint(endpoint: Endpoint, signal: AbortSignal): Promise<ResolvedEndpoint | null> {
  if (endpoint.latitude !== null && endpoint.longitude !== null) {
    return { latitude: endpoint.latitude, longitude: endpoint.longitude };
  }
  for (const query of routeGeocodingQueries(endpoint.label, endpoint.city)) {
    const response = await fetch(`/api/geocoding/search?q=${encodeURIComponent(query)}`, { signal });
    const payload = await response.json() as GeocodingResponse;
    if (!response.ok) throw new Error(payload.error ?? "Не удалось определить точку по адресу.");
    const first = payload.results?.[0];
    if (first && Number.isFinite(first.latitude) && Number.isFinite(first.longitude)) {
      return { latitude: first.latitude, longitude: first.longitude };
    }
  }
  return null;
}

function AnnotationForm({ organizationId, tripId, point, onSaved }: {
  organizationId: string;
  tripId: string;
  point: LocationPoint;
  onSaved: (eventType: EventType, note: string | null) => void;
}) {
  const [eventType, setEventType] = useState<EventType>(point.eventType);
  const [note, setNote] = useState(point.note ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/trips/${tripId}/locations/${point.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, eventType, note }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось сохранить отметку.");
      onSaved(eventType, note.trim() || null);
      setMessage("Сохранено");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Не удалось сохранить отметку.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="tracking-annotation">
    <select aria-label="Тип отметки" value={eventType} onChange={(event) => setEventType(event.target.value as EventType)}>
      {Object.entries(eventLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
    </select>
    <input aria-label="Комментарий к отметке" value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder="Например: стоянка на ночь" />
    <button type="button" className="tiny-button" disabled={saving} onClick={() => void save()}>{saving ? "Сохраняю…" : "Сохранить"}</button>
    {message ? <small className={message === "Сохранено" ? "tracking-saved" : "inline-error"}>{message}</small> : null}
  </div>;
}

export function TripTrackingMap({ organizationId, tripId, routeRecord, origin, destination, initialPoints, canManage }: {
  organizationId: string;
  tripId: string;
  routeRecord: RouteRecord;
  origin: Endpoint;
  destination: Endpoint;
  initialPoints: LocationPoint[];
  canManage: boolean;
}) {
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const pointMarkers = useRef<Map<string, Marker>>(new Map());
  const routeEditingRef = useRef(false);
  const activeRoutePointRef = useRef<"origin" | "destination">("origin");
  const draftOriginRef = useRef<ResolvedEndpoint | null>(null);
  const draftDestinationRef = useRef<ResolvedEndpoint | null>(null);
  const [annotationOverrides, setAnnotationOverrides] = useState<Record<string, { eventType: EventType; note: string | null }>>({});
  const [mapError, setMapError] = useState("");
  const [routeEditing, setRouteEditing] = useState(false);
  const [activeRoutePoint, setActiveRoutePoint] = useState<"origin" | "destination">("origin");
  const [draftReady, setDraftReady] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [routeEditorMessage, setRouteEditorMessage] = useState("");
  const [mapRevision, setMapRevision] = useState(0);
  const points = useMemo(() => initialPoints.map((point) => ({ ...point, ...annotationOverrides[point.id] })), [annotationOverrides, initialPoints]);
  const numberedPoints = useMemo(() => points.map((point, index) => ({ ...point, number: points.length - index })), [points]);
  const { latitude: originLatitude, longitude: originLongitude, label: originLabel, city: originCity } = origin;
  const { latitude: destinationLatitude, longitude: destinationLongitude, label: destinationLabel, city: destinationCity } = destination;
  const plannedDistanceKm = routeRecord.distanceKm;

  useEffect(() => {
    let cancelled = false;
    let mountedMap: LeafletMap | null = null;
    let originMarker: CircleMarker | null = null;
    let destinationMarker: CircleMarker | null = null;
    let routeLayer: Polyline | null = null;
    let historyLayer: Polyline | null = null;
    const controller = new AbortController();
    const mountedPointMarkers = pointMarkers.current;

    void import("leaflet").then(async (leaflet) => {
      if (cancelled || !mapContainer.current) return;
      setMapError("");
      mountedMap = leaflet.map(mapContainer.current, { zoomControl: true, attributionControl: true }).setView([48.1, 67.1], 4);
      map.current = mountedMap;
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mountedMap);

      let resolvedOrigin: ResolvedEndpoint | null = originLatitude !== null && originLongitude !== null
        ? { latitude: originLatitude, longitude: originLongitude }
        : null;
      let resolvedDestination: ResolvedEndpoint | null = destinationLatitude !== null && destinationLongitude !== null
        ? { latitude: destinationLatitude, longitude: destinationLongitude }
        : null;
      try {
        [resolvedOrigin, resolvedDestination] = await Promise.all([
          resolveEndpoint({ latitude: originLatitude, longitude: originLongitude, label: originLabel, city: originCity }, controller.signal),
          resolveEndpoint({ latitude: destinationLatitude, longitude: destinationLongitude, label: destinationLabel, city: destinationCity }, controller.signal),
        ]);
      } catch (caught) {
        if (!controller.signal.aborted) setMapError(caught instanceof Error ? caught.message : "Не удалось определить точки маршрута.");
      }
      if (cancelled || !mountedMap) return;
      draftOriginRef.current = resolvedOrigin;
      draftDestinationRef.current = resolvedDestination;
      setDraftReady(Boolean(resolvedOrigin && resolvedDestination));

      mountedMap.on("click", (event) => {
        if (!routeEditingRef.current || !mountedMap) return;
        const point = { latitude: Number(event.latlng.lat.toFixed(6)), longitude: Number(event.latlng.lng.toFixed(6)) };
        routeLayer?.remove();
        routeLayer = null;
        if (activeRoutePointRef.current === "origin") {
          draftOriginRef.current = point;
          originMarker?.remove();
          originMarker = leaflet.circleMarker([point.latitude, point.longitude], {
            radius: 8, weight: 3, color: "#166b4f", fillColor: "#ffffff", fillOpacity: 1,
          }).addTo(mountedMap).bindTooltip("Новая точка погрузки", { permanent: true, direction: "top" });
          activeRoutePointRef.current = "destination";
          setActiveRoutePoint("destination");
        } else {
          draftDestinationRef.current = point;
          destinationMarker?.remove();
          destinationMarker = leaflet.circleMarker([point.latitude, point.longitude], {
            radius: 8, weight: 3, color: "#de7b32", fillColor: "#ffffff", fillOpacity: 1,
          }).addTo(mountedMap).bindTooltip("Новая точка выгрузки", { permanent: true, direction: "top" });
        }
        setDraftReady(Boolean(draftOriginRef.current && draftDestinationRef.current));
        setRouteEditorMessage("Точка установлена. После сохранения маршрут перестроится.");
      });

      const bounds: Array<[number, number]> = [];
      if (resolvedOrigin) {
        bounds.push([resolvedOrigin.latitude, resolvedOrigin.longitude]);
        const originTooltip = document.createElement("span");
        originTooltip.textContent = `Погрузка: ${originLabel}`;
        originMarker = leaflet.circleMarker([resolvedOrigin.latitude, resolvedOrigin.longitude], {
          radius: 8, weight: 3, color: "#166b4f", fillColor: "#ffffff", fillOpacity: 1,
        }).addTo(mountedMap).bindTooltip(originTooltip, { direction: "top" });
      }
      if (resolvedDestination) {
        bounds.push([resolvedDestination.latitude, resolvedDestination.longitude]);
        const destinationTooltip = document.createElement("span");
        destinationTooltip.textContent = `Выгрузка: ${destinationLabel}`;
        destinationMarker = leaflet.circleMarker([resolvedDestination.latitude, resolvedDestination.longitude], {
          radius: 8, weight: 3, color: "#de7b32", fillColor: "#ffffff", fillOpacity: 1,
        }).addTo(mountedMap).bindTooltip(destinationTooltip, { direction: "top" });
      }

      const chronological = [...numberedPoints].reverse();
      for (const point of numberedPoints) {
        bounds.push([point.latitude, point.longitude]);
        const marker = leaflet.marker([point.latitude, point.longitude], {
          icon: leaflet.divIcon({
            className: "tracking-marker-shell",
            html: `<span class="tracking-marker${point.number === points.length ? " latest" : ""}"><i>${point.number}</i></span>`,
            iconSize: [34, 40],
            iconAnchor: [17, 36],
          }),
          title: `Точка ${point.number}: ${eventLabels[point.eventType]}`,
        }).addTo(mountedMap);
        const popup = document.createElement("span");
        const popupTitle = document.createElement("b");
        popupTitle.textContent = `Точка ${point.number}`;
        popup.append(popupTitle, document.createElement("br"), eventLabels[point.eventType], document.createElement("br"), dateTimeLabel(point.recordedAt));
        marker.bindPopup(popup);
        mountedPointMarkers.set(point.id, marker);
      }
      if (chronological.length > 1) {
        historyLayer = leaflet.polyline(chronological.map((point) => [point.latitude, point.longitude]), {
          color: "#de7b32", weight: 3, opacity: .75, dashArray: "7 7",
        }).addTo(mountedMap);
      }

      if (bounds.length) mountedMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      window.setTimeout(() => mountedMap?.invalidateSize(), 0);

      if (resolvedOrigin && resolvedDestination) {
        const query = new URLSearchParams({
          origin: `${resolvedOrigin.latitude},${resolvedOrigin.longitude}`,
          destination: `${resolvedDestination.latitude},${resolvedDestination.longitude}`,
        });
        try {
          const response = await fetch(`/api/routing?${query}`, { signal: controller.signal });
          const payload = await response.json() as { routes?: RoutingAlternative[]; error?: string };
          if (!response.ok) throw new Error(payload.error ?? "Маршрут временно недоступен.");
          const selectedRoute = closestRouteToPlannedDistance(payload.routes ?? [], plannedDistanceKm);
          if (!selectedRoute || cancelled || !mountedMap) return;
          routeLayer = leaflet.polyline(selectedRoute.coordinates.map(([longitude, latitude]) => [latitude, longitude]), {
            color: "#166b4f", weight: 5, opacity: .82,
          }).addTo(mountedMap);
          routeLayer.bringToBack();
          mountedMap.fitBounds(routeLayer.getBounds(), { padding: [30, 30], maxZoom: 14 });
        } catch (caught) {
          if (!controller.signal.aborted) setMapError(caught instanceof Error ? caught.message : "Маршрут временно недоступен.");
        }
      } else if (!controller.signal.aborted) {
        setMapError("Не удалось определить погрузку или выгрузку по сохранённому адресу. Уточните адреса рейса.");
      }
    }).catch(() => setMapError("Не удалось открыть карту внутри кабинета."));

    return () => {
      cancelled = true;
      controller.abort();
      originMarker?.remove();
      destinationMarker?.remove();
      routeLayer?.remove();
      historyLayer?.remove();
      mountedMap?.remove();
      map.current = null;
      mountedPointMarkers.clear();
    };
  }, [destinationCity, destinationLabel, destinationLatitude, destinationLongitude, mapRevision, numberedPoints, originCity, originLabel, originLatitude, originLongitude, plannedDistanceKm, points.length]);

  function chooseRoutePoint(point: "origin" | "destination") {
    activeRoutePointRef.current = point;
    setActiveRoutePoint(point);
    setRouteEditorMessage(point === "origin" ? "Нажмите точку погрузки на карте." : "Нажмите точку выгрузки на карте.");
  }

  function beginRouteEditing() {
    routeEditingRef.current = true;
    setRouteEditing(true);
    chooseRoutePoint("origin");
  }

  function cancelRouteEditing() {
    routeEditingRef.current = false;
    setRouteEditing(false);
    setRouteEditorMessage("");
    setMapRevision((value) => value + 1);
  }

  async function saveRoutePoints() {
    const draftOrigin = draftOriginRef.current;
    const draftDestination = draftDestinationRef.current;
    if (!draftOrigin || !draftDestination) {
      setRouteEditorMessage("Укажите обе точки маршрута.");
      return;
    }
    setSavingRoute(true);
    setRouteEditorMessage("");
    try {
      const routeQuery = new URLSearchParams({
        origin: `${draftOrigin.latitude},${draftOrigin.longitude}`,
        destination: `${draftDestination.latitude},${draftDestination.longitude}`,
      });
      const routeResponse = await fetch(`/api/routing?${routeQuery}`);
      const routePayload = await routeResponse.json() as { routes?: RoutingAlternative[]; error?: string };
      const selectedRoute = closestRouteToPlannedDistance(routePayload.routes ?? [], plannedDistanceKm);
      if (!routeResponse.ok || !selectedRoute) throw new Error(routePayload.error ?? "Не удалось построить маршрут по выбранным точкам.");

      const response = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          vehicleId: routeRecord.vehicleId,
          driverId: routeRecord.driverId,
          title: routeRecord.title,
          originCity: routeRecord.originCity,
          destinationCity: routeRecord.destinationCity,
          originAddress: routeRecord.originAddress,
          destinationAddress: routeRecord.destinationAddress,
          originLatitude: draftOrigin.latitude,
          originLongitude: draftOrigin.longitude,
          destinationLatitude: draftDestination.latitude,
          destinationLongitude: draftDestination.longitude,
          distanceKm: selectedRoute.distanceKm,
          loadState: routeRecord.loadState,
          startedAt: routeRecord.startedAt?.slice(0, 10),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось сохранить маршрут.");
      routeEditingRef.current = false;
      setRouteEditing(false);
      setRouteEditorMessage("Точки и километраж сохранены.");
      router.refresh();
      setMapRevision((value) => value + 1);
    } catch (caught) {
      setRouteEditorMessage(caught instanceof Error ? caught.message : "Не удалось сохранить маршрут.");
    } finally {
      setSavingRoute(false);
    }
  }

  function focusPoint(point: LocationPoint) {
    const marker = pointMarkers.current.get(point.id);
    map.current?.setView([point.latitude, point.longitude], 14);
    marker?.openPopup();
    mapContainer.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function updateAnnotation(id: string, eventType: EventType, note: string | null) {
    setAnnotationOverrides((current) => ({ ...current, [id]: { eventType, note } }));
    router.refresh();
  }

  const latest = numberedPoints[0] ?? null;
  return <section className="trip-tracking" aria-label="Маршрут и история геопозиций">
    <div className="tracking-heading">
      <span><b>Маршрут и геопозиции водителя</b><small>{latest ? `Последняя точка: ${dateTimeLabel(latest.recordedAt)}` : "Водитель ещё не отправлял геопозицию"}</small></span>
      <div><span className="tracking-legend route" />Маршрут <span className="tracking-legend history" />Фактические точки</div>
    </div>
    <div ref={mapContainer} className="tracking-map" role="application" aria-label="Карта рейса и геопозиций водителя" />
    {mapError ? <p className="tracking-map-error" role="status">{mapError}</p> : null}
    {canManage ? <div className="route-correction">
      {!routeEditing ? <button type="button" className="tiny-button" onClick={beginRouteEditing}>Исправить точки маршрута</button> : <>
        <span><b>Уточнение маршрута</b><small>Выберите тип точки, затем нажмите нужное место на карте.</small></span>
        <div className="route-correction-points">
          <button type="button" className={`tiny-button${activeRoutePoint === "origin" ? " active" : ""}`} onClick={() => chooseRoutePoint("origin")}>1. Погрузка</button>
          <button type="button" className={`tiny-button${activeRoutePoint === "destination" ? " active" : ""}`} onClick={() => chooseRoutePoint("destination")}>2. Выгрузка</button>
        </div>
        <div className="route-correction-actions">
          <button type="button" className="tiny-button" disabled={!draftReady || savingRoute} onClick={() => void saveRoutePoints()}>{savingRoute ? "Сохраняю…" : "Сохранить маршрут"}</button>
          <button type="button" className="tiny-button" disabled={savingRoute} onClick={cancelRouteEditing}>Отмена</button>
        </div>
      </>}
      {routeEditorMessage ? <small className={routeEditorMessage.includes("сохранены") ? "tracking-saved" : ""}>{routeEditorMessage}</small> : null}
    </div> : null}
    <div className="tracking-points-heading"><b>История отметок</b><span>{pointCountLabel(numberedPoints.length)} · сохраняются в рейсе</span></div>
    {numberedPoints.length ? <ol className="tracking-points">
      {numberedPoints.map((point) => <li key={point.id}>
        <button type="button" className={`tracking-point-number${point.number === points.length ? " latest" : ""}`} onClick={() => focusPoint(point)} aria-label={`Показать точку ${point.number} на карте`}>{point.number}</button>
        <div className="tracking-point-copy">
          <span><b>{eventLabels[point.eventType]}</b>{point.number === points.length ? <em>Текущая</em> : null}</span>
          <small>{dateTimeLabel(point.recordedAt)} · {point.horizontalAccuracyM === null ? "точность не указана" : `точность около ${Math.round(point.horizontalAccuracyM)} м`}</small>
          {point.note ? <p>{point.note}</p> : null}
          {canManage ? <AnnotationForm organizationId={organizationId} tripId={tripId} point={point} onSaved={(eventType, note) => updateAnnotation(point.id, eventType, note)} /> : null}
        </div>
      </li>)}
    </ol> : <p className="empty-state">После отправки геопозиции водителем здесь появятся пронумерованные метки и журнал перемещений.</p>}
  </section>;
}
