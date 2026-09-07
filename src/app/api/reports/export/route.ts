import { z } from "zod";

import { buildManagementReportCsv, buildManagementReportHtml, reportExportFilename } from "@/domain/reports/report-export";
import { getDashboardData } from "@/lib/dashboard-data";
import { buildManagementReportExport } from "@/server/management-report-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  format: z.enum(["csv", "print"]).default("csv"),
  driverId: z.uuid().optional(),
  vehicleId: z.uuid().optional(),
  tripStatus: z.enum(["ACTIVE", "COMPLETED", "DRAFT", "CANCELLED"]).optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  timeZone: z.string().trim().min(1).max(80).optional(),
}).refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
  message: "Начальная дата не может быть позже конечной.",
});

function noStoreHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

export async function GET(request: Request): Promise<Response> {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return Response.json({ error: "Некорректные фильтры отчёта." }, { status: 400, headers: noStoreHeaders() });
  }

  const data = await getDashboardData("reports");
  if (data === "UNAUTHENTICATED") {
    return Response.json({ error: "Войдите в кабинет и повторите скачивание." }, { status: 401, headers: noStoreHeaders() });
  }
  if (data === "NO_ORGANIZATION") {
    return Response.json({ error: "Компания не найдена." }, { status: 404, headers: noStoreHeaders() });
  }

  const generatedAt = new Date();
  const report = buildManagementReportExport(data, parsed.data, generatedAt, parsed.data.timeZone);
  if (parsed.data.format === "print") {
    return new Response(buildManagementReportHtml(report), {
      headers: {
        ...noStoreHeaders(),
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": "inline",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      },
    });
  }

  const filename = reportExportFilename(data.organization.name, generatedAt);
  const fallbackFilename = `TruckProfit-report-${generatedAt.toISOString().slice(0, 10)}.csv`;
  return new Response(buildManagementReportCsv(report), {
    headers: {
      ...noStoreHeaders(),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
