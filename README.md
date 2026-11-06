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

## Запуск и настройка

### Требования

| Что | Зачем | Минимум для локального demo |
|---|---|---|
| Node.js ≥ 22 + pnpm 10.34.9 | сборка и запуск | **да** (`npm i -g pnpm@10.34.9`) |
| Docker + Supabase CLI | локальная БД, миграции, pgTAP | нет (есть in-memory адаптер) |
| Telegram-бот от @BotFather | auth, XTR, webhook | нет (Q-01) |
| Аккаунты Supabase / Railway / Cloudflare / GitHub | деплой | нет (Q-02) |

### Шаг 1 · Локальный demo без ключей (2 минуты)

```bash
node -v                             # должно быть >= 22
npm install -g pnpm@10.34.9         # один раз, глобально
pnpm -v                             # 10.34.9
pnpm install
pnpm --filter @case-sim/bot dev     # http://127.0.0.1:3000
pnpm --filter @case-sim/web dev     # http://127.0.0.1:5173
```

> ⚠️ **Windows / PowerShell:** начиная с **Node.js 25** Corepack больше не входит в поставку, поэтому `corepack enable` и `pnpm` не находятся. Ставьте pnpm через npm, как выше, и **перезапустите терминал** после установки. На Node 22 LTS альтернатива — `corepack enable pnpm`. `.nvmrc` проекта = `22`, но сборка и тесты проверены и на Node 26.
> Если PowerShell ругается на `pnpm.ps1` (Execution Policy), используйте `pnpm.cmd install` или `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

Откройте `http://localhost:5173`. Vite проксирует `/v1` на бот, поэтому **`VITE_API_BASE_URL` в dev задавать нельзя**.
Работает: 5 табов, каталог, 22 игры, 18+ дисклеймер, оффлайн-баннер, `/health`, `/v1/time`.
Не работает (нужен Telegram): логин, открытие кейсов, инвентарь, XTR-инвойсы. `/health` вернёт `production_ready: false`.

### Шаг 2 · Переменные окружения

```bash
cp .env.example .env                # корневой .env НЕ коммитится
cp apps/web/.env.example apps/web/.env   # только для production-сборки, в dev не нужен
```

Бот в dev сам подхватывает корневой `.env` (`--env-file-if-exists`); уже заданные в shell/Railway переменные имеют приоритет.

| Переменная | Где взять |
|---|---|
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | @BotFather → `/newbot` (Q-01) |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `TELEGRAM_WEBHOOK_URL` | `https://api.<domain>/telegram/webhook` — **путь обязателен** |
| `TELEGRAM_USE_TEST_ENV` | `true` → Bot API `/test/…` и тестовые звёзды |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API |
| `SUPABASE_JWT_JWK` | `supabase gen signing-key --algorithm ES256` → приватный JWK **одной строкой JSON** |
| `DATABASE_URL`, `DATABASE_DIRECT_URL` | Supabase → Connect (pooler 6543 / direct 5432) |
| `PORT`, `INIT_DATA_TTL_SECONDS`, `PRICE_SNAPSHOT_ID` | по умолчанию 3000 / 3600 / `2026-11-05-skinport` |
| `VITE_*` | **только build-time**: `apps/web/.env` или env Cloudflare Pages; в JS-бандл секреты класть нельзя |

### Шаг 3 · Supabase (локальная БД)

```bash
pnpm dlx supabase start              # нужен Docker
pnpm db:seed:generate                # 14 945 предметов, 241 кейс, 46 флагов из docs/reference/
pnpm dlx supabase db reset           # 11 миграций + supabase/seed.sql + seed-data.sql
pnpm dlx supabase test db            # pgTAP: RLS и идемпотентность
pnpm --filter @case-sim/db types     # сгенерировать packages/db/src/database.types.ts
```

Пути миграций и сида заданы в `supabase/config.toml`. Сгенерированный `supabase/seed-data.sql` (~4.9 MB) в git не коммитится.

### Шаг 4 · Telegram-бот (@BotFather)

1. `/newbot` → токен в `.env`. Включите 2FA на своём аккаунте Telegram.
2. `/setcommands` — вставьте:
   ```
   start - Открыть симулятор
   terms - Оферта, 18+ и дисклеймер
   support - Поддержка
   paysupport - Платежи и возвраты
   help - Как играть и проверить честность раунда
   ```
3. `/newapp` → создайте Main Mini App, укажите **HTTPS**-URL `https://app.<domain>` (Q-02); включите платежи Stars.
4. Установите вебхук и проверьте его:
   ```bash
   pnpm bot:webhook:set
   pnpm bot:webhook:info      # url, pending_update_count, last_error_message
   ```
   Скрипт читает `.env`, передаёт `secret_token` и `allowed_updates`; при `TELEGRAM_USE_TEST_ENV=true` работает через `/test/`. Токен в лог не выводится. Для локальной отладки вебхук снимается командой `pnpm bot:webhook:delete`.

### Шаг 5 · Деплой

**Railway** (бот/API): Dockerfile — `infra/railway/Dockerfile`, region `europe-west4-drams3a`, healthcheck `GET /health`, слушатель `0.0.0.0:$PORT`. Все серверные переменные из шага 2 задайте в Service Variables; `VITE_*` и `.env` туда не копируйте.

**Cloudflare Pages** (SPA): build `pnpm install --frozen-lockfile && pnpm --filter @case-sim/web build`, output `apps/web/dist`. Задайте build-time `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_CDN_BASE_URL`. Перед сборкой `copy-headers.mjs` автоматически кладёт `infra/cloudflare/_headers` в `public/` → `dist/_headers`; **замените в нём плейсхолдеры** `api.example.com`, `*.supabase.co`, `*.fly.dev` на реальные origin-ы (Q-16).

Порядок: CI → `supabase db push` (pre-deploy) → Railway → Cloudflare Pages → smoke-тесты. `deploy.yml` без секретов деплой пропускает.

### Шаг 6 · Проверка

```bash
pnpm setup:check                     # lint + typecheck + test + docs:lint + build
pnpm docs:lint                       # ссылки, AGENTS.md ≤200 строк, отсутствие секретов
curl https://api.<domain>/health     # ожидается production_ready: true
pnpm bot:webhook:info                # last_error_message: нет
```

Затем откройте Mini App из бота: `/v1/auth/telegram` должен вернуть `access_token`, а `/terms`, `/support`, `/paysupport` — ответить. Только после этого тестируйте XTR-инвойс и возврат в test-окружении.

### Частые проблемы

| Симптом | Причина |
|---|---|
| `pnpm` / `corepack` «не распознано как имя командлета» | Node.js 25+ без Corepack и без глобального pnpm → `npm i -g pnpm@10.34.9`, затем перезапустить терминал |
| Каталог пуст в браузере | бот не запущен на `:3000` или в dev задан `VITE_API_BASE_URL` |
| `production_ready: false` | не хватает `BOT_TOKEN` / webhook secret / Supabase URL+key / JWK (Q-01, Q-02) |
| `401 INVALID_INIT_DATA` | открыто из обычного браузера, а не из Telegram; либо истёк TTL 3600 с |
| `INSUFFICIENT_BALANCE` | стартовый баланс $10 (interim Q-07), цена кейса выше |
| Ошибка `supabase db reset` | забыли `pnpm db:seed:generate` (нет `seed-data.sql`) |
| `Math.random` в логах линтера | игровая логика должна быть серверной, см. `docs/07-security.md` |

До релиза остаются открытыми Q-01…Q-16 и BUG-001…012 — см. [`docs/14-open-questions.md`](docs/14-open-questions.md) и [`docs/12-bugs-and-fixes.md`](docs/12-bugs-and-fixes.md).

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
