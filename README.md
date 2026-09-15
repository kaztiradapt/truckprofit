# TruckProfit

MVP SaaS для собственников автопарков из 1–20 грузовых машин. Цель — показывать реальную экономику рейса, машины и направления, а не заменять бухгалтерию или CRM.

## Текущий срез

Готово:

- продуктовые документы и Mermaid-схема архитектуры;
- Supabase-миграции: multi-tenant модель, RLS, audit, private receipts, Telegram invite/update state;
- domain-расчёты P&L, топлива, порожнего пробега и оплаты водителю с unit-тестами;
- P0-интеграция TruckProfit: review расходов, фактическое закрытие плеч, immutable P&L snapshots и webhook Telegram;
- web-кабинет собственника: регистрация, защищённый tenant, машины, водители, активные рейсы и доход;
- Telegram flow водителя: приглашение, рейс, расход, чек, пробег, статус и предварительная зарплата.

В проект Supabase `fleet-economics` применены миграции `00001`–`00004`. Миграция `00005_trip_pnl_snapshots.sql` подготовлена для включения P0 calculation/review-контура и должна быть применена до первого реального рейса. `KAZ-TIR_Операционная` и `2026 Joldas Logist` используются только как пилотные источники для сверки полей и формул.

Тестовый production-кабинет: [fleet-economics.vercel.app](https://fleet-economics.vercel.app).

## Документы

- [Продукт](docs/PRODUCT.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Безопасность](docs/SECURITY.md)
- [Модель данных](docs/DATABASE.md)
- [Границы MVP](docs/MVP_SCOPE.md)
- [Дорожная карта](docs/ROADMAP.md)
- [Принятые решения](docs/DECISIONS.md)
- [Карта пилотных данных](docs/PILOT_DATA_MAPPING.md)
- [Развертывание и следующий шаг](docs/DEPLOYMENT.md)
- [Проверка первого рейса](docs/P0_ACCEPTANCE.md)
