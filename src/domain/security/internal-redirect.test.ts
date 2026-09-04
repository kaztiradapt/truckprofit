import { describe, expect, it } from "vitest";

import { safeInternalRedirectPath } from "./internal-redirect";

describe("safeInternalRedirectPath", () => {
  it.each(["/dashboard", "/update-password", "/dashboard/reports?period=month"])("accepts %s", (path) => {
    expect(safeInternalRedirectPath(path)).toBe(path);
  });

  it.each([
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "\\example.com",
    "/dashboard\nSet-Cookie:test",
    "dashboard",
    "",
  ])("rejects %s", (path) => {
    expect(safeInternalRedirectPath(path)).toBeNull();
  });
});
