export type DistanceRoute = { distanceKm: number };

export function closestRouteToPlannedDistance<T extends DistanceRoute>(routes: T[], plannedDistanceKm: number | null): T | null {
  if (!routes.length) return null;
  if (plannedDistanceKm === null || !Number.isFinite(plannedDistanceKm) || plannedDistanceKm <= 0) return routes[0];
  return routes.reduce((closest, route) => (
    Math.abs(route.distanceKm - plannedDistanceKm) < Math.abs(closest.distanceKm - plannedDistanceKm) ? route : closest
  ));
}
