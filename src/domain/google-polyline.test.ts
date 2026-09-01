import { describe, expect, it } from "vitest";

import { decodeGooglePolyline } from "./google-polyline";

describe("decodeGooglePolyline", () => {
  it("decodes the documented polyline example into longitude/latitude pairs", () => {
    expect(decodeGooglePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"))?.toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it("rejects malformed or incomplete encoded data", () => {
    expect(decodeGooglePolyline("_")).toBeNull();
    expect(decodeGooglePolyline(42)).toBeNull();
  });
});
