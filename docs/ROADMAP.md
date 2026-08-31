# Дорожная карта MVP

## Этап 0 — продуктовая фиксация

**Результат:** документы из `docs/`, согласованные KPI и пилотные сценарии KAZ-TIR/Joldas.

**Выход:** подтверждены границы MVP; не начинается Telegram, Supabase или импорт production-данных.

## Этап 1 — фундамент данных

- Next.js/TypeScript monorepo;
- Supabase project, migrations, RLS, Auth;
- multi-tenant organizations и roles;
- entities Vehicle, Driver, Trailer, Trip, TripLeg;
- audit middleware и soft-delete;
- demo seed `Demo Transport`.

**Выход:** изолированные tenant-ы, demo данные, migrations применяются с нуля.

## Этап 2 — управленческие факты и расчёт

- Expenses, Income, Odometer, Status, Attachments;
- категории Fuel/Toll/Repair/etc.;
- базовый TaxProfile;
- salary rules и calculation;
- P&L и KPI машины/рейса как тестируемые domain functions.

**Выход:** сценарий в API без Telegram и UI считает эталонный рейс.

## Этап 3 — web owner dashboard

- dashboard за период;
- справочники машин и водителей;
- рейс/плечи, расходы, доходы;
- review и audit timeline;
- calculator «брать груз или нет» на базе вводимой ставки и истории машины.

**Выход:** собственник проводит пилотный рейс с ноутбука.

## Этап 4 — Telegram водителя

- invitation/Telegram binding;
- wizard расходов и топлива;
- одометр, loaded/empty, статус;
- фото чека в Storage;
- просмотр предварительной зарплаты;
- idempotency/update log/error handling.

**Выход:** водитель проходит реальный рейс без Excel и без отдельного приложения.

## Этап 5 — пилот и только затем интеграции

- сверка 1–3 реальных рейсов с KAZ-TIR/Joldas;
- обработка расхождений в формулах;
- ограниченный импорт подтверждённых справочников;
- при необходимости n8n для уведомлений/пакетного импорта;
- решение об OCR, voice, GPS на данных пилота.

## Принцип релиза

После каждого этапа: миграции с нуля, TypeScript check, lint, tests, seed, ручной сценарий. Production Telegram и импорты данных включаются только после acceptance пилота.

