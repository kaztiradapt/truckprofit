import { aggregateManagementReport } from "@/domain/reports/management-report";
import type { ManagementReportExportInput } from "@/domain/reports/report-export";

export function reportTestFixture(count = 2): ManagementReportExportInput {
  const trips = Array.from({ length: count }, (_, i) => ({
    title: i === 1 ? "Очень длинное название рейса Караганда - Ушарал через Семей с промежуточной остановкой" : `Караганда - Ушарал ${i + 1}`,
    driverName: "Тестовый водитель", vehicleName: "Volvo FH · TEST-01", status: "ACTIVE", startedAt: "2026-09-07T00:00:00Z",
    totalKm: 1317, loadedKm: 1317, emptyKm: 0, revenueMinor: 25000000, directExpensesMinor: 8500000, driverCompensationMinor: 1500000, profitMinor: 15000000,
  }));
  return {
    organizationName: "Тестовая компания TruckProfit", currency: "RUB", generatedAt: "07.09.2026, 12:30",
    filters: { period: "01.09.2026 - 07.09.2026", driver: "Все водители", vehicle: "Все автомобили", tripStatus: "Все статусы" },
    totals: aggregateManagementReport(trips.map((trip, i) => ({...trip,id:String(i)})), trips.map((_,i) => ({tripId:String(i), reportingAmountMinor:8500000, quantity:450,unit:"L",economicGroup:"FUEL",costBehavior:"VARIABLE",includeInNormalizedCost:true}))),
    trips, drivers: [{ displayName:"Тестовый водитель",assignedVehicleName:"Volvo FH",totalTrips:count,activeTrips:count,completedTrips:0,totalKm:1317*count,loadedKm:1317*count,emptyKm:0,revenueMinor:25000000*count,actualExpensesMinor:10000000*count,actualProfitMinor:15000000*count,normalizedProfitMinor:15000000*count }],
    vehicles: [{name:"Volvo FH · TEST-01",trips:count,activeTrips:count,totalKm:1317*count,revenueMinor:25000000*count,actualExpensesMinor:10000000*count,profitMinor:15000000*count}],
    includeFinance: true,
  };
}
