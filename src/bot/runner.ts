import { createDriverBot } from "./driver-bot";
import { readBotEnvironment } from "../server/env";
import { SupabaseDriverBotRepository } from "../server/supabase-driver-bot-repository";

const environment = readBotEnvironment();
const repository = new SupabaseDriverBotRepository(environment);
const bot = createDriverBot(environment.telegramBotToken, repository);

void bot.start({ allowed_updates: ["message", "callback_query"] });
