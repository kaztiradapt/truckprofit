import { describe, expect, it } from "vitest";

import { formatDeviceDateTime } from "./device-date-time";

describe("formatDeviceDateTime", () => {
  it("formats an instant in the device time zone", () => {
    expect(formatDeviceDateTime("2026-09-02T07:30:00Z", "date-time", "UTC")).toContain("07:30");
    expect(formatDeviceDateTime("2026-09-02T07:30:00Z", "date-time", "Asia/Qostanay")).toContain("12:30");
  });

  it("keeps calendar-only dates on the selected day", () => {
    expect(formatDeviceDateTime("2026-09-10", "date", "America/Los_Angeles")).toContain("10");
  });
});
