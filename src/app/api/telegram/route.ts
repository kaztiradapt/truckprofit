import { webhookCallback } from "grammy";

import { createDriverBot } from "@/bot/driver-bot";
import { readTelegramWebhookEnvironment, type TelegramWebhookEnvironment } from "@/server/env";
import { SupabaseDriverBotRepository } from "@/server/supabase-driver-bot-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let handler: ((request: Request) => Promise<Response>) | undefined;

function getHandler(): (request: Request) => Promise<Response> {
  if (handler) return handler;
  const environment: TelegramWebhookEnvironment = readTelegramWebhookEnvironment();
  const bot = createDriverBot(environment.telegramBotToken, new SupabaseDriverBotRepository(environment));
  handler = webhookCallback(bot, "std/http", {
    // Never acknowledge unfinished work: Telegram must retry a timed-out update.
    onTimeout: "throw",
    timeoutMilliseconds: 45_000,
    secretToken: environment.telegramWebhookSecret,
  });
  return handler;
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await getHandler()(request);
  } catch (error) {
    console.error("telegram_webhook_failed", error instanceof Error ? error.message : "unknown");
    return new Response("Service unavailable", { status: 503 });
  }
}

export function GET(): Response {
  return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
}
