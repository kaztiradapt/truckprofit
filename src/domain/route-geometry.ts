export type RouteCoordinate = [number, number];

export function normalizeRouteGeometry(value: unknown): RouteCoordinate[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 25_000) return null;
  const result: RouteCoordinate[] = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length < 2) return null;
    const longitude = Number(point[0]);
    const latitude = Number(point[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
      || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
    result.push([longitude, latitude]);
  }
  return result;
}

export function parseRouteGeometry(value: unknown): RouteCoordinate[] | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return normalizeRouteGeometry(JSON.parse(value));
  } catch {
    return null;
  }
}
