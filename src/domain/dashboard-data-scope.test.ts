import { describe, expect, it } from "vitest";

import { dashboardDataNeeds } from "./dashboard-data-scope";

describe("dashboardDataNeeds", () => {
  it("loads the complete operational picture only where it is displayed", () => {
    expect(dashboardDataNeeds("trips")).toMatchObject({
      trips: true,
      expenses: true,
      incomes: true,
      pnl: true,
      locations: true,
      vehicleStatuses: true,
    });
    expect(dashboardDataNeeds("reports")).toMatchObject({
      trips: true,
      expenses: true,
      incomes: true,
      pnl: true,
      locations: false,
      vehicleStatuses: false,
    });
  });

  it("does not fetch operational history for static help", () => {
    expect(dashboardDataNeeds("help")).toEqual({
      trips: false,
      summaries: false,
      expenses: false,
      incomes: false,
      pnl: false,
      driverInvites: false,
      team: false,
      locations: false,
      vehicleStatuses: false,
      supportTickets: false,
    });
  });

  it("loads page-specific records for drivers, team, and support", () => {
    expect(dashboardDataNeeds("drivers").driverInvites).toBe(true);
    expect(dashboardDataNeeds("team").team).toBe(true);
    expect(dashboardDataNeeds("support").supportTickets).toBe(true);
  });
});
