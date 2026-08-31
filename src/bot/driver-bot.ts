import { Bot, Context, InlineKeyboard, session, type SessionFlavor } from "grammy";

import {
  advanceExpenseWizard,
  beginExpenseWizard,
  type ExpenseWizardState,
} from "./expense-wizard";
import type {
  ActiveTrip,
  DriverBotRepository,
  DriverIdentity,
  RecordStatusInput,
} from "./repository";

type PendingExpense = { state: ExpenseWizardState; trip: ActiveTrip };
type PendingReceipt = { expenseId: string; organizationId: string; driverId: string };
type PendingOdometer = { trip: ActiveTrip };
type PendingStatus = { trip: ActiveTrip; statusCode: RecordStatusInput["statusCode"]; loadState: RecordStatusInput["loadState"] };

type BotSession = {
  expense?: PendingExpense;
  receipt?: PendingReceipt;
  odometer?: PendingOdometer;
  status?: PendingStatus;
};

type DriverBotContext = Context & SessionFlavor<BotSession>;

const categoryLabels: Record<string, string> = {
  FUEL: "Топливо",
  TOLL: "Дорога",
  REPAIR: "Ремонт",
  PARKING: "Стоянка",
  DAILY_ALLOWANCE: "Суточные",
  OTHER: "Прочее",
};

const statusDefinitions: Record<string, { title: string; statusCode: RecordStatusInput["statusCode"]; loadState: RecordStatusInput["loadState"] }> = {
  AT_LOADING: { title: "На погрузке", statusCode: "AT_LOADING", loadState: "UNKNOWN" },
  LOADED: { title: "Загружен", statusCode: "LOADED", loadState: "LOADED" },
  IN_TRANSIT: { title: "В пути", statusCode: "IN_TRANSIT", loadState: "LOADED" },
  AT_UNLOADING: { title: "На выгрузке", statusCode: "AT_UNLOADING", loadState: "LOADED" },
  UNLOADED: { title: "Выгружен", statusCode: "UNLOADED", loadState: "EMPTY" },
  IDLE: { title: "Простой", statusCode: "IDLE", loadState: "EMPTY" },
  DELAY: { title: "Задержка", statusCode: "DELAY", loadState: "UNKNOWN" },
};

function mainMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Мой рейс", "menu:trip")
    .text("Добавить расход", "menu:expense")
    .row()
    .text("Пробег", "menu:odometer")
    .text("Статус", "menu:status")
    .row()
    .text("Моя зарплата", "menu:pay");
}

function categoriesMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Топливо", "expense:category:FUEL")
    .text("Дорога", "expense:category:TOLL")
    .row()
    .text("Ремонт", "expense:category:REPAIR")
    .text("Стоянка", "expense:category:PARKING")
    .row()
    .text("Суточные", "expense:category:DAILY_ALLOWANCE")
    .text("Прочее", "expense:category:OTHER")
    .row()
    .text("Отменить", "flow:cancel");
}

function statusesMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("На погрузке", "status:AT_LOADING")
    .text("Загружен", "status:LOADED")
    .row()
    .text("В пути", "status:IN_TRANSIT")
    .text("На выгрузке", "status:AT_UNLOADING")
    .row()
    .text("Выгружен", "status:UNLOADED")
    .text("Простой", "status:IDLE")
    .row()
    .text("Задержка", "status:DELAY")
    .text("Отменить", "flow:cancel");
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
}

function parsePositiveNumber(value: string): number | null {
  const number = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function resetFlow(context: DriverBotContext): void {
  context.session.expense = undefined;
  context.session.odometer = undefined;
  context.session.status = undefined;
}

function telegramUserId(context: DriverBotContext): number | null {
  const id = context.from?.id;
  return id !== undefined && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function invitationCode(context: DriverBotContext): string | null {
  const text = context.message?.text ?? "";
  const match = text.match(/^\/start(?:@\w+)?\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function commandArguments(context: DriverBotContext, command: string): string[] {
  const text = context.message?.text ?? "";
  const match = text.match(new RegExp(`^/${command}(?:@\\w+)?(?:\\s+(.+))?$`, "i"));
  return match?.[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
}

export function createDriverBot(token: string, repository: DriverBotRepository): Bot<DriverBotContext> {
  const bot = new Bot<DriverBotContext>(token);

  bot.use(async (context, next) => {
    const updateId = context.update.update_id;
    const reserved = await repository.reserveIncomingUpdate(updateId);
    if (!reserved) return;
    try {
      await next();
      await repository.finishIncomingUpdate(updateId, "PROCESSED");
    } catch (error) {
      await repository.finishIncomingUpdate(updateId, "FAILED", "Telegram handler failed");
      throw error;
    }
  });

  bot.use(session({
    initial: (): BotSession => ({}),
    getSessionKey: (context) => context.chat?.id.toString(),
    storage: {
      read: async (key) => (await repository.loadConversation(key)) as BotSession | undefined,
      write: async (key, value) => repository.saveConversation(key, value),
      delete: async (key) => repository.deleteConversation(key),
    },
  }));

  async function findDriver(context: DriverBotContext): Promise<DriverIdentity | null> {
    const userId = telegramUserId(context);
    if (!userId) {
      await context.reply("Этот бот работает только в личном чате Telegram.");
      return null;
    }
    const driver = await repository.findDriverByTelegramUserId(userId);
    if (!driver) {
      await context.reply("Доступ не привязан. Откройте ссылку-приглашение от диспетчера или попросите новую.");
      return null;
    }
    return driver;
  }

  async function findTrip(context: DriverBotContext, driver: DriverIdentity): Promise<ActiveTrip | null> {
    const trip = await repository.findActiveTrip(driver);
    if (!trip) await context.reply("Сейчас нет активного рейса. Если это ошибка — сообщите диспетчеру.", { reply_markup: mainMenu() });
    return trip;
  }

  async function showMenu(context: DriverBotContext, message = "Выберите действие."): Promise<void> {
    await context.reply(message, { reply_markup: mainMenu() });
  }

  bot.command("start", async (context) => {
    const userId = telegramUserId(context);
    const code = invitationCode(context);
    if (!userId) {
      await context.reply("Откройте бота в личном чате Telegram.");
      return;
    }
    if (code) {
      try {
        const driver = await repository.claimInvitation(code, userId);
        await showMenu(context, `Готово, ${driver.driverName}. Аккаунт водителя привязан.`);
      } catch {
        await context.reply("Не удалось использовать приглашение. Возможно, оно истекло или уже использовано. Запросите новое у диспетчера.");
      }
      return;
    }
    const driver = await repository.findDriverByTelegramUserId(userId);
    if (!driver) {
      await context.reply("Нужна персональная ссылка-приглашение от диспетчера. Она привяжет этот Telegram-аккаунт к вашему профилю.");
      return;
    }
    await showMenu(context, `Здравствуйте, ${driver.driverName}.`);
  });

  bot.command("menu", async (context) => showMenu(context));
  bot.command("cancel", async (context) => {
    resetFlow(context);
    await showMenu(context, "Ввод отменён.");
  });
  bot.command("done", async (context) => {
    context.session.receipt = undefined;
    await showMenu(context, "Готово.");
  });
  bot.command("legstart", async (context) => {
    const driver = await findDriver(context);
    if (!driver) return;
    const [rawOdometer, rawLoadState] = commandArguments(context, "legstart");
    const odometerKm = rawOdometer ? parsePositiveNumber(rawOdometer) : null;
    const loadState = rawLoadState?.toUpperCase();
    if (odometerKm === null || !Number.isInteger(odometerKm) || (loadState !== "LOADED" && loadState !== "EMPTY")) {
      await context.reply("Формат: /legstart 523840 loaded или /legstart 523840 empty");
      return;
    }
    const trip = await findTrip(context, driver);
    if (!trip) return;
    await repository.startAssignedLeg({
      organizationId: trip.organizationId,
      driverId: trip.driverId,
      tripId: trip.id,
      odometerKm,
      loadState,
    });
    await showMenu(context, `Плечо начато: ${odometerKm} км, ${loadState === "LOADED" ? "с грузом" : "порожняком"}.`);
  });
  bot.command("legfinish", async (context) => {
    const driver = await findDriver(context);
    if (!driver) return;
    const [rawOdometer] = commandArguments(context, "legfinish");
    const odometerKm = rawOdometer ? parsePositiveNumber(rawOdometer) : null;
    if (odometerKm === null || !Number.isInteger(odometerKm)) {
      await context.reply("Формат: /legfinish 525050");
      return;
    }
    const trip = await findTrip(context, driver);
    if (!trip) return;
    await repository.finishAssignedLeg({
      organizationId: trip.organizationId,
      driverId: trip.driverId,
      tripId: trip.id,
      odometerKm,
    });
    await showMenu(context, `Плечо завершено: ${odometerKm} км.`);
  });

  bot.on("callback_query:data", async (context) => {
    const data = context.callbackQuery.data;
    await context.answerCallbackQuery();
    if (data === "flow:cancel") {
      resetFlow(context);
      await showMenu(context, "Ввод отменён.");
      return;
    }
    if (data === "receipt:done") {
      context.session.receipt = undefined;
      await showMenu(context, "Готово.");
      return;
    }

    const driver = await findDriver(context);
    if (!driver) return;

    if (data === "menu:trip") {
      const trip = await findTrip(context, driver);
      if (trip) await context.reply(`Ваш активный рейс: ${trip.title}`, { reply_markup: mainMenu() });
      return;
    }

    if (data === "menu:expense") {
      const trip = await findTrip(context, driver);
      if (!trip) return;
      const started = beginExpenseWizard(trip.id, trip.currency);
      context.session.expense = { state: started.state, trip };
      await context.reply(started.prompt, { reply_markup: categoriesMenu() });
      return;
    }

    if (data.startsWith("expense:category:")) {
      const pending = context.session.expense;
      const category = data.replace("expense:category:", "");
      if (!pending) {
        await context.reply("Срок ввода расхода истёк. Начните заново.", { reply_markup: mainMenu() });
        return;
      }
      const result = advanceExpenseWizard(pending.state, category);
      context.session.expense = { ...pending, state: result.state };
      await context.reply(result.prompt);
      return;
    }

    if (data === "expense:confirm") {
      const pending = context.session.expense;
      if (!pending || pending.state.step !== "CONFIRM") {
        await context.reply("Нет расхода для подтверждения. Начните заново.", { reply_markup: mainMenu() });
        return;
      }
      const draft = pending.state.draft;
      const recorded = await repository.recordExpense({
        organizationId: pending.trip.organizationId,
        driverId: pending.trip.driverId,
        tripId: pending.trip.id,
        categoryCode: draft.categoryCode!,
        amountMinor: draft.amountMinor!,
        currency: draft.currency,
        occurredAt: new Date(),
        odometerKm: draft.odometerKm,
        fuelLitres: draft.fuelLitres,
      });
      context.session.expense = undefined;
      context.session.receipt = {
        expenseId: recorded.expenseId,
        organizationId: pending.trip.organizationId,
        driverId: pending.trip.driverId,
      };
      await context.reply("Расход записан. Пришлите фото чека, если оно есть, или нажмите «Готово».", {
        reply_markup: new InlineKeyboard().text("Готово", "receipt:done"),
      });
      return;
    }

    if (data === "menu:odometer") {
      const trip = await findTrip(context, driver);
      if (!trip) return;
      context.session.odometer = { trip };
      await context.reply("Укажите текущий одометр в километрах.");
      return;
    }

    if (data === "menu:status") {
      const trip = await findTrip(context, driver);
      if (!trip) return;
      context.session.status = undefined;
      await context.reply("Выберите статус движения.", { reply_markup: statusesMenu() });
      return;
    }

    if (data.startsWith("status:")) {
      const definition = statusDefinitions[data.replace("status:", "")];
      const trip = await findTrip(context, driver);
      if (!definition || !trip) return;
      context.session.status = { trip, statusCode: definition.statusCode, loadState: definition.loadState };
      await context.reply(`Статус «${definition.title}». Напишите локацию или отправьте «-», если локацию указывать не нужно.`);
      return;
    }

    if (data === "menu:pay") {
      const trip = await findTrip(context, driver);
      if (!trip) return;
      const pay = await repository.findPreliminaryCompensation(driver, trip.id);
      if (!pay) {
        await context.reply("Предварительная зарплата по текущему рейсу ещё не рассчитана.", { reply_markup: mainMenu() });
        return;
      }
      const label = pay.status === "APPROVED" ? "Подтверждено" : "Предварительно";
      await context.reply(`${label}: ${formatMoney(pay.amountMinor, pay.currency)}. Финальная сумма подтверждается диспетчером.`, { reply_markup: mainMenu() });
    }
  });

  bot.on("message:text", async (context) => {
    const text = context.message.text.trim();
    if (text.startsWith("/")) return;
    const driver = await findDriver(context);
    if (!driver) return;

    if (context.session.status) {
      const pending = context.session.status;
      await repository.recordStatus({
        organizationId: pending.trip.organizationId,
        driverId: pending.trip.driverId,
        tripId: pending.trip.id,
        statusCode: pending.statusCode,
        loadState: pending.loadState,
        locationText: text === "-" ? "" : text,
        occurredAt: new Date(),
      });
      context.session.status = undefined;
      await showMenu(context, "Статус сохранён.");
      return;
    }

    if (context.session.odometer) {
      const value = parsePositiveNumber(text);
      if (value === null) {
        await context.reply("Введите положительное число, например 506300.");
        return;
      }
      const pending = context.session.odometer;
      await repository.recordOdometer({
        organizationId: pending.trip.organizationId,
        driverId: pending.trip.driverId,
        tripId: pending.trip.id,
        odometerKm: value,
        occurredAt: new Date(),
      });
      context.session.odometer = undefined;
      await showMenu(context, "Пробег сохранён.");
      return;
    }

    const pending = context.session.expense;
    if (!pending) {
      await showMenu(context);
      return;
    }

    if (pending.state.step === "CONFIRM" && text.toUpperCase() === "CONFIRM") {
      await context.reply("Подтвердите запись кнопкой ниже.", { reply_markup: new InlineKeyboard().text("Сохранить расход", "expense:confirm") });
      return;
    }

    const result = advanceExpenseWizard(pending.state, text);
    context.session.expense = { ...pending, state: result.state };
    if (result.kind === "CONFIRM") {
      const draft = result.state.draft;
      await context.reply(`${result.prompt}\nКатегория: ${categoryLabels[draft.categoryCode ?? ""] ?? draft.categoryCode}.`, {
        reply_markup: new InlineKeyboard().text("Сохранить расход", "expense:confirm").text("Отменить", "flow:cancel"),
      });
      return;
    }
    await context.reply(result.prompt);
  });

  bot.on("message:photo", async (context) => {
    const receipt = context.session.receipt;
    if (!receipt) {
      await context.reply("Сначала добавьте расход, затем приложите к нему фото чека.", { reply_markup: mainMenu() });
      return;
    }
    const driver = await findDriver(context);
    if (!driver || driver.driverId !== receipt.driverId || driver.organizationId !== receipt.organizationId) {
      await context.reply("Не удалось подтвердить, кому принадлежит расход. Добавьте расход заново.", { reply_markup: mainMenu() });
      return;
    }
    const photo = context.message.photo.at(-1);
    if (!photo) return;
    const file = await context.api.getFile(photo.file_id);
    if (!file.file_path) throw new Error("Telegram did not return a receipt file path");
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
    if (!response.ok) throw new Error("Unable to download receipt photo from Telegram");
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > 10 * 1024 * 1024) throw new Error("Receipt image is larger than 10 MB");
    const content = await response.arrayBuffer();
    await repository.uploadReceipt({
      ...receipt,
      content,
      contentType: "image/jpeg",
      originalFilename: `telegram-receipt-${photo.file_unique_id}.jpg`,
    });
    context.session.receipt = undefined;
    await showMenu(context, "Фото чека прикреплено.");
  });

  bot.catch(async (error) => {
    console.error("Telegram bot handler failed");
    if (error.ctx.chat) await error.ctx.reply("Не удалось обработать действие. Попробуйте ещё раз или сообщите диспетчеру.");
  });

  return bot;
}
