import { describe, expect, it } from "vitest";

import { buildManagementReportCsv, buildManagementReportHtml, reportExportFilename, rowsToCsv } from "./report-export";

describe("rowsToCsv", () => {
  it("creates an Excel-friendly UTF-8 CSV with escaped values", () => {
    expect(rowsToCsv([["Клиент", "ТОО \"Тест\"; Алматы"], ["Сумма", 1250.5]])).toBe(
      "\uFEFF\"Клиент\";\"ТОО \"\"Тест\"\"; Алматы\"\r\n\"Сумма\";1250,5\r\n",
    );
  });

  it("neutralizes spreadsheet formulas in user-controlled text", () => {
    expect(rowsToCsv([["=HYPERLINK(\"bad\")", "+SUM(1,2)", "-cmd", "@value", -125]])).toBe(
      "\uFEFF\"'=HYPERLINK(\"\"bad\"\")\";\"'+SUM(1,2)\";\"'-cmd\";\"'@value\";-125\r\n",
    );
  });
});

describe("buildManagementReportCsv", () => {
  it("exports the selected report with finance and detail sections", () => {
    const csv = buildManagementReportCsv({
      organizationName: "ТОО КАЗ-ТIR",
      currency: "KZT",
      generatedAt: "04.09.2026, 16:20",
      filters: { period: "01.09.2026 — 04.09.2026", driver: "Все водители", vehicle: "DAF 001", tripStatus: "В рейсе" },
      totals: {
        trips: 1,
        revenueMinor: 1_000_000,
        directExpensesMinor: 300_000,
        driverCompensationMinor: 100_000,
        actualExpensesMinor: 400_000,
        normalizedExpensesMinor: 350_000,
        excludedExpensesMinor: 50_000,
        actualProfitMinor: 600_000,
        normalizedProfitMinor: 650_000,
        totalKm: 100,
        loadedKm: 80,
        emptyKm: 20,
        fuelLiters: 30,
        expensesByGroupMinor: { FUEL: 300_000, TOLLS: 0, REPAIR: 0, MAINTENANCE: 0, OTHER: 0 },
        expensesByBehaviorMinor: { VARIABLE: 300_000, FIXED: 0, RESERVE: 0, ONE_OFF: 0, CAPITAL: 0 },
      },
      trips: [{
        title: "Алматы — Астана", driverName: "Максим", vehicleName: "DAF 001", status: "ACTIVE", startedAt: "2026-09-01T10:00:00Z",
        totalKm: 100, loadedKm: 80, emptyKm: 20, revenueMinor: 1_000_000, directExpensesMinor: 300_000, driverCompensationMinor: 100_000, profitMinor: 600_000,
      }],
      drivers: [{
        displayName: "Максим", assignedVehicleName: "DAF 001", totalTrips: 1, activeTrips: 1, completedTrips: 0, totalKm: 100, loadedKm: 80, emptyKm: 20,
        revenueMinor: 1_000_000, actualExpensesMinor: 400_000, actualProfitMinor: 600_000, normalizedProfitMinor: 650_000,
      }],
      vehicles: [{ name: "DAF 001", trips: 1, activeTrips: 1, totalKm: 100, revenueMinor: 1_000_000, actualExpensesMinor: 400_000, profitMinor: 600_000 }],
      includeFinance: true,
    });

    expect(csv).toContain("\"Фактический результат\";6000;\"KZT\"");
    expect(csv).toContain("\"Алматы — Астана\";\"Максим\";\"DAF 001\";\"В рейсе\"");
    expect(csv).toContain("\"Водители\"");
    expect(csv).toContain("\"Автомобили\"");
  });
});

describe("reportExportFilename", () => {
  it("creates a safe local-date filename", () => {
    expect(reportExportFilename("ТОО КАЗ/ТИР", new Date(2026, 8, 4))).toBe("TruckProfit-ТОО-КАЗ-ТИР-2026-09-04.csv");
  });
});

describe("buildManagementReportHtml", () => {
  it("creates a printable report and escapes user-controlled values", () => {
    const printable = buildManagementReportHtml({
      organizationName: "<script>alert(1)</script>",
      currency: "KZT",
      generatedAt: "07.09.2026, 12:00",
      filters: { period: "Всё время", driver: "Все водители", vehicle: "Все автомобили", tripStatus: "Все статусы" },
      totals: {
        trips: 0,
        revenueMinor: 0,
        directExpensesMinor: 0,
        driverCompensationMinor: 0,
        actualExpensesMinor: 0,
        normalizedExpensesMinor: 0,
        excludedExpensesMinor: 0,
        actualProfitMinor: 0,
        normalizedProfitMinor: 0,
        totalKm: 0,
        loadedKm: 0,
        emptyKm: 0,
        fuelLiters: 0,
        expensesByGroupMinor: { FUEL: 0, TOLLS: 0, REPAIR: 0, MAINTENANCE: 0, OTHER: 0 },
        expensesByBehaviorMinor: { VARIABLE: 0, FIXED: 0, RESERVE: 0, ONE_OFF: 0, CAPITAL: 0 },
      },
      trips: [],
      drivers: [],
      vehicles: [],
      includeFinance: true,
    });

    expect(printable).toContain("Печать / сохранить PDF");
    expect(printable).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(printable).not.toContain("<script>alert(1)</script>");
  });
});
