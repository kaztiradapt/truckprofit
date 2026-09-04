export const dashboardDataScopes = ["overview", "trips", "vehicles", "drivers", "reports", "expenses", "team", "operations", "help", "support"] as const;
export type DashboardDataScope = (typeof dashboardDataScopes)[number];

export type DashboardDataNeeds = {
  trips: boolean;
  summaries: boolean;
  expenses: boolean;
  incomes: boolean;
  pnl: boolean;
  driverInvites: boolean;
  team: boolean;
  locations: boolean;
  vehicleStatuses: boolean;
  supportTickets: boolean;
};

export function dashboardDataNeeds(scope: DashboardDataScope): DashboardDataNeeds {
  const hasTrips = ["overview", "trips", "reports", "operations"].includes(scope);
  const tracksTrips = scope === "overview" || scope === "trips";
  return {
    trips: hasTrips,
    summaries: scope === "overview",
    expenses: ["trips", "reports", "expenses"].includes(scope),
    incomes: scope === "trips" || scope === "reports",
    pnl: ["overview", "trips", "reports"].includes(scope),
    driverInvites: scope === "drivers",
    team: scope === "team",
    locations: tracksTrips,
    vehicleStatuses: tracksTrips,
    supportTickets: scope === "support",
  };
}
