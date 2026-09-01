import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RoutePoint = { latitude: number; longitude: number };
type OsrmRoute = {
  distance?: number;
  duration?: number;
  geometry?: { type?: string; coordinates?: unknown };
};
type OsrmResponse = { code?: string; routes?: OsrmRoute[] };

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

  const baseUrl = process.env.ROUTING_BASE_URL?.trim() || "https://router.project-osrm.org";
  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = new URL(`route/v1/driving/${coordinates}`, `${baseUrl.replace(/\/+$/, "")}/`);
  url.searchParams.set("alternatives", "2");
  url.searchParams.set("steps", "false");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "simplified");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Referer: "https://fleet-economics.vercel.app/",
        "User-Agent": process.env.ROUTING_USER_AGENT?.trim() || "TruckProfit/0.1 (https://fleet-economics.vercel.app)",
      },
      next: { revalidate: 3_600 },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return Response.json({ error: "Сервис маршрутов временно недоступен." }, { status: 503 });

    const payload = await response.json() as OsrmResponse;
    if (payload.code !== "Ok") {
      const message = payload.code === "NoRoute" ? "Между выбранными точками автомобильный маршрут не найден." : "Не удалось построить маршрут.";
      return Response.json({ error: message }, { status: 422 });
    }

    const routes = (payload.routes ?? []).flatMap((route, index) => {
      const coordinates = geometryCoordinates(route.geometry?.coordinates);
      const distance = Number(route.distance);
      const duration = Number(route.duration);
      if (!coordinates || !Number.isFinite(distance) || distance <= 0 || !Number.isFinite(duration) || duration <= 0) return [];
      return [{
        id: `route-${index + 1}`,
        distanceKm: Math.round(distance / 100) / 10,
        durationMinutes: Math.round(duration / 60),
        coordinates,
      }];
    }).slice(0, 3);
    if (!routes.length) return Response.json({ error: "Автомобильный маршрут не найден." }, { status: 422 });

    return Response.json({ routes }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    return Response.json({ error: "Не удалось загрузить варианты маршрута." }, { status: 503 });
  }
}
