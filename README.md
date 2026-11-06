# Case Simulator → Telegram Mini App

Реплика **1:1** мобильного Android-приложения «Case Simulator» (`com.cs2casesim.cs2_case_sim`, v1.1.5, Flutter) в виде Telegram Mini App с реальным онлайном и платежами в Telegram Stars.

> **Текущий статус:** stage 1 — монорепо, SQL-схема/RLS/RPC, бот и SPA-шелл реализованы (ADR-006).
> **Q-01…Q-03 не закрыты:** без `BOT_TOKEN`, доменов/доступов и юридического заключения по R-01 недоступны реальный логин, платежи XTR, деплой и релиз. Локально приложение работает в demo-режиме на in-memory БД (`/health` → `production_ready: false`).
> **Начните с [`AGENTS.md`](AGENTS.md)** (правила для агентов/разработчиков) и **[`docs/00-ТЗ.md`](docs/00-ТЗ.md)** (главный контракт).

## Кратко

| | |
|---|---|
| Платформа | Telegram Mini App (iOS / Android / Desktop / Web) |
| Фронтенд | Vite + React + TypeScript + Tailwind (статический SPA) |
| Бэкенд | Node.js + Hono + grammY на **Railway** |
| БД | **Supabase**: Postgres, RLS, RPC, Realtime, Storage, pg_cron |
| Платежи | **Telegram Stars (`XTR`)** — косметика и бусты, без продажи валюты |
| Онлайн | Реальный PvP, чат, друзья, подарки, рефералы. **Ботов нет** |
| Контент | 241 кейс, ~15 000 предметов, 22 мини-игры, 62 звука, ассеты 1:1 |
| Экономика | Фиксированный снимок цен от 05.11.2026 |

## Навигация

- [`AGENTS.md`](AGENTS.md) — карта документации и обязательные правила (≤200 строк)
- [`docs/00-ТЗ.md`](docs/00-ТЗ.md) — **ТЗ**: требования, архитектура, БД, безопасность, Stars, тесты, этапы, вопросы
- [`docs/01-reverse-engineering.md`](docs/01-reverse-engineering.md) — разбор видео, APK и живого API
- [`docs/02-ui-map.md`](docs/02-ui-map.md) — карта экранов с таймкодами
- [`docs/03-design-system.md`](docs/03-design-system.md) — оформление 1:1
- [`docs/04-architecture.md`](docs/04-architecture.md) — стек и структура монорепо
- [`docs/12-bugs-and-fixes.md`](docs/12-bugs-and-fixes.md) — реестр багов и исправлений
- [`docs/13-changelog.md`](docs/13-changelog.md) — журнал изменений
- [`docs/14-open-questions.md`](docs/14-open-questions.md) — решения и вопросы заказчику
- [`docs/reference/`](docs/reference/) — снимки данных и эталонные кадры

## Быстрый старт

```bash
pnpm install
pnpm --filter @case-sim/bot dev     # http://127.0.0.1:3000  (/health, REST v1)
pnpm --filter @case-sim/web dev     # http://127.0.0.1:5173  (браузерный preview)
```

Без переменных окружения бот стартует на in-memory адаптере, а SPA — в read-only demo-режиме:
денежные операции и XTR-инвойсы в браузере недоступны. Полный цикл:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm docs:lint && pnpm build
pnpm db:seed:generate               # supabase/seed-data.sql из docs/reference/ (D-04)
supabase start && supabase db reset && supabase test db
```

## Структура

```
apps/web/        Vite + React SPA (TMA-шелл, 5 табов, каталог, открытие кейса)
apps/bot/        Hono REST v1 + grammY, initData/JWT, Stars webhook, /health
packages/shared/ Zod-контракты, константы, provably-fair, XTR-SKU, i18n
packages/db/     SQL-миграции, RLS, SECURITY DEFINER RPC, pgTAP
supabase/        config.toml, seed.sql, tests/
infra/           Railway, Cloudflare, мониторинг, скрипты проверок
docs/            ВСЯ документация и неизменяемые снимки reference/
```

## Исходные эталоны

`IMG_4385.MP4` (демонстрация, 09:59) и `Симулятор Кейсов.apks` лежат в корне рабочей папки и **не коммитятся в репозиторий**. Все извлечённые из них данные сохранены в `docs/reference/`, чтобы не повторять разбор.

## Важно

Продукт — **симулятор для лиц 18+**. Реальные деньги не используются, виртуальные предметы не выводятся, не обмениваются и не имеют денежной стоимости. Это не азартная игра. Использование изображений и наименований CS2 (решение D-03) требует юридической проверки до релиза — см. риск R-01 в ТЗ.

## Лицензия

Документация и код проекта — собственность владельца. Шрифты Orbitron / Rajdhani и ассеты CS2 распространяются по своим лицензиям; атрибуция — в `NOTICES` и [`docs/03-design-system.md`](docs/03-design-system.md).
