const forbiddenPatterns = [
  /(?<![\p{L}\p{N}_])погод\w*/iu,
  /(?<![\p{L}\p{N}_])новост\w*/iu,
  /(?<![\p{L}\p{N}_])политик\w*/iu,
  /(?<![\p{L}\p{N}_])президент\w*/iu,
  /(?<![\p{L}\p{N}_])футбол\w*/iu,
  /(?<![\p{L}\p{N}_])спорт\w*/iu,
  /(?<![\p{L}\p{N}_])рецепт\w*/iu,
  /(?<![\p{L}\p{N}_])фильм\w*/iu,
  /(?<![\p{L}\p{N}_])сериал\w*/iu,
  /(?<![\p{L}\p{N}_])гороскоп\w*/iu,
  /(?<![\p{L}\p{N}_])биткоин\w*/iu,
  /(?<![\p{L}\p{N}_])криптовалют\w*/iu,
  /(?<![\p{L}\p{N}_])игнорир\w*\s+(?:все\s+)?инструкц\w*/iu,
  /\b(?:system|developer)\s+prompt\b/iu,
  /(?<![\p{L}\p{N}_])системн\w*\s+(?:промпт|инструкц)\w*/iu,
  /(?<![\p{L}\p{N}_])раскрой\w*\s+(?:промпт|инструкц)\w*/iu,
];

const fleetPatterns = [
  /(?<![\p{L}\p{N}_])рейс\w*/iu,
  /(?<![\p{L}\p{N}_])поезд\w*/iu,
  /(?<![\p{L}\p{N}_])маршрут\w*/iu,
  /(?<![\p{L}\p{N}_])груз\w*/iu,
  /(?<![\p{L}\p{N}_])машин\w*/iu,
  /(?<![\p{L}\p{N}_])авто(?:мобил|парк|транспорт)\w*/iu,
  /(?<![\p{L}\p{N}_])транспорт\w*/iu,
  /(?<![\p{L}\p{N}_])водител\w*/iu,
  /(?<![\p{L}\p{N}_])топлив\w*/iu,
  /(?<![\p{L}\p{N}_])бензин\w*/iu,
  /(?<![\p{L}\p{N}_])дизел\w*/iu,
  /(?<![\p{L}\p{N}_])расход\w*/iu,
  /(?<![\p{L}\p{N}_])затрат\w*/iu,
  /(?<![\p{L}\p{N}_])доход\w*/iu,
  /(?<![\p{L}\p{N}_])выруч\w*/iu,
  /(?<![\p{L}\p{N}_])прибыл\w*/iu,
  /(?<![\p{L}\p{N}_])марж\w*/iu,
  /(?<![\p{L}\p{N}_])себестоим\w*/iu,
  /(?<![\p{L}\p{N}_])пробег\w*/iu,
  /(?<![\p{L}\p{N}_])километр\w*/iu,
  /(?<![\p{L}\p{N}_])ремонт\w*/iu,
  /(?<![\p{L}\p{N}_])штраф\w*/iu,
  /(?<![\p{L}\p{N}_])оплат\w*/iu,
  /(?<![\p{L}\p{N}_])заработ\w*/iu,
  /(?<![\p{L}\p{N}_])потрат\w*/iu,
  /(?<![\p{L}\p{N}_])рентабель\w*/iu,
  /(?<![\p{L}\p{N}_])экономик\w*/iu,
  /(?<![\p{L}\p{N}_])отч[её]т\w*/iu,
  /(?<![\p{L}\p{N}_])показател\w*/iu,
  /(?<![\p{L}\p{N}_])клиент\w*/iu,
  /(?<![\p{L}\p{N}_])заказчик\w*/iu,
  /(?<![\p{L}\p{N}_])валют\w*/iu,
  /(?<![\p{L}\p{N}_])курс\w*/iu,
  /(?<![\p{L}\p{N}_])статус\w*/iu,
  /(?<![\p{L}\p{N}_])чек\w*/iu,
  /(?<![\p{L}\p{N}_])сотрудник\w*/iu,
  /(?<![\p{L}\p{N}_])рол(?:ь|и|ей|ям)\w*/iu,
  /(?<![\p{L}\p{N}_])прав(?:о|а|ами)\w*/iu,
  /(?<![\p{L}\p{N}_])telegram\b/iu,
  /(?<![\p{L}\p{N}_])телеграм\w*/iu,
  /(?<![\p{L}\p{N}_])бот\w*/iu,
  /(?<![\p{L}\p{N}_])кабинет\w*/iu,
  /(?<![\p{L}\p{N}_])раздел\w*/iu,
  /\btruckprofit\b/iu,
];

export type AiChatScopeResult = "IN_SCOPE" | "OUT_OF_SCOPE";

export function classifyAiChatScope(message: string, hasConversationContext = false): AiChatScopeResult {
  const normalized = message.trim();
  if (!normalized || forbiddenPatterns.some((pattern) => pattern.test(normalized))) return "OUT_OF_SCOPE";
  if (fleetPatterns.some((pattern) => pattern.test(normalized))) return "IN_SCOPE";

  // Short follow-ups such as “а почему?” are useful only after an established
  // TruckProfit conversation. The model still receives no tools or outside data.
  if (hasConversationContext && normalized.length <= 160) return "IN_SCOPE";
  return "OUT_OF_SCOPE";
}

export const aiChatOutOfScopeAnswer = "Я отвечаю только по данным TruckProfit: рейсам, автомобилям, водителям, доходам, расходам и управленческим отчётам компании.";
