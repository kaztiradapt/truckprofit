import { fetchAllRows, fetchRowsByIds } from "@/server/paginated-query";
import { createHash } from "node:crypto";

import { z } from "zod";

import { buildReportSignals, toReportMetricSnapshot, type ReportSignal } from "@/domain/reports/ai-report-analysis";
import { aggregateManagementReport, type ExpenseBehavior, type ReportExpenseGroup } from "@/domain/reports/management-report";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticatedTeamRequest } from "@/server/team-access";

export const maxDuration = 60;

const inputSchema = z.object({
  organizationId: z.uuid(),
  dateFrom: z.union([z.iso.date(), z.literal("")]).optional(),
  dateTo: z.union([z.iso.date(), z.literal("")]).optional(),
  driverId: z.union([z.uuid(), z.literal("")]).optional(),
  vehicleId: z.union([z.uuid(), z.literal("")]).optional(),
  tripStatus: z.union([z.enum(["ACTIVE", "COMPLETED", "DRAFT", "CANCELLED"]), z.literal("")]).optional(),
}).refine((value) => Boolean(value.dateFrom) === Boolean(value.dateTo), {
  message: "Укажите обе границы периода.",
});

const aiResultSchema = z.object({
  summary: z.string().min(1).max(800),
  insights: z.array(z.object({
    signalId: z.string().min(1).max(80),
    title: z.string().min(1).max(160),
    explanation: z.string().min(1).max(700),
    checks: z.array(z.string().min(1).max(300)).max(4),
  })).max(8),
  dataQuality: z.string().min(1).max(500),
});

type Period = { start: string; end: string };
type AiFailureCode = "NOT_CONFIGURED" | "TIMEOUT" | "AUTH" | "QUOTA" | "MODEL" | "UPSTREAM" | "INVALID_RESPONSE";

type TripRow = {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  status: string;
  started_at: string;
};

type LegRow = { trip_id: string; distance_km: number | string | null; load_state: string };
type IncomeRow = { trip_id: string; reporting_amount_minor: number | string };
type PnlRow = { trip_id: string; driver_compensation_minor: number | string };
type ExpenseRow = {
  trip_id: string | null;
  reporting_amount_minor: number | string;
  quantity: number | string | null;
  unit: string | null;
  cost_behavior: ExpenseBehavior;
  include_in_normalized_cost: boolean;
  expense_categories: { economic_group: ReportExpenseGroup } | { economic_group: ReportExpenseGroup }[] | null;
};

function asOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function resolvePeriods(dateFrom?: string, dateTo?: string): { current: Period; previous: Period } {
  const currentEnd = dateTo || isoDate(new Date());
  const currentStart = dateFrom || shiftDate(currentEnd, -29);
  const days = Math.max(1, Math.round((new Date(`${currentEnd}T12:00:00.000Z`).getTime() - new Date(`${currentStart}T12:00:00.000Z`).getTime()) / 86_400_000) + 1);
  const previousEnd = shiftDate(currentStart, -1);
  return {
    current: { start: currentStart, end: currentEnd },
    previous: { start: shiftDate(previousEnd, -(days - 1)), end: previousEnd },
  };
}

function isWithin(value: string, period: Period): boolean {
  const date = value.slice(0, 10);
  return date >= period.start && date <= period.end;
}

function rulesResult(signals: ReportSignal[]) {
  const material = signals.filter((signal) => signal.severity === "CRITICAL" || signal.severity === "WARNING");
  return {
    summary: material.length
      ? `Обнаружено отклонений, требующих внимания: ${material.length}. Расчёты выполнены системой по фактическим данным отчёта.`
      : "Существенных негативных отклонений по установленным порогам не обнаружено.",
    insights: signals.map((signal) => ({
      signalId: signal.id,
      title: signal.title,
      explanation: signal.detail,
      checks: [signal.recommendation],
    })),
    dataQuality: signals.some((signal) => signal.id === "FUEL_DATA_QUALITY")
      ? "Точность анализа топлива ограничена: заполните километраж и литры в топливных расходах."
      : "Расчёты основаны на заполненных рейсах и расходах. Выводы являются управленческой справкой и требуют проверки первичных документов.",
  };
}

async function createAiExplanation(input: {
  current: ReturnType<typeof toReportMetricSnapshot>;
  previous: ReturnType<typeof toReportMetricSnapshot>;
  signals: ReportSignal[];
  currency: string;
  period: Period;
  comparison: Period;
  safetyIdentifier: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { result: null, failureCode: "NOT_CONFIGURED" as AiFailureCode };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_ANALYTICS_MODEL?.trim() || "gpt-5-mini",
        store: false,
        max_output_tokens: 1_000,
        safety_identifier: input.safetyIdentifier,
        reasoning: { effort: "minimal" },
        instructions: [
          "Ты аналитик экономики грузового автопарка. Отвечай по-русски.",
          "Все числа уже рассчитаны приложением. Не пересчитывай их, не изменяй и не добавляй новые факты.",
          "Разделяй установленный факт и возможную причину. Причины называй гипотезами, требующими проверки.",
          "Не давай юридических, налоговых или инвестиционных заключений. Сформулируй короткую управленческую справку.",
        ].join(" "),
        input: JSON.stringify({
          period: input.period,
          comparisonPeriod: input.comparison,
          reportingCurrency: input.currency,
          currentMetrics: input.current,
          previousMetrics: input.previous,
          deterministicSignals: input.signals,
        }),
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "fleet_report_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                summary: { type: "string" },
                insights: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      signalId: { type: "string" },
                      title: { type: "string" },
                      explanation: { type: "string" },
                      checks: { type: "array", items: { type: "string" }, maxItems: 4 },
                    },
                    required: ["signalId", "title", "explanation", "checks"],
                  },
                  maxItems: 8,
                },
                dataQuality: { type: "string" },
              },
              required: ["summary", "insights", "dataQuality"],
            },
          },
        },
      }),
    });
    if (!response.ok) {
      const failureCode: AiFailureCode = response.status === 401 || response.status === 403
        ? "AUTH"
        : response.status === 429
          ? "QUOTA"
          : response.status === 404
            ? "MODEL"
            : "UPSTREAM";
      console.warn("OpenAI report analysis unavailable", { status: response.status, failureCode });
      return { result: null, failureCode };
    }
    const payload = await response.json() as {
      output_text?: string;
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    };
    const outputText = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
    if (!outputText) return { result: null, failureCode: "INVALID_RESPONSE" as AiFailureCode };
    const parsed = aiResultSchema.parse(JSON.parse(outputText));
    const explanationsBySignal = new Map(parsed.insights.map((insight) => [insight.signalId, insight]));
    return { result: {
      summary: parsed.summary,
      insights: input.signals.slice(0, 8).map((signal) => {
        const explanation = explanationsBySignal.get(signal.id);
        return {
          signalId: signal.id,
          title: signal.title,
          explanation: explanation?.explanation ?? signal.detail,
          checks: [...new Set([signal.recommendation, ...(explanation?.checks ?? [])])].slice(0, 4),
        };
      }),
      dataQuality: parsed.dataQuality,
    }, failureCode: null };
  } catch (error) {
    const failureCode: AiFailureCode = error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "INVALID_RESPONSE";
    console.warn("OpenAI report analysis failed", { failureCode });
    return { result: null, failureCode };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request): Promise<Response> {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Проверьте фильтры отчёта." }, { status: 400 });

  const auth = await authenticatedTeamRequest();
  if (!auth) return Response.json({ error: "Требуется вход." }, { status: 401 });
  const { data: allowed, error: permissionError } = await auth.supabase.rpc("has_org_permission", {
    target_organization_id: parsed.data.organizationId,
    required_permission: "VIEW_FINANCE",
  });
  if (permissionError || !allowed) return Response.json({ error: "Нет доступа к финансовой аналитике." }, { status: 403 });

  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentAnalysisCount, error: rateLimitError } = await auth.supabase
    .from("report_ai_analyses")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", parsed.data.organizationId)
    .eq("requested_by", auth.userId)
    .gte("created_at", minuteAgo);
  if (rateLimitError && rateLimitError.code !== "42P01") {
    return Response.json({ error: "Не удалось проверить лимит анализа." }, { status: 500 });
  }
  if ((recentAnalysisCount ?? 0) >= 6) {
    return Response.json({ error: "Слишком много новых анализов подряд. Подождите минуту." }, { status: 429 });
  }

  const periods = resolvePeriods(parsed.data.dateFrom, parsed.data.dateTo);
  const { data: organization } = await auth.supabase.from("organizations").select("base_currency")
    .eq("id", parsed.data.organizationId).maybeSingle();
  if (!organization) return Response.json({ error: "Компания не найдена." }, { status: 404 });

  let tripsQuery = auth.supabase.from("trips").select("id, vehicle_id, driver_id, status, started_at")
    .eq("organization_id", parsed.data.organizationId)
    .is("deleted_at", null)
    .not("started_at", "is", null)
    .gte("started_at", `${periods.previous.start}T00:00:00.000Z`)
    .lte("started_at", `${periods.current.end}T23:59:59.999Z`)
    .order("id");
  if (parsed.data.driverId) tripsQuery = tripsQuery.eq("driver_id", parsed.data.driverId);
  if (parsed.data.vehicleId) tripsQuery = tripsQuery.eq("vehicle_id", parsed.data.vehicleId);
  if (parsed.data.tripStatus) tripsQuery = tripsQuery.eq("status", parsed.data.tripStatus);
  const { data: tripsData, error: tripsError } = await fetchAllRows(() => tripsQuery);
  if (tripsError) return Response.json({ error: "Не удалось собрать рейсы для анализа." }, { status: 500 });
  const trips = (tripsData ?? []) as TripRow[];
  const tripIds = trips.map((trip) => trip.id);

  let legs: LegRow[] = [];
  let incomes: IncomeRow[] = [];
  let pnlRows: PnlRow[] = [];
  let expenses: ExpenseRow[] = [];
  if (tripIds.length) {
    const [legsResult, incomesResult, pnlResult, expensesResult] = await Promise.all([
      fetchRowsByIds(tripIds, (batch) => auth.supabase.from("trip_legs").select("trip_id, distance_km, load_state").in("trip_id", batch).eq("organization_id", parsed.data.organizationId).is("deleted_at", null).order("id")),
      fetchRowsByIds(tripIds, (batch) => auth.supabase.from("incomes").select("trip_id, reporting_amount_minor").in("trip_id", batch).eq("organization_id", parsed.data.organizationId).neq("payment_status", "VOIDED").is("deleted_at", null).order("id")),
      fetchRowsByIds(tripIds, (batch) => auth.supabase.from("pnl_snapshots").select("trip_id, driver_compensation_minor").in("trip_id", batch).eq("organization_id", parsed.data.organizationId).eq("is_current", true).order("id")),
      fetchRowsByIds(tripIds, (batch) => auth.supabase.from("expenses").select("trip_id, reporting_amount_minor, quantity, unit, cost_behavior, include_in_normalized_cost, expense_categories(economic_group)").in("trip_id", batch).eq("organization_id", parsed.data.organizationId).neq("review_status", "REJECTED").eq("status", "RECORDED").is("deleted_at", null).order("id")),
    ]);
    if (legsResult.error || incomesResult.error || pnlResult.error || expensesResult.error) {
      return Response.json({ error: "Не удалось собрать показатели для анализа." }, { status: 500 });
    }
    legs = (legsResult.data ?? []) as LegRow[];
    incomes = (incomesResult.data ?? []) as IncomeRow[];
    pnlRows = (pnlResult.data ?? []) as PnlRow[];
    expenses = (expensesResult.data ?? []) as unknown as ExpenseRow[];
  }

  const legsByTrip = new Map<string, LegRow[]>();
  for (const leg of legs) legsByTrip.set(leg.trip_id, [...(legsByTrip.get(leg.trip_id) ?? []), leg]);
  const revenueByTrip = new Map<string, number>();
  for (const income of incomes) revenueByTrip.set(income.trip_id, (revenueByTrip.get(income.trip_id) ?? 0) + Number(income.reporting_amount_minor));
  const compensationByTrip = new Map(pnlRows.map((row) => [row.trip_id, Number(row.driver_compensation_minor)]));

  const tripFacts = trips.map((trip) => {
    const tripLegs = legsByTrip.get(trip.id) ?? [];
    return {
      id: trip.id,
      startedAt: trip.started_at,
      revenueMinor: revenueByTrip.get(trip.id) ?? 0,
      driverCompensationMinor: compensationByTrip.get(trip.id) ?? 0,
      totalKm: tripLegs.reduce((sum, leg) => sum + Number(leg.distance_km ?? 0), 0),
      loadedKm: tripLegs.filter((leg) => leg.load_state === "LOADED").reduce((sum, leg) => sum + Number(leg.distance_km ?? 0), 0),
      emptyKm: tripLegs.filter((leg) => leg.load_state === "EMPTY").reduce((sum, leg) => sum + Number(leg.distance_km ?? 0), 0),
    };
  });
  const expenseFacts = expenses.flatMap((expense) => {
    const category = asOne(expense.expense_categories);
    return category && expense.trip_id ? [{
      tripId: expense.trip_id,
      reportingAmountMinor: Number(expense.reporting_amount_minor),
      economicGroup: category.economic_group,
      costBehavior: expense.cost_behavior,
      includeInNormalizedCost: expense.include_in_normalized_cost,
      quantity: expense.quantity === null ? null : Number(expense.quantity),
      unit: expense.unit,
    }] : [];
  });
  const totalsFor = (period: Period) => {
    const selectedTrips = tripFacts.filter((trip) => isWithin(trip.startedAt, period));
    return aggregateManagementReport(selectedTrips, expenseFacts);
  };
  const currentMetrics = toReportMetricSnapshot(totalsFor(periods.current));
  const previousMetrics = toReportMetricSnapshot(totalsFor(periods.previous));

  let vehicleFuelNorm: number | null = null;
  if (parsed.data.vehicleId) {
    const { data: vehicle } = await auth.supabase.from("vehicles").select("fuel_norm_l_per_100km")
      .eq("organization_id", parsed.data.organizationId).eq("id", parsed.data.vehicleId).maybeSingle();
    vehicleFuelNorm = vehicle?.fuel_norm_l_per_100km === null || vehicle?.fuel_norm_l_per_100km === undefined ? null : Number(vehicle.fuel_norm_l_per_100km);
  }
  const signals = buildReportSignals(currentMetrics, previousMetrics, vehicleFuelNorm);
  const filters = {
    driverId: parsed.data.driverId || null,
    vehicleId: parsed.data.vehicleId || null,
    tripStatus: parsed.data.tripStatus || null,
  };
  const model = process.env.OPENAI_ANALYTICS_MODEL?.trim() || "gpt-5-mini";
  const inputHash = createHash("sha256").update(JSON.stringify({ version: 1, periods, filters, currentMetrics, previousMetrics, signals, model })).digest("hex");
  const admin = createAdminClient();
  const apiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const { data: cached } = await admin.from("report_ai_analyses").select("result, mode, model, created_at, expires_at")
    .eq("organization_id", parsed.data.organizationId).eq("input_hash", inputHash).maybeSingle();
  if (cached && new Date(cached.expires_at).getTime() > Date.now() && (cached.mode === "AI" || !apiConfigured)) {
    return Response.json({
      ...cached.result,
      mode: cached.mode,
      model: cached.model,
      generatedAt: cached.created_at,
      cached: true,
      period: periods.current,
      comparisonPeriod: periods.previous,
      currentMetrics,
      previousMetrics,
      signals,
    });
  }

  const aiExplanation = await createAiExplanation({
    current: currentMetrics,
    previous: previousMetrics,
    signals,
    currency: organization.base_currency,
    period: periods.current,
    comparison: periods.previous,
    safetyIdentifier: createHash("sha256").update(auth.userId).digest("hex").slice(0, 32),
  });
  const aiResult = aiExplanation.result;
  const result = aiResult ?? rulesResult(signals);
  const mode = aiResult ? "AI" : "RULES";
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (aiResult ? 24 * 60 : 10) * 60_000);
  await admin.from("report_ai_analyses").upsert({
    organization_id: parsed.data.organizationId,
    requested_by: auth.userId,
    input_hash: inputHash,
    period_start: periods.current.start,
    period_end: periods.current.end,
    comparison_start: periods.previous.start,
    comparison_end: periods.previous.end,
    filters,
    metrics: { current: currentMetrics, previous: previousMetrics },
    signals,
    result,
    model: aiResult ? model : null,
    mode,
    expires_at: expiresAt.toISOString(),
  }, { onConflict: "organization_id,input_hash" });

  return Response.json({
    ...result,
    mode,
    model: aiResult ? model : null,
    generatedAt: now.toISOString(),
    cached: false,
    period: periods.current,
    comparisonPeriod: periods.previous,
    currentMetrics,
    previousMetrics,
    signals,
    fallbackReason: aiExplanation.failureCode,
  });
}
