import { describe, expect, it } from "vitest";

import { normalizeRouteGeometry, parseRouteGeometry } from "./route-geometry";

describe("route geometry", () => {
  it("accepts valid GeoJSON coordinate pairs", () => {
    expect(normalizeRouteGeometry([[72.9, 49.8], [80.9, 46.1]])).toEqual([[72.9, 49.8], [80.9, 46.1]]);
  });

  it("rejects invalid coordinates", () => {
    expect(normalizeRouteGeometry([[200, 49], [80, 46]])).toBeNull();
  });

  it("parses a hidden form value", () => {
    expect(parseRouteGeometry("[[72.9,49.8],[80.9,46.1]]")).toHaveLength(2);
  });
});
