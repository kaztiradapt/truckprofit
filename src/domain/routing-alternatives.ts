export type RoutePoint = { latitude: number; longitude: number };

export type RoutingAlternative = {
  id: string;
  distanceKm: number;
  durationMinutes: number;
  coordinates: Array<[number, number]>;
};

const EARTH_RADIUS_KM = 6_371;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function toRadians(value: number): number {
  return value * Math.PI / 180;
}

function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const chord = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(chord)));
}

export function automaticCorridorWaypoints(origin: RoutePoint, destination: RoutePoint): RoutePoint[] {
  const midpointLatitude = (origin.latitude + destination.latitude) / 2;
  const midpointLongitude = (origin.longitude + destination.longitude) / 2;
  const longitudeScale = Math.max(.15, Math.cos(toRadians(midpointLatitude)));
  const eastKm = (destination.longitude - origin.longitude) * 111.32 * longitudeScale;
  const northKm = (destination.latitude - origin.latitude) * 110.57;
  const directDistanceKm = Math.hypot(eastKm, northKm);
  if (directDistanceKm < 100) return [];

  const perpendicularEast = -northKm / directDistanceKm;
  const perpendicularNorth = eastKm / directDistanceKm;
  const offsets = [0.17, -0.17, 0.31, -0.31, 0.43, -0.43]
    .map((ratio) => Math.sign(ratio) * clamp(Math.abs(ratio) * directDistanceKm, 55, 320));

  return offsets.flatMap((offsetKm) => {
    const point = {
      latitude: midpointLatitude + perpendicularNorth * offsetKm / 110.57,
      longitude: midpointLongitude + perpendicularEast * offsetKm / (111.32 * longitudeScale),
    };
    return point.latitude > -85 && point.latitude < 85 && point.longitude > -180 && point.longitude < 180
      ? [point]
      : [];
  });
}

function routePointAt(route: RoutingAlternative, fraction: number): RoutePoint {
  const points = route.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
  const segmentLengths = points.slice(1).map((point, index) => haversineKm(points[index], point));
  const totalLength = segmentLengths.reduce((sum, value) => sum + value, 0);
  const targetLength = totalLength * fraction;
  let traversed = 0;
  for (const [index, segmentLength] of segmentLengths.entries()) {
    if (traversed + segmentLength < targetLength) {
      traversed += segmentLength;
      continue;
    }
    const segmentFraction = segmentLength > 0 ? (targetLength - traversed) / segmentLength : 0;
    return {
      latitude: points[index].latitude + (points[index + 1].latitude - points[index].latitude) * segmentFraction,
      longitude: points[index].longitude + (points[index + 1].longitude - points[index].longitude) * segmentFraction,
    };
  }
  return points.at(-1) ?? { latitude: 0, longitude: 0 };
}

function routesAreMeaningfullyDifferent(a: RoutingAlternative, b: RoutingAlternative): boolean {
  const separations = [.2, .35, .5, .65, .8].map((fraction) => haversineKm(routePointAt(a, fraction), routePointAt(b, fraction)));
  const averageSeparation = separations.reduce((sum, value) => sum + value, 0) / separations.length;
  const maximumSeparation = Math.max(...separations);
  const distanceDifference = Math.abs(a.distanceKm - b.distanceKm) / Math.max(1, Math.min(a.distanceKm, b.distanceKm));
  return maximumSeparation >= 55 || (averageSeparation >= 16 && maximumSeparation >= 28)
    || (distanceDifference >= .12 && averageSeparation >= 8);
}

export function chooseDistinctRoutes(routes: RoutingAlternative[], limit = 3): RoutingAlternative[] {
  const primary = routes[0];
  if (!primary) return [];
  const candidates = routes.slice(1).sort((a, b) => a.durationMinutes - b.durationMinutes || a.distanceKm - b.distanceKm);
  const selected = [primary];
  for (const candidate of candidates) {
    if (candidate.distanceKm > primary.distanceKm * 1.85 || candidate.durationMinutes > primary.durationMinutes * 2.2) continue;
    if (!selected.every((route) => routesAreMeaningfullyDifferent(route, candidate))) continue;
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}
