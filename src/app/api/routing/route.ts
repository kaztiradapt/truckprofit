import { createClient } from "@/lib/supabase/server";
import { decodeGooglePolyline } from "@/domain/google-polyline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RoutePoint = { latitude: number; longitude: number };
type OsrmRoute = {
  distance?: number;
  duration?: number;
  geometry?: { type?: string; coordinates?: unknown };
};
type OsrmResponse = { code?: string; routes?: OsrmRoute[] };
type RoutingAlternative = {
  id: string;
  distanceKm: number;
  durationMinutes: number;
  coordinates: Array<[number, number]>;
};
type GoogleRoute = {
  distanceMeters?: number;
  duration?: string;
  polyline?: { encodedPolyline?: string };
};
type GoogleRoutesResponse = { routes?: GoogleRoute[] };

function parsePoint(value: string | null): RoutePoint | null {
  if (!value) return null;
  const [latitudeText, longitudeText, ...rest] = value.split(",");
  if (rest.length) return null;
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

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

function durationSeconds(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?s$/.test(value)) return null;
  const seconds = Number(value.slice(0, -1));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

async function googleRoutes(origin: RoutePoint, destination: RoutePoint, apiKey: string): Promise<RoutingAlternative[] | null> {
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: { location: { latLng: origin } },
      destination: { location: { latLng: destination } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      computeAlternativeRoutes: true,
      languageCode: "ru",
      units: "METRIC",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  const payload = await response.json() as GoogleRoutesResponse;
  const routes = (payload.routes ?? []).flatMap((route, index) => {
    const coordinates = decodeGooglePolyline(route.polyline?.encodedPolyline);
    const distance = Number(route.distanceMeters);
    const duration = durationSeconds(route.duration);
    if (!coordinates || !Number.isFinite(distance) || distance <= 0 || duration === null) return [];
    return [{
      id: `google-${index + 1}`,
      distanceKm: Math.round(distance / 100) / 10,
      durationMinutes: Math.round(duration / 60),
      coordinates,
    }];
  });
  return routes.length ? routes.slice(0, 3) : null;
}

async function osrmRoutes(origin: RoutePoint, destination: RoutePoint): Promise<RoutingAlternative[] | null> {
  const baseUrl = process.env.ROUTING_BASE_URL?.trim() || "https://router.project-osrm.org";
  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = new URL(`route/v1/driving/${coordinates}`, `${baseUrl.replace(/\/+$/, "")}/`);
  url.searchParams.set("alternatives", "3");
  url.searchParams.set("steps", "false");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "simplified");

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
    const coordinates = geometryCoordinates(route.geometry?.coordinates);
    const distance = Number(route.distance);
    const duration = Number(route.duration);
    if (!coordinates || !Number.isFinite(distance) || distance <= 0 || !Number.isFinite(duration) || duration <= 0) return [];
    return [{
      id: `osrm-${index + 1}`,
      distanceKm: Math.round(distance / 100) / 10,
      durationMinutes: Math.round(duration / 60),
      coordinates,
    }];
  });
  return routes.length ? routes.slice(0, 3) : null;
}

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return Response.json({ error: "Требуется вход." }, { status: 401 });

  const search = new URL(request.url).searchParams;
  const origin = parsePoint(search.get("origin"));
  const destination = parsePoint(search.get("destination"));
  if (!origin || !destination) return Response.json({ error: "Проверьте точки маршрута." }, { status: 400 });
  if (origin.latitude === destination.latitude && origin.longitude === destination.longitude) {
    return Response.json({ error: "Погрузка и выгрузка должны быть в разных точках." }, { status: 400 });
  }

  try {
    const googleApiKey = process.env.GOOGLE_ROUTES_API_KEY?.trim();
    const google = googleApiKey ? await googleRoutes(origin, destination, googleApiKey).catch(() => null) : null;
    if (google) return Response.json({ routes: google, provider: "google" }, { headers: { "Cache-Control": "private, max-age=300" } });

    const osrm = await osrmRoutes(origin, destination);
    if (!osrm) return Response.json({ error: "Между выбранными точками автомобильный маршрут не найден." }, { status: 422 });
    return Response.json({ routes: osrm, provider: "osrm" }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    return Response.json({ error: "Не удалось загрузить варианты маршрута." }, { status: 503 });
  }
}
