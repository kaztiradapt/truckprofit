import { Bot, Context, InlineKeyboard, Keyboard, session, type SessionFlavor } from "grammy";

import {
  advanceExpenseWizard,
  beginExpenseWizard,
  type ExpenseWizardState,
} from "./expense-wizard";
import type {
  ActiveTrip,
  DriverBotRepository,
  DriverIdentity,
  OwnerExpenseSummary,
  OwnerIdentity,
  OwnerSummary,
  OwnerTripSummary,
  RecordStatusInput,
  StaffIdentity,
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
  locationPromptMessageId?: number;
  mode?: "OWNER" | "DRIVER";
  ownerAvailable?: boolean;
  driverAvailable?: boolean;
  menuMessageId?: number;
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

function driverMenu(ownerAvailable = false): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("Мой рейс", "menu:trip")
    .row()
    .text("Добавить расход", "menu:expense")
    .text("Пробег", "menu:odometer")
    .row()
    .text("Статус", "menu:status")
    .text("📍 Геопозиция", "menu:location")
    .row()
    .text("Моя зарплата", "menu:pay")
    .text("❓ Помощь", "help:main");
  if (ownerAvailable) keyboard.row().text("👔 Режим владельца", "mode:owner");
  return keyboard;
}

function ownerMenu(driverAvailable = false): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("📊 Сводка", "owner:summary")
    .text("🚛 Активные рейсы", "owner:trips")
    .row()
    .text("👥 Водители", "owner:drivers")
    .text("💳 Расходы", "owner:expenses")
    .row()
    .text("❓ Помощь", "help:main");
  if (driverAvailable) keyboard.row().text("🚚 Режим водителя", "mode:driver");
  return keyboard;
}

function staffMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("❓ Помощь", "help:main");
}

function helpMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Владельцу", "help:owner")
    .text("Водителю", "help:driver")
    .row()
    .text("Mini App", "help:miniapp")
    .text("Частые вопросы", "help:faq")
    .row()
    .text("← Главное меню", "help:close");
}

function accessHelpMenu(): InlineKeyboard {
  return new InlineKeyboard().text("❓ Как подключиться", "help:connect");
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

function dateLabel(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("ru-KZ", { dateStyle: "short" }).format(new Date(value))
    : "дата не указана";
}

export function formatOwnerSummary(summary: OwnerSummary, currency: string): string {
  return [
    "📊 Сводка автопарка",
    "",
    `🚛 Активных рейсов: ${summary.activeTripCount}`,
    `🚚 Машин: ${summary.vehicleCount}`,
    `👥 Водителей: ${summary.driverCount}`,
    `🧾 Расходов на проверке: ${summary.pendingExpenseCount} · ${formatMoney(summary.pendingExpenseMinor, currency)}`,
    `⏰ Просроченных оплат: ${summary.overdueIncomeCount}`,
    "",
    `Выручка: ${formatMoney(summary.revenueMinor, currency)}`,
    `Утверждённые расходы: ${formatMoney(summary.expensesMinor, currency)}`,
    `Результат: ${formatMoney(summary.profitMinor, currency)}`,
  ].join("\n");
}

export function formatOwnerTrips(trips: OwnerTripSummary[]): string {
  if (!trips.length) return "🚛 Активных рейсов сейчас нет.";
  return ["🚛 Активные рейсы", "", ...trips.map((trip, index) =>
    `${index + 1}. ${trip.title}\n${trip.vehicleName} · ${trip.driverName ?? "водитель не назначен"} · ${dateLabel(trip.startedAt)}`,
  )].join("\n\n");
}

export function formatOwnerExpenses(expenses: OwnerExpenseSummary[]): string {
  if (!expenses.length) return "✅ Расходов на проверке нет.";
  return ["💳 Расходы на проверке", "", ...expenses.map((expense, index) =>
    `${index + 1}. ${expense.categoryName} — ${formatMoney(expense.amountMinor, expense.currency)}\n${expense.tripTitle ?? "без рейса"} · ${expense.driverName ?? "водитель не указан"} · ${dateLabel(expense.occurredAt)}`,
  )].join("\n\n");
}

function parsePositiveNumber(value: string): number | null {
  const number = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function resetFlow(context: DriverBotContext): void {
  context.session.expense = undefined;
  context.session.odometer = undefined;
  context.session.status = undefined;
  context.session.locationPromptMessageId = undefined;
}

export function normalizeLocationPoint(input: {
  latitude: number;
  longitude: number;
  horizontalAccuracyM?: number;
}): { latitude: number; longitude: number; horizontalAccuracyM: number | null } | null {
  const accuracy = input.horizontalAccuracyM ?? null;
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90
    || !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180
    || (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1500))) return null;
  return { latitude: input.latitude, longitude: input.longitude, horizontalAccuracyM: accuracy };
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

  bot.use(async (context, next) => {
    await next();
    const userId = telegramUserId(context);
    if (userId) await repository.syncTelegramUsername(userId, context.from?.username ?? null);
  });

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

  async function findOwner(context: DriverBotContext): Promise<OwnerIdentity | null> {
    const userId = telegramUserId(context);
    if (!userId) {
      await context.reply("Этот бот работает только в личном чате Telegram.");
      return null;
    }
    const owner = await repository.findOwnerByTelegramUserId(userId);
    if (!owner) {
      await context.reply("Режим владельца не подключён. Откройте кабинет и нажмите «Подключить мой Telegram».");
      return null;
    }
    return owner;
  }

  async function clearPreviousMenu(context: DriverBotContext): Promise<void> {
    const messageId = context.session.menuMessageId;
    const chatId = context.chat?.id;
    context.session.menuMessageId = undefined;
    if (!messageId || !chatId) return;
    try {
      await context.api.deleteMessage(chatId, messageId);
    } catch {
      // Menu cleanup is best-effort: Telegram may refuse old messages.
    }
  }

  async function replaceMenu(context: DriverBotContext, message: string, keyboard: InlineKeyboard): Promise<void> {
    await clearPreviousMenu(context);
    const sent = await context.reply(message, { reply_markup: keyboard });
    context.session.menuMessageId = sent.message_id;
  }

  async function findTrip(context: DriverBotContext, driver: DriverIdentity): Promise<ActiveTrip | null> {
    const trip = await repository.findActiveTrip(driver);
    if (!trip) await replaceMenu(context, "Сейчас нет активного рейса. Если это ошибка — сообщите диспетчеру.", driverMenu(context.session.ownerAvailable));
    return trip;
  }

  async function showDriverMenu(context: DriverBotContext, message = "Выберите действие водителя."): Promise<void> {
    const userId = telegramUserId(context);
    const ownerAvailable = userId ? Boolean(await repository.findOwnerByTelegramUserId(userId)) : false;
    context.session.mode = "DRIVER";
    context.session.ownerAvailable = ownerAvailable;
    context.session.driverAvailable = true;
    await replaceMenu(context, message, driverMenu(ownerAvailable));
  }

  async function showOwnerMenu(context: DriverBotContext, owner: OwnerIdentity, message?: string): Promise<void> {
    const userId = telegramUserId(context);
    const driverAvailable = userId ? Boolean(await repository.findDriverByTelegramUserId(userId)) : false;
    context.session.mode = "OWNER";
    context.session.ownerAvailable = true;
    context.session.driverAvailable = driverAvailable;
    await replaceMenu(
      context,
      message ?? `Кабинет владельца · ${owner.organizationName}\nВыберите, что посмотреть.`,
      ownerMenu(driverAvailable),
    );
  }

  async function showStaffMenu(context: DriverBotContext, staff: StaffIdentity, message?: string): Promise<void> {
    context.session.mode = undefined;
    await replaceMenu(
      context,
      message ?? `Рабочий кабинет · ${staff.organizationName}\nРоль: ${staff.roleName}`,
      staffMenu(),
    );
  }

  async function showRoleMenu(context: DriverBotContext, greeting?: string): Promise<void> {
    const userId = telegramUserId(context);
    if (!userId) {
      await context.reply("Откройте бота в личном чате Telegram.");
      return;
    }
    const [owner, driver, staff] = await Promise.all([
      repository.findOwnerByTelegramUserId(userId),
      repository.findDriverByTelegramUserId(userId),
      repository.findStaffByTelegramUserId(userId),
    ]);
    context.session.ownerAvailable = Boolean(owner);
    context.session.driverAvailable = Boolean(driver);
    if (context.session.mode === "DRIVER" && driver) {
      await showDriverMenu(context, greeting);
      return;
    }
    if (owner) {
      await showOwnerMenu(context, owner, greeting);
      return;
    }
    if (driver) {
      await showDriverMenu(context, greeting);
      return;
    }
    if (staff) {
      await showStaffMenu(context, staff, greeting);
      return;
    }
    await replaceMenu(
      context,
      "Доступ пока не привязан. Владельцу нужно подключить Telegram в личном кабинете, водителю — открыть персональную ссылку от владельца.",
      accessHelpMenu(),
    );
  }

  async function showCurrentMenu(context: DriverBotContext, message: string): Promise<void> {
    if (context.session.mode === "OWNER") {
      const owner = await findOwner(context);
      if (owner) {
        await showOwnerMenu(context, owner, message);
        return;
      }
    }
    const userId = telegramUserId(context);
    const driver = userId ? await repository.findDriverByTelegramUserId(userId) : null;
    if (driver) {
      await showDriverMenu(context, message);
      return;
    }
    const staff = userId ? await repository.findStaffByTelegramUserId(userId) : null;
    if (staff) {
      await showStaffMenu(context, staff, message);
      return;
    }
    await showRoleMenu(context, message);
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
        if (code.startsWith("owner_")) {
          const owner = await repository.claimOwnerInvitation(code, userId);
          await showOwnerMenu(context, owner, `Готово, ${owner.ownerName}. Кабинет владельца подключён к Telegram.`);
        } else if (code.startsWith("staff_")) {
          const staff = await repository.claimStaffInvitation(code, userId, context.from?.username ?? null);
          await showStaffMenu(context, staff, `Готово, ${staff.staffName}. Telegram подтверждён. Ваша роль: ${staff.roleName}.`);
        } else {
          const driver = await repository.claimInvitation(code, userId);
          const owner = await repository.findOwnerByTelegramUserId(userId);
          if (owner) {
            await showOwnerMenu(context, owner, `Готово, ${driver.driverName}. Доступны режимы владельца и водителя.`);
          } else {
            await showDriverMenu(context, `Готово, ${driver.driverName}. Аккаунт водителя привязан.`);
          }
        }
      } catch {
        await replaceMenu(context, "Не удалось использовать приглашение. Возможно, оно истекло, уже использовано другим аккаунтом или профиль уже связан. Создайте новую ссылку в кабинете.", accessHelpMenu());
      }
      return;
    }
    await showRoleMenu(context, "Здравствуйте. Выберите действие.");
  });

  bot.command("menu", async (context) => showRoleMenu(context));
  bot.command("help", async (context) => replaceMenu(context, "❓ Справка TruckProfit\nВыберите нужный раздел.", helpMenu()));
  bot.command("cancel", async (context) => {
    resetFlow(context);
    await showCurrentMenu(context, "Ввод отменён.");
  });
  bot.command("done", async (context) => {
    context.session.receipt = undefined;
    await showCurrentMenu(context, "Готово.");
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
    await showDriverMenu(context, `Плечо начато: ${odometerKm} км, ${loadState === "LOADED" ? "с грузом" : "порожняком"}.`);
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
    await showDriverMenu(context, `Плечо завершено: ${odometerKm} км.`);
  });

  bot.on("callback_query:data", async (context) => {
    const data = context.callbackQuery.data;
    await context.answerCallbackQuery();
    if (data === "flow:cancel") {
      resetFlow(context);
      await showCurrentMenu(context, "Ввод отменён.");
      return;
    }
    if (data === "receipt:done") {
      context.session.receipt = undefined;
      await showDriverMenu(context, "Готово.");
      return;
    }

    if (data === "help:main") {
      await replaceMenu(context, "❓ Справка TruckProfit\nВыберите нужный раздел.", helpMenu());
      return;
    }
    if (data === "help:owner") {
      await replaceMenu(context, [
        "👔 Инструкция владельцу",
        "",
        "1. Добавьте автомобиль и водителя в Mini App.",
        "2. Создайте рейс, маршрут и доход.",
        "3. Подключите свой Telegram в кабинете.",
        "4. В боте проверяйте сводку, рейсы и новые расходы.",
        "5. В Mini App принимайте расходы, закрывайте рейс и рассчитывайте P&L.",
      ].join("\n"), helpMenu());
      return;
    }
    if (data === "help:driver") {
      await replaceMenu(context, [
        "🚚 Инструкция водителю",
        "",
        "1. Откройте персональную ссылку владельца и нажмите START.",
        "2. Проверьте назначение в «Мой рейс».",
        "3. Передавайте расход, пробег и статус кнопками.",
        "4. В «📍 Геопозиция» нажмите «Отправить» и разрешите Telegram передать текущую точку.",
        "5. После расхода отправьте фото чека; предварительный расчёт смотрите в «Моя зарплата».",
      ].join("\n"), helpMenu());
      return;
    }
    if (data === "help:miniapp") {
      await replaceMenu(context, [
        "🌐 Как открыть Mini App",
        "",
        "Нажмите синюю кнопку «Открыть кабинет» возле поля ввода Telegram.",
        "При первом открытии войдите email и паролем владельца. Бот и Mini App работают с одной базой — переносить данные вручную не нужно.",
      ].join("\n"), helpMenu());
      return;
    }
    if (data === "help:faq") {
      await replaceMenu(context, [
        "Частые вопросы",
        "",
        "• Бот не видит профиль — создайте новую ссылку и нажмите START в нужном Telegram-аккаунте.",
        "• Владелец сам за рулём — включите «Я владелец-водитель», появится переключение режимов.",
        "• Ошибка в расходе — владелец отклоняет его, водитель вносит правильный.",
        "• Полная экономика — в Mini App; бот показывает быструю сводку.",
        "• Забыли пароль — на странице входа нажмите «Забыли пароль?».",
      ].join("\n"), helpMenu());
      return;
    }
    if (data === "help:connect") {
      await replaceMenu(context, "Владелец: войдите в Mini App и нажмите «Подключить мой Telegram».\n\nВодитель: попросите владельца создать персональную ссылку в разделе «Водители», откройте её и нажмите START.", accessHelpMenu());
      return;
    }
    if (data === "help:close") {
      await showRoleMenu(context);
      return;
    }

    if (data === "mode:owner") {
      resetFlow(context);
      const owner = await findOwner(context);
      if (owner) await showOwnerMenu(context, owner);
      return;
    }
    if (data === "mode:driver") {
      resetFlow(context);
      const driver = await findDriver(context);
      if (driver) await showDriverMenu(context, `Режим водителя · ${driver.driverName}`);
      return;
    }

    if (data.startsWith("owner:")) {
      const owner = await findOwner(context);
      if (!owner) return;
      context.session.mode = "OWNER";
      if (data === "owner:summary") {
        const summary = await repository.getOwnerSummary(owner);
        await replaceMenu(context, formatOwnerSummary(summary, owner.baseCurrency), ownerMenu(context.session.driverAvailable));
      } else if (data === "owner:trips") {
        const trips = await repository.listOwnerActiveTrips(owner);
        await replaceMenu(context, formatOwnerTrips(trips), ownerMenu(context.session.driverAvailable));
      } else if (data === "owner:drivers") {
        const drivers = await repository.listOwnerDrivers(owner);
        const message = drivers.length
          ? ["👥 Водители", "", ...drivers.map((item, index) => `${index + 1}. ${item.displayName} · ${item.status === "ACTIVE" ? "активен" : item.status} · ${item.telegramLinked ? "Telegram ✓" : "Telegram не подключён"}`)].join("\n")
          : "Водителей пока нет.";
        await replaceMenu(context, message, ownerMenu(context.session.driverAvailable));
      } else if (data === "owner:expenses") {
        const expenses = await repository.listOwnerPendingExpenses(owner);
        await replaceMenu(context, formatOwnerExpenses(expenses), ownerMenu(context.session.driverAvailable));
      }
      return;
    }

    const driver = await findDriver(context);
    if (!driver) return;

    if (data === "menu:trip") {
      const trip = await findTrip(context, driver);
      if (trip) await replaceMenu(context, `Ваш активный рейс: ${trip.title}`, driverMenu(context.session.ownerAvailable));
      return;
    }

    if (data === "menu:expense") {
      const trip = await findTrip(context, driver);
      if (!trip) return;
      const started = beginExpenseWizard(trip.id, trip.currency);
      context.session.expense = { state: started.state, trip };
      await replaceMenu(context, started.prompt, categoriesMenu());
      return;
    }

    if (data.startsWith("expense:category:")) {
      const pending = context.session.expense;
      const category = data.replace("expense:category:", "");
      if (!pending) {
        await showDriverMenu(context, "Срок ввода расхода истёк. Начните заново.");
        return;
      }
      const result = advanceExpenseWizard(pending.state, category);
      context.session.expense = { ...pending, state: result.state };
      await clearPreviousMenu(context);
      await context.reply(result.prompt);
      return;
    }

    if (data === "expense:confirm") {
      const pending = context.session.expense;
      if (!pending || pending.state.step !== "CONFIRM") {
        await showDriverMenu(context, "Нет расхода для подтверждения. Начните заново.");
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
      await replaceMenu(context, "Расход записан. Пришлите фото чека, если оно есть, или нажмите «Готово».", new InlineKeyboard().text("Готово", "receipt:done"));
      return;
    }

    if (data === "menu:odometer") {
      const trip = await findTrip(context, driver);
      if (!trip) return;
      context.session.odometer = { trip };
      await clearPreviousMenu(context);
      await context.reply("Укажите текущий одометр в километрах.");
      return;
    }

    if (data === "menu:status") {
      const trip = await findTrip(context, driver);
      if (!trip) return;
      context.session.status = undefined;
      await replaceMenu(context, "Выберите статус движения.", statusesMenu());
      return;
    }

    if (data === "menu:location") {
      const trip = await findTrip(context, driver);
      if (!trip) return;
      resetFlow(context);
      await clearPreviousMenu(context);
      const sent = await context.reply(
        `Передача геопозиции для рейса «${trip.title}». Нажмите кнопку ниже и разрешите Telegram отправить текущие координаты.`,
        { reply_markup: new Keyboard().requestLocation("📍 Отправить геопозицию").resized().oneTime() },
      );
      context.session.locationPromptMessageId = sent.message_id;
      return;
    }

    if (data.startsWith("status:")) {
      const definition = statusDefinitions[data.replace("status:", "")];
      const trip = await findTrip(context, driver);
      if (!definition || !trip) return;
      context.session.status = { trip, statusCode: definition.statusCode, loadState: definition.loadState };
      await clearPreviousMenu(context);
      await context.reply(`Статус «${definition.title}». Напишите локацию или отправьте «-», если локацию указывать не нужно.`);
      return;
    }

    if (data === "menu:pay") {
      const trip = await findTrip(context, driver);
      if (!trip) return;
      const pay = await repository.findPreliminaryCompensation(driver, trip.id);
      if (!pay) {
        await showDriverMenu(context, "Предварительная зарплата по текущему рейсу ещё не рассчитана.");
        return;
      }
      const label = pay.status === "APPROVED" ? "Подтверждено" : "Предварительно";
      await showDriverMenu(context, `${label}: ${formatMoney(pay.amountMinor, pay.currency)}. Финальная сумма подтверждается диспетчером.`);
    }
  });

  bot.on("message:text", async (context) => {
    const text = context.message.text.trim();
    if (text.startsWith("/")) return;
    if (context.session.mode === "OWNER") {
      await showCurrentMenu(context, "Для действий используйте кнопки меню. Справка доступна в разделе «❓ Помощь».");
      return;
    }
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
      await showDriverMenu(context, "Статус сохранён.");
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
      await showDriverMenu(context, "Пробег сохранён.");
      return;
    }

    const pending = context.session.expense;
    if (!pending) {
      await showDriverMenu(context);
      return;
    }

    if (pending.state.step === "CONFIRM" && text.toUpperCase() === "CONFIRM") {
      await replaceMenu(context, "Подтвердите запись кнопкой ниже.", new InlineKeyboard().text("Сохранить расход", "expense:confirm"));
      return;
    }

    const result = advanceExpenseWizard(pending.state, text);
    context.session.expense = { ...pending, state: result.state };
    if (result.kind === "CONFIRM") {
      const draft = result.state.draft;
      await replaceMenu(
        context,
        `${result.prompt}\nКатегория: ${categoryLabels[draft.categoryCode ?? ""] ?? draft.categoryCode}.`,
        new InlineKeyboard().text("Сохранить расход", "expense:confirm").text("Отменить", "flow:cancel"),
      );
      return;
    }
    await context.reply(result.prompt);
  });

  bot.on("message:location", async (context) => {
    if (context.session.mode === "OWNER") {
      await showCurrentMenu(context, "Переключитесь в режим водителя, чтобы передать геопозицию рейса.");
      return;
    }
    const driver = await findDriver(context);
    if (!driver) return;
    const trip = await findTrip(context, driver);
    if (!trip) return;
    const location = normalizeLocationPoint({
      latitude: context.message.location.latitude,
      longitude: context.message.location.longitude,
      horizontalAccuracyM: context.message.location.horizontal_accuracy,
    });
    if (!location) {
      await showDriverMenu(context, "Telegram передал некорректные координаты. Попробуйте ещё раз.");
      return;
    }
    await repository.recordLocation({
      organizationId: trip.organizationId,
      driverId: trip.driverId,
      tripId: trip.id,
      ...location,
      occurredAt: new Date(context.message.date * 1000),
      telegramMessageId: context.message.message_id,
    });
    const promptMessageId = context.session.locationPromptMessageId;
    context.session.locationPromptMessageId = undefined;
    if (promptMessageId && context.chat?.id) {
      try {
        await context.api.deleteMessage(context.chat.id, promptMessageId);
      } catch {
        // Cleanup is best-effort; the saved point is not affected.
      }
    }
    const accuracyText = location.horizontalAccuracyM === null
      ? "точность не указана"
      : `точность около ${Math.round(location.horizontalAccuracyM)} м`;
    await showDriverMenu(context, `📍 Геопозиция сохранена для рейса «${trip.title}» (${accuracyText}).`);
  });

  bot.on("message:photo", async (context) => {
    const receipt = context.session.receipt;
    if (!receipt) {
      await showCurrentMenu(context, "Сначала добавьте расход, затем приложите к нему фото чека.");
      return;
    }
    const driver = await findDriver(context);
    if (!driver || driver.driverId !== receipt.driverId || driver.organizationId !== receipt.organizationId) {
      await showDriverMenu(context, "Не удалось подтвердить, кому принадлежит расход. Добавьте расход заново.");
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
    await showDriverMenu(context, "Фото чека прикреплено.");
  });

  bot.catch(async (error) => {
    console.error("Telegram bot handler failed");
    if (error.ctx.chat) await error.ctx.reply("Не удалось обработать действие. Попробуйте ещё раз или сообщите диспетчеру.");
  });

  return bot;
}
