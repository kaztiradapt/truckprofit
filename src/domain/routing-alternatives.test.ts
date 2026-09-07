import { describe, expect, it } from "vitest";

import { automaticCorridorWaypoints, chooseDistinctRoutes, type RoutingAlternative } from "./routing-alternatives";

function route(id: string, distanceKm: number, durationMinutes: number, middleLatitude: number): RoutingAlternative {
  return {
    id,
    distanceKm,
    durationMinutes,
    coordinates: [[73.1, 49.8], [76, middleLatitude], [79, middleLatitude], [80.95, 46.18]],
  };
}

describe("routing alternatives", () => {
  it("creates automatic corridors on both sides of a long route", () => {
    const points = automaticCorridorWaypoints(
      { latitude: 49.8161, longitude: 73.1027 },
      { latitude: 46.1761, longitude: 80.9526 },
    );
    expect(points).toHaveLength(6);
    expect(points.some((point) => point.latitude > 49)).toBe(true);
    expect(points.some((point) => point.latitude < 47)).toBe(true);
  });

  it("keeps distinct practical routes and removes duplicates and extreme detours", () => {
    const selected = chooseDistinctRoutes([
      route("primary", 942, 730, 47.8),
      route("duplicate", 945, 735, 47.81),
      route("north", 1_025, 875, 49.1),
      route("far-north", 1_310, 970, 50.2),
      route("extreme", 1_900, 1_100, 44.2),
    ]);
    expect(selected.map((item) => item.id)).toEqual(["primary", "north", "far-north"]);
  });
});
