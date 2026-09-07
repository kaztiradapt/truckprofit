import { automaticCorridorWaypoints, chooseDistinctRoutes, type RoutePoint, type RoutingAlternative } from "../domain/routing-alternatives";

type OsrmRoute = {
  distance?: number;
  duration?: number;
  geometry?: { type?: string; coordinates?: unknown };
};

type OsrmResponse = {
  code?: string;
  routes?: OsrmRoute[];
  waypoints?: Array<{ distance?: number }>;
};

function geometryCoordinates(value: unknown): Array<[number, number]> | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 25_000) return null;
  const coordinates: Array<[number, number]> = [];
  for (const coordinate of value) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    coordinates.push([longitude, latitude]);
  }
  return coordinates;
}

async function requestOsrmRoutes(
  points: RoutePoint[],
  idPrefix: string,
  alternatives: number | false,
): Promise<{ routes: RoutingAlternative[]; waypointDistances: number[] } | null> {
  const baseUrl = process.env.ROUTING_BASE_URL?.trim() || "https://router.project-osrm.org";
  const coordinates = points.map((point) => `${point.longitude},${point.latitude}`).join(";");
  const url = new URL(`route/v1/driving/${coordinates}`, `${baseUrl.replace(/\/+$/, "")}/`);
  url.searchParams.set("alternatives", alternatives === false ? "false" : String(alternatives));
  url.searchParams.set("steps", "false");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "simplified");
  if (points.length > 2) url.searchParams.set("continue_straight", "true");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Referer: "https://fleet-economics.vercel.app/",
      "User-Agent": process.env.ROUTING_USER_AGENT?.trim() || "TruckProfit/0.1 (https://fleet-economics.vercel.app)",
    },
    next: { revalidate: 3_600 },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  const payload = await response.json() as OsrmResponse;
  if (payload.code !== "Ok") return null;

  const routes = (payload.routes ?? []).flatMap((route, index) => {
    const routeCoordinates = geometryCoordinates(route.geometry?.coordinates);
    const distance = Number(route.distance);
    const duration = Number(route.duration);
    if (!routeCoordinates || !Number.isFinite(distance) || distance <= 0 || !Number.isFinite(duration) || duration <= 0) return [];
    return [{
      id: `${idPrefix}-${index + 1}`,
      distanceKm: Math.round(distance / 100) / 10,
      durationMinutes: Math.round(duration / 60),
      coordinates: routeCoordinates,
    }];
  });
  return routes.length ? {
    routes,
    waypointDistances: (payload.waypoints ?? []).map((waypoint) => Number(waypoint.distance ?? 0)),
  } : null;
}

export async function osrmRoutes(origin: RoutePoint, destination: RoutePoint, via?: RoutePoint): Promise<{ routes: RoutingAlternative[]; automaticCorridors: boolean } | null> {
  const requiredPoints = via ? [origin, via, destination] : [origin, destination];
  const native = await requestOsrmRoutes(requiredPoints, via ? "osrm-via" : "osrm", 3);
  if (!native?.routes.length) return null;
  const nativeDistinct = chooseDistinctRoutes(native.routes);
  if (nativeDistinct.length >= 3) return { routes: nativeDistinct, automaticCorridors: false };

  const corridorPointSets = via
    ? [
      ...automaticCorridorWaypoints(origin, via).slice(0, 3).map((waypoint) => [origin, waypoint, via, destination]),
      ...automaticCorridorWaypoints(via, destination).slice(0, 3).map((waypoint) => [origin, via, waypoint, destination]),
    ]
    : automaticCorridorWaypoints(origin, destination).map((waypoint) => [origin, waypoint, destination]);
  const corridorRequests = corridorPointSets.map(async (points, index) => {
    const result = await requestOsrmRoutes(points, `osrm-corridor-${index + 1}`, false);
    const intermediatesAreOnRoad = result?.waypointDistances
      .slice(1, -1)
      .every((distance) => distance <= 60_000) ?? false;
    return intermediatesAreOnRoad ? result?.routes[0] ?? null : null;
  });
  const settled = await Promise.allSettled(corridorRequests);
  const corridorRoutes = settled.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  const routeCandidates = [...nativeDistinct, ...corridorRoutes];
  if (via) routeCandidates.sort((a, b) => a.durationMinutes - b.durationMinutes || a.distanceKm - b.distanceKm);
  const routes = chooseDistinctRoutes(routeCandidates);
  return { routes, automaticCorridors: routes.length > nativeDistinct.length };
}
