import { z } from "zod";

import { buildManagementReportHtml } from "@/domain/reports/report-export";
import { getDashboardData } from "@/lib/dashboard-data";
import { buildManagementReportExport } from "@/server/management-report-export";
import { buildReportDownload } from "@/server/report-download";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const querySchema = z.object({
  format: z.enum(["csv", "print", "pdf"]).default("csv"),
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

async function exportReport(input: unknown, deliverToTelegram: boolean): Promise<Response> {
  const parsed = querySchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Некорректные фильтры отчёта." }, { status: 400, headers: noStoreHeaders() });
  }

  if (deliverToTelegram && parsed.data.format === "print") return Response.json({ error: "Выберите CSV или PDF." }, { status: 400 });

  // Receiver is derived from the signed-in profile, never from request parameters.
  let telegramUserId: number | null = null;
  let deliveryClient: Awaited<ReturnType<typeof createClient>> | null = null;
  let userId: string | null = null;
  if (deliverToTelegram) {
    deliveryClient = await createClient();
    const { data: claims, error } = await deliveryClient.auth.getClaims();
    userId = !error ? claims?.claims?.sub ?? null : null;
    if (!userId) return Response.json({ error: "Войдите в кабинет." }, { status: 401 });
    const { data: profile } = await deliveryClient.from("profiles").select("telegram_user_id").eq("id", userId).maybeSingle();
    telegramUserId = profile?.telegram_user_id ?? null;
    if (!telegramUserId) return Response.json({ error: "Подключите свой Telegram в кабинете, затем повторите отправку." }, { status: 409 });
  }
  const data = await getDashboardData("reports", parsed.data);
  if (data === "UNAUTHENTICATED") {
    return Response.json({ error: "Войдите в кабинет и повторите скачивание." }, { status: 401, headers: noStoreHeaders() });
  }
  if (data === "NO_ORGANIZATION") {
    return Response.json({ error: "Компания не найдена." }, { status: 404, headers: noStoreHeaders() });
  }

  if (deliveryClient) {
    const { data: reserved, error } = await deliveryClient.rpc("reserve_report_delivery", { p_organization_id: data.organization.id });
    if (error) return Response.json({ error: "Отправка отчётов пока недоступна. Попробуйте позже." }, { status: 503 });
    if (!reserved) return Response.json({ error: "Подождите 15 секунд перед следующей отправкой." }, { status: 429 });
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

  const file = await buildReportDownload(report, parsed.data.format, generatedAt);
  if (deliverToTelegram) {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) return Response.json({ error: "Отправка в Telegram не настроена." }, { status: 503 });
    if (file.content.byteLength > 20 * 1024 * 1024) return Response.json({ error: "Файл слишком большой для отправки. Выберите меньший период." }, { status: 413 });
    // Recheck binding before sending: the profile may have been unlinked while
    // a large report was being generated.
    const { data: currentProfile } = await deliveryClient!.from("profiles").select("telegram_user_id").eq("id", userId!).maybeSingle();
    if (currentProfile?.telegram_user_id !== telegramUserId) return Response.json({ error: "Подключение Telegram изменилось. Повторите отправку." }, { status: 409 });
    const body = new FormData();
    body.set("chat_id", String(telegramUserId));
    body.set("caption", `TruckProfit · ${data.organization.name}\n${report.filters.period}`.slice(0, 900));
    body.set("document", new Blob([new Uint8Array(file.content)], { type: file.contentType }), file.filename);
    const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body, signal: AbortSignal.timeout(20_000) });
    const payload = await response.json().catch(() => null) as { ok?: boolean } | null;
    if (!response.ok || !payload?.ok) return Response.json({ error: "Telegram не принял файл. Откройте чат с ботом, нажмите /start и повторите отправку." }, { status: 502 });
    return Response.json({ ok: true, message: "Отчёт отправлен файлом в ваш личный чат с ботом. Его можно сохранить или переслать." }, { headers: noStoreHeaders() });
  }
  const fallbackFilename = `TruckProfit-report-${generatedAt.toISOString().slice(0, 10)}.${parsed.data.format}`;
  return new Response(new Uint8Array(file.content), {
    headers: {
      ...noStoreHeaders(),
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    },
  });
}

async function safelyExport(input: unknown, telegram: boolean) {
  try { return await exportReport(input, telegram); }
  catch (error) {
    const message = error instanceof Error && /^(Для PDF выберите|Слишком много данных)/.test(error.message)
      ? error.message : "Не удалось сформировать полный отчёт. Повторите попытку или выберите меньший период.";
    return Response.json({ error: message }, { status: 503, headers: noStoreHeaders() });
  }
}
export async function GET(request: Request): Promise<Response> {
  return safelyExport(Object.fromEntries(new URL(request.url).searchParams), false);
}
export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Недопустимый источник запроса." }, { status: 403 });
  return safelyExport(await request.json().catch(() => null), true);
}
