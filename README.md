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
pnpm env:check                      # что заполнено, что ещё плейсхолдер (значения маскируются)
```

Бот в dev сам подхватывает корневой `.env` (`--env-file-if-exists`); уже заданные в shell/Railway переменные имеют приоритет.

> 🔴 **Безопасность:** токен бота — такой же секрет, как пароль. Не вставляйте его в `.env.example`, коммиты, чат или скриншот. Если токен уже где-то засветился — **@BotFather → `/revoke`**, он перевыпустит токен; старый перестанет работать. `.env.example` намеренно содержит только **пустые** значения: плейсхолдеры вида `<project-ref>` / `sb_secret_...` бот теперь тоже отвергает, а `env:check` и `deploy:check` их подсвечивают.

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

#### Что именно вписать в каждое поле

| Поле | Конкретное значение / команда |
|---|---|
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/newbot`, строка вида `123456789:AA…`. **Только сервер.** |
| `TELEGRAM_BOT_USERNAME` | имя бота **без `@`**, например `case_simulator_hytthynn_bot` |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 32`; в PowerShell: `[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()` |
| `TELEGRAM_WEBHOOK_URL` | после создания сервиса Railway: **Settings → Networking → Generate Domain** → `https://<service>.up.railway.app/telegram/webhook`. Со своим доменом: `https://api.<domain>/telegram/webhook`. Путь обязателен, только HTTPS |
| `TELEGRAM_USE_TEST_ENV` | `false` для прода; `true` → Bot API `/test/…` и тестовые звёзды (ставить вебхук тоже через `pnpm bot:webhook:set`) |
| `SUPABASE_URL` | Dashboard → Project Settings → API → **Project URL**: `https://<ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | там же → **Publishable key** (`sb_publishable_…`), можно отдавать клиенту |
| `SUPABASE_SECRET_KEY` | там же → **Secret key** (`sb_secret_…`), только Railway Secrets, обходит RLS |
| `SUPABASE_JWT_JWK` | см. ниже — это самый часто пропускаемый шаг |
| `DATABASE_URL` | Dashboard → Connect → **Transaction pooler** (`…:6543/postgres?pgbouncer=true`) — для сида каталога |
| `DATABASE_DIRECT_URL` | Dashboard → Connect → **Direct connection** (`…:5432/postgres`) |
| `VITE_*` | **не** в корневой `.env`; в `apps/web/.env` или build-time env Cloudflare Pages |

**`SUPABASE_JWT_JWK` — три шага, иначе RLS не примет JWT:**

```bash
pnpm dlx supabase gen signing-key --algorithm ES256
```

1. Команда вернёт приватный JWK с полями `kty`, `kid`, `d`, `crv: "P-256"`, `x`, `y`. **Сразу сохраните его**: из Supabase приватный ключ извлечь нельзя.
2. Supabase Dashboard → **Project Settings → JWT Signing Keys → Create standby key** → вставьте этот JWK (тот же `kid`).
3. Нажмите **Rotate key**, чтобы ключ стал активным. Без импорта и ротации Supabase не доверит JWT, подписанный вашим ботом.
4. В `.env`/секреты положите JWK **одной строкой JSON**; `deploy:check` проверит наличие `kid` и `d`.

Проверить результат: `pnpm env:check` (локально, маскирует значения, показывает и `apps/web/.env`) и `pnpm deploy:check` (перед деплоем).

#### `apps/web/.env` — фронтенд, build-time

**В локальном dev оставьте файл полностью закомментированным** — это правильно: `vite.config.ts` проксирует `/v1` и `/health` на `http://127.0.0.1:3000`. Если раскомментировать `VITE_API_BASE_URL`, прокси обойдётся и каталог станет пустым.

Для production раскомментируйте (или, что надёжнее, задайте как **build-time env в Cloudflare Pages** — `apps/web/.env` в `.gitignore` и до CI не доедет):

| Поле | Значение | Зачем |
|---|---|---|
| `VITE_API_BASE_URL` | `https://api.<domain>` или `https://<service>.up.railway.app` — **БЕЗ `/v1`** | клиент сам добавляет `/v1` |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | origin для CSP `connect-src` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (**не** `sb_secret_…`) | публичный ключ; сейчас зарезервирован |
| `VITE_CDN_BASE_URL` | `https://<cdn>` — **БЕЗ `/catalog`** | пути в БД уже содержат `catalog/…`; без переменной будут заглушки ◈ |
| `VITE_MINIAPP_VERSION`, `VITE_DEFAULT_LOCALE` | `0.2.0`, `ru` | резерв под этап 2, кодом пока не читаются |

`VITE_*` попадают в **публичный JS-бандл**: секреты (`BOT_TOKEN`, `sb_secret_…`, JWK, `DATABASE_URL`) сюда класть нельзя. CSP при сборке подставляется из этих же переменных, поэтому задавать их нужно именно **на этапе сборки**, а не в рантайме Railway.

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

**Сначала — preflight.** Он честно скажет, чего не хватает, и не даст задеплоить пустую конфигурацию:

```bash
pnpm deploy:check
```

| Куда | Что задать |
|---|---|
| GitHub **Secrets** | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_JWK`, `DATABASE_URL`, `CLOUDFLARE_API_TOKEN` |
| GitHub **Variables** | `HEALTHCHECK_URL`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_USE_TEST_ENV`, `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_*`, `CLOUDFLARE_ACCOUNT_ID` |
| Railway Service Variables | **все серверные** переменные из шага 2; `PORT` инжектится сам. `VITE_*` и `.env` не копировать |
| Cloudflare Pages (build env) | `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_CDN_BASE_URL` |

**Railway** (бот/API): подключите репозиторий, укажите `infra/railway/Dockerfile`, регион `europe-west4-drams3a`, healthcheck `GET /health`, `Wait for CI`. `.dockerignore` не даёт утащить в контекст MP4/APKS/`node_modules`.

**Cloudflare Pages** (SPA): build `pnpm install --frozen-lockfile && pnpm --filter @case-sim/web build`, output `apps/web/dist` (задано в `wrangler.toml`). CSP редактировать вручную **не нужно**: `copy-headers.mjs` подставляет `{{API_ORIGIN}}`/`{{SUPABASE_ORIGIN}}`/`{{CDN_ORIGIN}}` из `VITE_*` и кладёт `_headers` в `dist/`; в деплойной сборке `build:deploy` незакрытые токены = ошибка.

**Порядок первого деплоя:**
1. Создать Supabase project (Pro, EU), `supabase gen signing-key --algorithm ES256` → JWK с `kid` в секреты.
2. В BotFather задать команды и Main Mini App на `https://app.<domain>`, включить Stars/2FA.
3. Запустить `deploy.yml` → **Actions → Run workflow → `seed_catalog=true`**. Это важно: `supabase db push` применяет только миграции, а каталог (14 945 предметов, 241 кейс, SKU, флаги) грузится отдельным шагом `psql -f supabase/seed.sql`. Повторять не обязательно.
4. Workflow: `deploy:check` → CI-гейт → миграции → сид → сборка SPA → Pages → ожидание `production_ready: true` от Railway → `bot:webhook:set` → smoke.
5. Проверить `pnpm bot:webhook:info` (`last_error_message: нет`) и открыть Mini App из бота.

Без ключевых секретов `deploy.yml` пропускает деплой с warning и остаётся зелёным. Если `CLOUDFLARE_API_TOKEN` не задан, Pages деплоится своей Git-интеграцией. Подробности — [`docs/10-ops-deploy.md`](docs/10-ops-deploy.md) §5.1.

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
| `pnpm deploy:check` красный | смотрите список `✗`: незаполненные переменные, JWK без `kid`, не-HTTPS webhook |
| Пустой каталог в проде | `supabase db push` не грузит сид → запустить workflow с `seed_catalog=true` |
| CSP блокирует API/картинки в проде | `VITE_*` не заданы на этапе **сборки** SPA (а не в рантайме Railway) |
| `getWebhookInfo` показывает `last_error_message` | Railway не отвечает на `/telegram/webhook`, неверный secret или не HTTPS |
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
