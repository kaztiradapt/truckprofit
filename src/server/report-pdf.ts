import PDFDocument from "pdfkit";
import { join } from "node:path";
import type { ManagementReportExportInput } from "@/domain/reports/report-export";

const font = join(process.cwd(), "assets/fonts/DejaVuSans.ttf");
const bold = join(process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf");
const green = "#176b50";
const ink = "#192b25";
const clean = (value: unknown) => String(value ?? "-").replace(/\s+/g, " ").trim();
const number = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
const money = (value: number) => number(value / 100);

/** A real, self-contained PDF: embedded Cyrillic fonts, repeated table headers. */
export async function buildManagementReportPdf(input: ManagementReportExportInput): Promise<Buffer> {
  if (input.trips.length + input.drivers.length + input.vehicles.length > 10_000) {
    throw new Error("Для PDF выберите меньший период (не более 10 000 строк). Полная выборка доступна в CSV.");
  }
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, font, bufferPages: true,
    info: { Title: `TruckProfit - ${clean(input.organizationName)}`, Author: "TruckProfit" } });
  doc.registerFont("regular", font).registerFont("bold", bold);
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const left = 36;
  const width = doc.page.width - 72;
  const bottom = doc.page.height - 65;
  let y = 36;

  function header() {
    doc.font("bold").fontSize(16).fillColor(green).text("TruckProfit", left, 25, { lineBreak: false });
    doc.font("regular").fontSize(9).fillColor(ink).text(clean(input.organizationName), left + 125, 30, { width: width - 125, height: 24, ellipsis: true });
    doc.moveTo(left, 53).lineTo(left + width, 53).strokeColor("#d4e3dc").stroke();
    y = 67;
  }
  function page() { doc.addPage(); header(); }
  function text(value: string, size = 10, weight = "regular") {
    doc.font(weight).fontSize(size).fillColor(ink);
    const height = doc.heightOfString(clean(value), { width });
    if (y + height > bottom) page();
    doc.text(clean(value), left, y, { width });
    y += height + 8;
  }
  function table(title: string, labels: string[], weights: number[], rows: string[][]) {
    const widths = weights.map((value) => width * value / weights.reduce((sum, item) => sum + item, 0));
    function tableHeader() {
      text(title, 13, "bold");
      doc.font("bold").fontSize(8.5);
      const height = Math.max(24, ...labels.map((label, i) => doc.heightOfString(label, { width: widths[i] - 12 }) + 14));
      doc.rect(left, y, width, height).fill(green);
      let x = left;
      labels.forEach((label, i) => { doc.fillColor("white").text(label, x + 6, y + 7, { width: widths[i] - 12 }); x += widths[i]; });
      y += height;
    }
    if (y > bottom - 100) page();
    tableHeader();
    if (!rows.length) { text("Нет данных в выбранном периоде."); return; }
    rows.forEach((cells, row) => {
      doc.font("regular").fontSize(8.5);
      const height = Math.max(25, ...cells.map((cell, i) => doc.heightOfString(clean(cell), { width: widths[i] - 12 }) + 14));
      if (y + height > bottom) { page(); tableHeader(); doc.font("regular").fontSize(8.5); }
      doc.rect(left, y, width, height).fill(row % 2 === 0 ? "#f0f6f3" : "#ffffff");
      let x = left;
      cells.forEach((cell, i) => { doc.fillColor(ink).text(clean(cell), x + 6, y + 7, { width: widths[i] - 12 }); x += widths[i]; });
      y += height;
    });
    y += 18;
  }

  header();
  text("Управленческий отчёт", 22, "bold");
  text(`Период: ${input.filters.period} | Валюта учёта: ${input.currency}`);
  text(`${input.filters.driver} | ${input.filters.vehicle} | ${input.filters.tripStatus}`);
  text(`Сформирован: ${input.generatedAt}`, 9);
  const t = input.totals;
  table("Сводка", ["Показатель", "Значение", "Показатель", "Значение"], [3,2,3,2], [
    ["Рейсы", number(t.trips), "Общий пробег, км", number(t.totalKm)],
    ["С грузом, км", number(t.loadedKm), "Порожний пробег, км", number(t.emptyKm)],
    ...(input.includeFinance ? [
      ["Выручка", money(t.revenueMinor), "Все фактические затраты", money(t.actualExpensesMinor)],
      ["Фактический результат", money(t.actualProfitMinor), "Нормализованный результат", money(t.normalizedProfitMinor)],
    ] : []),
  ]);
  const financialLabels = input.includeFinance ? ["Выручка", "Затраты", "Результат"] : [];
  table("Рейсы", ["Рейс / дата", "Водитель / автомобиль", "Статус", "Км", ...financialLabels], [3,3,1.4,1,...(input.includeFinance ? [1.4,1.4,1.4] : [])], input.trips.map((trip) => [
    `${trip.title} / ${trip.startedAt?.slice(0,10) ?? "-"}`, `${trip.driverName} / ${trip.vehicleName}`,
    ({ACTIVE:"В рейсе",COMPLETED:"Закрыт",DRAFT:"Черновик",CANCELLED:"Отменён"} as Record<string,string>)[trip.status] ?? trip.status,
    number(trip.totalKm), ...(input.includeFinance ? [money(trip.revenueMinor), money(trip.directExpensesMinor + trip.driverCompensationMinor), money(trip.profitMinor)] : []),
  ]));
  table("Водители", ["Водитель", "Рейсы", "Км", ...financialLabels], [3,1,1.5,...(input.includeFinance ? [2,2,2] : [])], input.drivers.map((driver) => [
    driver.displayName, number(driver.totalTrips), number(driver.totalKm), ...(input.includeFinance ? [money(driver.revenueMinor),money(driver.actualExpensesMinor),money(driver.actualProfitMinor)] : []),
  ]));
  table("Автомобили", ["Автомобиль", "Рейсы", "Км", ...financialLabels], [3,1,1.5,...(input.includeFinance ? [2,2,2] : [])], input.vehicles.map((vehicle) => [
    vehicle.name, number(vehicle.trips),number(vehicle.totalKm), ...(input.includeFinance ? [money(vehicle.revenueMinor),money(vehicle.actualExpensesMinor),money(vehicle.profitMinor)] : []),
  ]));
  text("Управленческий учёт. Результаты требуют сверки с первичными документами.", 9);
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.font("regular").fontSize(8).fillColor("#607269").text(`TruckProfit | ${i + 1} / ${pages.count}`, left, doc.page.height - 48, { width, lineBreak: false });
  }
  doc.end();
  return result;
}
