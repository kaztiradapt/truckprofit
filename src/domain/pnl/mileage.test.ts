import { describe, expect, it } from "vitest";

import { calculateMileage } from "./mileage";

describe("calculateMileage", () => {
  it("aggregates completed loaded and empty legs", () => {
    const result = calculateMileage([
      { id: "loaded", startOdometerKm: 100, endOdometerKm: 250, loadState: "LOADED", completed: true },
      { id: "empty", startOdometerKm: 250, endOdometerKm: 300, loadState: "EMPTY", completed: true },
    ]);
    expect(result).toMatchObject({ totalKm: 200, loadedKm: 150, emptyKm: 50, emptyPercentage: 25, warnings: [] });
  });

  it("never treats unknown or invalid legs as empty", () => {
    const result = calculateMileage([
      { id: "unknown", startOdometerKm: 100, endOdometerKm: 200, loadState: "UNKNOWN", completed: true },
      { id: "negative", startOdometerKm: 300, endOdometerKm: 250, loadState: "EMPTY", completed: true },
      { id: "open", startOdometerKm: 300, endOdometerKm: null, loadState: "LOADED", completed: false },
    ]);
    expect(result.totalKm).toBe(0);
    expect(result.emptyPercentage).toBeNull();
    expect(result.warnings).toEqual(["UNKNOWN_LOAD_STATE:unknown", "NEGATIVE_MILEAGE:negative", "INCOMPLETE_LEG:open"]);
  });
});
