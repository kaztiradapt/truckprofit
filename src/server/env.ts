export type BotEnvironment = {
  telegramBotToken: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

export type TelegramWebhookEnvironment = BotEnvironment & {
  telegramWebhookSecret: string;
};

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function readBotEnvironment(): BotEnvironment {
  const supabaseUrl = requireEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseUrl.startsWith("https://")) throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS");

  return {
    telegramBotToken: requireEnvironmentValue("TELEGRAM_BOT_TOKEN"),
    supabaseUrl,
    supabaseServiceRoleKey: requireEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function readTelegramWebhookEnvironment(): TelegramWebhookEnvironment {
  const telegramWebhookSecret = requireEnvironmentValue("TELEGRAM_WEBHOOK_SECRET");
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(telegramWebhookSecret)) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET must contain only letters, digits, _ or -");
  }
  return { ...readBotEnvironment(), telegramWebhookSecret };
}
