import { describe, expect, it } from "vitest";

import { routeGeocodingQueries } from "./route-endpoint";

describe("routeGeocodingQueries", () => {
  it("anchors a street address to its city before using the city fallback", () => {
    expect(routeGeocodingQueries("Пичугина 4/3а", "Караганда")).toEqual([
      "Пичугина 4/3а, Караганда",
      "Караганда",
    ]);
  });

  it("ignores generic location text", () => {
    expect(routeGeocodingQueries("Геолокация", "Ушарал")).toEqual(["Ушарал"]);
  });

  it("removes distance directions from a city fallback", () => {
    expect(routeGeocodingQueries("Геолокация", "Ушарал 114 км к Достыку")).toEqual(["Ушарал"]);
  });
});
