import { describe, expect, it } from "vitest";

import { closestRouteToPlannedDistance } from "./route-alternative";

describe("closestRouteToPlannedDistance", () => {
  const routes = [
    { id: "short", distanceKm: 954 },
    { id: "long", distanceKm: 1317 },
  ];

  it("keeps the longer route selected during trip creation", () => {
    expect(closestRouteToPlannedDistance(routes, 1300)?.id).toBe("long");
  });

  it("uses the primary route when no planned distance is available", () => {
    expect(closestRouteToPlannedDistance(routes, null)?.id).toBe("short");
  });
});
