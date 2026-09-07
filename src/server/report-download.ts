import { buildManagementReportCsv, reportExportFilename, type ManagementReportExportInput } from "@/domain/reports/report-export";
import { buildManagementReportPdf } from "./report-pdf";

export async function buildReportDownload(report: ManagementReportExportInput, format: "csv" | "pdf", generatedAt: Date) {
  const filename = reportExportFilename(report.organizationName, generatedAt).replace(/\.csv$/, `.${format}`);
  return {
    filename,
    contentType: format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8",
    content: format === "pdf" ? await buildManagementReportPdf(report) : Buffer.from(buildManagementReportCsv(report), "utf8"),
  };
}
