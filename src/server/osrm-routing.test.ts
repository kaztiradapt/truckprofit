import { afterEach, describe, expect, it, vi } from "vitest";

import { osrmRoutes } from "./osrm-routing";

function osrmPayload(distanceKm: number, durationMinutes: number, middleLatitude: number, waypointCount: number) {
  return {
    code: "Ok",
    routes: [{
      distance: distanceKm * 1_000,
      duration: durationMinutes * 60,
      geometry: { type: "LineString", coordinates: [[73.1, 49.8], [77, middleLatitude], [80.95, 46.18]] },
    }],
    waypoints: Array.from({ length: waypointCount }, () => ({ distance: 100 })),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("OSRM routing", () => {
  it("automatically calculates distinct corridors when OSRM returns one route", async () => {
    const alternatives = [
      osrmPayload(942, 730, 47.8, 2),
      osrmPayload(1_025, 875, 49.1, 3),
      osrmPayload(1_900, 1_100, 44.2, 3),
      osrmPayload(1_310, 970, 50.2, 3),
      osrmPayload(1_030, 880, 49.11, 3),
      osrmPayload(1_880, 1_090, 44.3, 3),
      osrmPayload(1_315, 980, 50.21, 3),
    ];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      void input;
      return Response.json(alternatives.shift());
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await osrmRoutes(
      { latitude: 49.8161, longitude: 73.1027 },
      { latitude: 46.1761, longitude: 80.9526 },
    );

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(result?.automaticCorridors).toBe(true);
    expect(result?.routes.map((route) => route.distanceKm)).toEqual([942, 1_025, 1_310]);
  });

  it("keeps an explicit via point in every routing request", async () => {
    const alternatives = [
      osrmPayload(1_317, 895, 50.4, 3),
      ...Array.from({ length: 6 }, (_, index) => osrmPayload(1_330 + index * 20, 910 + index * 10, 50.6 + index * .2, 4)),
    ];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      void input;
      return Response.json(alternatives.shift());
    });
    vi.stubGlobal("fetch", fetchMock);

    const via = { latitude: 50.4111, longitude: 80.2275 };
    const result = await osrmRoutes(
      { latitude: 49.8161, longitude: 73.1027 },
      { latitude: 46.1761, longitude: 80.9526 },
      via,
    );

    expect(result?.routes[0]?.distanceKm).toBe(1_317);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    for (const [request] of fetchMock.mock.calls) {
      const url = String(request);
      expect(url).toContain(`${via.longitude},${via.latitude}`);
    }
  });
});
