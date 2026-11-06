# 04 · Архитектура, стек и структура проекта

> Главный контракт — [`00-ТЗ.md`](00-ТЗ.md). Решения — [`decisions/`](decisions/).

---

## 1. Выбор стека (обоснование)

| Слой | Выбор | Обоснование | Альтернатива (почему нет) |
|---|---|---|---|
| Фронтенд | **Vite + React 19 + TypeScript** | Чистый SPA: SSR не нужен внутри webview; минимальный бандл; быстрый HMR; зрелая экосистема Telegram-хуков | Next.js/SvelteKit — лишний серверный рантайм; Vue — слабее Telegram-специфика |
| Стили | **Tailwind CSS 4** + CSS-переменные Telegram | Токены темы `var(--tg-theme-*)` без рантайма; компактный CSS | CSS Modules — больше ручной работы с темой |
| Состояние | **Zustand** (UI/сессия) + **TanStack Query** (серверные данные) | Разделение локального UI и кэша каталога/инвентаря; оффлайн через `persistQueryClient` | Redux — избыточный бойлерплейт |
| Анимации | **Motion (Framer Motion)** + **Canvas 2D** + **Three.js** | 60 fps на `transform/opacity`; лента рулетки из >100 карточек не должна плодить DOM; 3D-монетка уже есть в `coin.html` | Чистый DOM — просядет на слабых устройствах |
| TMA SDK | `@telegram-apps/sdk` + `telegram-web-app.js?64` в `<head>` | Типизация, `isVersionAtLeast()`, безопасные обёртки | Прямой `window.Telegram` — легко ошибиться версией |
| Бэкенд | **Node.js 22 LTS + TypeScript + Hono + grammY** | Долгоживущий процесс: webhook бота, координация раундов, воркеры, RNG; нет 2-секундного CPU-лимита | Только Edge Functions — 256 MB / CPU 2 с / cold starts / нет долгоживущего WS |
| БД | **Supabase PostgreSQL** | RLS, атомарные `SECURITY DEFINER` RPC, `FOR UPDATE`, Realtime, Storage, pg_cron, `gen types` | Голый Postgres — пришлось бы писать auth/realtime самим |
| Realtime | **Supabase Realtime Broadcast** (массовое) + **Postgres Changes** (персональное) | Broadcast не авторизует каждое событие для каждого подписчика | Postgres Changes на всех — деградация при >1000 подписчиков |
| Платежи | **Telegram Stars XTR** | Единственный легальный способ продажи цифровых товаров в Telegram | Любой фиат/крипта — нарушение TOS §6.2 |
| Хостинг | SPA → **Cloudflare Pages** (или Vercel); бот/API → **Railway** `europe-west4-drams3a` | Глобальный CDN + immutable кэш для 15k картинок; Railway для stateful-процесса | Статика на Railway — хуже CDN; Supabase EF не отдают HTML без custom domain |
| Монорепо | **pnpm workspaces + Turborepo** | Общие Zod-схемы/типы/таблицы дропа между web, bot и db | Разные репозитории — рассинхрон контрактов |
| Тесты | Vitest · Playwright · pgTAP · k6 | unit / e2e / RLS / нагрузка | — |

> Версии пакетов фиксируются в `package.json` на этапе 1 и проверяются `pnpm audit`. В ТЗ намеренно не «вбиваются» номера версий, которые могли измениться к моменту реализации; обязательна проверка `npm view` + совместимости TypeScript с Vite/ESLint.

### Почему не Flutter Web
Исходник — AOT-снимок Dart **без исходного кода**. Даже при декомпиляции перенос на Flutter Web дал бы: бандл в несколько МБ (критично для webview), CanvasKit-рендер с нестабильным FPS, конфликт с `window.Telegram.WebApp`, отсутствие нативных платежей. React SPA точнее и дешевле для 1:1 UI.

---

## 2. Компонентная схема

```
┌──────────────────────── Telegram Client ─────────────────────────┐
│ telegram-web-app.js → WebApp (initData, theme, haptics, buttons)   │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTPS / WSS
┌──────────────────────────────▼───────────────────────────────────┐
│ apps/web (Vite SPA, Cloudflare Pages)                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ app/        роутер, провайдеры, TMA-bootstrap, error boundary│  │
│  │ widgets/    Header, BottomNav, CaseGrid, RouletteCanvas       │  │
│  │ features/   cases, inventory, games/*, battles, shop,         │  │
│  │             social, quests, profile, payments                 │  │
│  │ entities/   user, item, case, bet, transaction (Zod + types)  │  │
│  │ shared/     ui-kit, i18n, audio, haptics, rng-verify, api     │  │
│  └────────────────────────────────────────────────────────────┘  │
│  Zustand (UI) · TanStack Query (catalog/me) · supabase-js (pub key)│
└──────────────┬─────────────────────────────────┬─────────────────┘
               │ REST (JWT)                       │ Realtime WSS
┌──────────────▼───────────────────┐   ┌─────────▼──────────────────────┐
│ apps/bot (Railway, Node/Hono)     │   │ Supabase                       │
│  auth/       initData → ES256 JWT │SQL│  Postgres: RLS + RPC + indexes │
│  api/        REST v1 (Zod)        │◄─►│  Realtime: Broadcast + Changes │
│  payments/   XTR invoice, webhook │5432│  Storage: catalog images       │
│  games/      round coordinators   │   │  pg_cron: quests/drops/seeds   │
│  social/     chat, friends, gifts │   │  Edge Fn: лёгкие валидаторы    │
│  jobs/       seed rotation, timeouts│  └────────────────────────────────┘
│  admin/      flags, moderation    │
│  telegram/   grammY bot, /terms   │
└──────────────┬───────────────────┘
               │ Bot API (server only)
┌──────────────▼───────────────────┐
│ Telegram Bot API · Stars XTR      │
└──────────────────────────────────┘
```

---

## 3. Структура монорепо (production-ready)

```
case-sim/
├── AGENTS.md                          # ≤200 строк, карта документации
├── README.md
├── .gitignore  .editorconfig  .nvmrc  .env.example
├── package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
├── .github/
│   ├── workflows/ci.yml               # lint, typecheck, unit, docs-lint
│   ├── workflows/deploy.yml           # staging/prod
│   ├── workflows/docs-lint.yml        # ссылки, ≤200 строк AGENTS.md
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/                              # ← ВСЯ документация (отдельная папка)
│   ├── 00-ТЗ.md … 14-open-questions.md
│   ├── decisions/ADR-001..005.md
│   └── reference/…
├── apps/
│   ├── web/
│   │   ├── index.html                 # telegram-web-app.js в <head>
│   │   ├── vite.config.ts  tailwind.config.ts  tsconfig.json
│   │   ├── public/                   # manifest, og-image, fonts fallback
│   │   ├── src/
│   │   │   ├── app/                  # providers, router, bootstrap, guards
│   │   │   ├── widgets/              # Header, BottomNav, TabBar, Modal
│   │   │   ├── features/
│   │   │   │   ├── cases/            # каталог, рулетка, масс/авто-открытие
│   │   │   │   ├── inventory/        # фильтры, продажа, vault
│   │   │   │   ├── games/            # по игре: coinflip/, crash/, mines/…
│   │   │   │   ├── battles/          # лобби, PvP-рулетки
│   │   │   │   ├── shop/             # XTR SKU, оформление
│   │   │   │   ├── social/           # чат, друзья, подарки, рефералы
│   │   │   │   ├── quests/           # дейли, контракты
│   │   │   │   └── profile/          # статистика, кастомизация
│   │   │   ├── entities/             # user/item/case/bet (Zod + hooks)
│   │   │   ├── shared/               # ui/, lib/, i18n/, audio/, haptics/
│   │   │   └── assets/               # шрифты, иконки, coin3d/
│   │   └── tests/{unit,e2e,visual}/
│   └── bot/
│       ├── Dockerfile  railway.json  package.json  tsconfig.json
│       ├── src/
│       │   ├── index.ts               # Hono app + grammY bot + /health
│       │   ├── auth/                  # initData validate, JWT issue, guards
│       │   ├── api/                   # REST v1 роуты
│       │   ├── payments/              # createInvoiceLink, webhook, refunds
│       │   ├── games/                 # round state machine, RNG, settlement
│       │   ├── social/                # chat, friends, gifts, referrals
│       │   ├── admin/                 # flags, moderation, metrics
│       │   ├── jobs/                  # cron-воркеры, таймауты лобби
│       │   ├── telegram/              # команды бота, уведомления
│       │   └── lib/                   # supabase-admin, logger, errors
│       └── tests/{unit,integration,load}/
├── packages/
│   ├── shared/
│   │   ├── src/{schemas,types,constants,rarity,provably-fair,i18n-keys,xtr-skus}/
│   │   └── package.json
│   └── db/
│       ├── src/database.types.ts      # supabase gen types
│       ├── supabase/migrations/*.sql
│       ├── supabase/seed.sql
│       ├── supabase/tests/*_test.sql  # pgTAP
│       └── package.json
├── supabase/
│   ├── config.toml
│   ├── functions/                     # лёгкие Deno-функции
│   └── tests/
└── infra/
    ├── railway/{Dockerfile,railway.toml}
    ├── cloudflare/{_headers,wrangler.toml}
    ├── monitoring/{alerts.md,dashboards.md}
    └── scripts/{import-prices.ts,extract-apk-assets.ts,verify-assets.ts}
```

**Правила чистоты:** в корне только конфиги и входные файлы; артефакты (`dist`, `node_modules`, `.env`, `*.apk(s)`, `*.MP4`, `*.db`, логи) в `.gitignore`; каждый пакет имеет свой `package.json` и `README` только при необходимости; общие типы — только в `packages/shared`.

---

## 4. Ключевые потоки

### 4.1 Авторизация
```
WebApp.initData → Authorization: tma <initData> → POST /auth/telegram
 → HMAC(WebAppData, BOT_TOKEN) → data_check_string → timingSafeEqual
 → auth_date TTL 3600 + anti-replay query_id
 → ES256 JWT (Supabase Signing Keys, app_metadata.telegram_user_id)
 → клиент: supabase-js + Authorization: Bearer <JWT> + apikey: publishable
 → RLS пускает только строки этого telegram_user_id
```
Подробнее: [`07-security.md`](07-security.md), ADR-002.

### 4.2 Открытие кейса
```
UI «ОТКРЫТЬ» → POST /cases/open {case_id, count, client_seed, idempotency_key}
 → RPC open_case(): FOR UPDATE wallets → balance check → INSERT bet ON CONFLICT
 → HMAC-SHA256(server_seed, "<client_seed>:<nonce>") → rarity → item → wear → float → ST
 → INSERT inventory_items, rolls, transactions → COMMIT
 ← {rolls[], seed_hash, balance_after}
 → Canvas-анимация ровно до полученного индекса → карточка результата
```
**Результат известен серверу до начала анимации.** Пропуск анимации не меняет результат.

### 4.3 Платёж XTR
```
КУПИТЬ ★N → POST /payments/invoice → star_payments(pending)
 → bot.createInvoiceLink(currency:"XTR", provider_token:"", prices:[{amount:N}])
 → WebApp.openInvoice(url) → pre_checkout_query → answerPreCheckoutQuery(ok) [≤10 c]
 → successful_payment → star_payments(paid) + entitlements + audit_log
 → Realtime user:<id> → UI обновляет оформление/буст
```
Подробнее: [`09-monetization.md`](09-monetization.md), ADR-003.

### 4.4 PvP-битва (D-02, без ботов)
```
create battle → broadcast battle:lobby → живой игрок join
 → оба подтвердили → сервер фиксирует seed_hash + списывает ставки
 → broadcast battle:<id> rolls → settle → winner → выдача предметов
 → нет второго игрока N сек → cancel + полный возврат (ботов не создаём)
```

### 4.5 Общий раунд (Crash / Jackpot)
```
pg_cron / coordinator создаёт game_rounds(seed_hash, starts_at)
 → broadcast "betting" → игроки ставят (RPC, idempotency)
 → broadcast "starting"/ countdown → сервер вычисляет результат из сида
 → broadcast "settled" → RPC начисляет выигрыши → новый раунд
```

---

## 5. Границы ответственности

| Решает клиент | Решает сервер |
|---|---|
| Отрисовка, анимация, звук, тактильность | Баланс, инвентарь, цена, редкость, float, StatTrak |
| Локальные фильтры/сортировка (уже загруженных данных) | Результат дропа, множитель, исход PvP, победитель |
| Кэш каталога (TanStack Query) | Каталог, флаги, цены, задания, награды |
| `client_seed` (ввод игрока) | `server_seed`, nonce, HMAC, публикация `seed_hash` |
| UI подтверждения | Выдача entitlement, возврат Stars, бан, модерация |

---

## 6. Масштабирование и отказоустойчивость

- **Railway**: 1 реплика для start, горизонтальное масштабирование через stateless API; состояние раундов — в Postgres, не в памяти; при >1 реплике координация через `pg_advisory_lock` / lease-таблицу.
- **Supabase**: direct connect 5432 с Railway (долгоживущий процесс), pooler 6543 с `prepare:false` для Edge Functions; индексы по всем FK и `telegram_user_id`.
- **Realtime**: Broadcast для `chat:global`, `battle:*`, `jackpot:current`, `crash:current`; Postgres Changes только `user:<id>`.
- **Кэш**: CDN immutable для ассетов; `stale-while-revalidate` для каталога; `ETag` для `/catalog/*`.
- **Оффлайн**: клиент показывает кэш + баннер `common.noInternet.*`, **не** проводит денежные операции, при реконнекте делает `/me` reconciliation.
- **DR**: daily backups + PITR Supabase Pro, экспорт `reference/` в Git, инфраструктура как код в `infra/`.

---

## 7. ADR

| ID | Решение |
|---|---|
| [`ADR-001`](decisions/ADR-001-stack.md) | Vite/React SPA + Node/Railway + Supabase; отказ от Flutter Web и «только Edge Functions» |
| [`ADR-002`](decisions/ADR-002-auth.md) | initData → ES256 JWT (Signing Keys) → RLS |
| [`ADR-003`](decisions/ADR-003-stars.md) | Только XTR; гибридная монетизация без продажи валюты |
| [`ADR-004`](decisions/ADR-004-online.md) | Реальный онлайн без ботов; Broadcast + серверные раунды |
| [`ADR-005`](decisions/ADR-005-assets.md) | Ассеты 1:1 + фиксированный снимок цен |

---

## 8. Фактическая реализация этапа 1 (0.2.0)

| Решение из ТЗ | Как реализовано | Отклонение |
|---|---|---|
| `SECURITY DEFINER` RPC | `packages/db/supabase/migrations/0009_functions.sql`, `set search_path = ''`, все ссылки квалифицированы | нет |
| pgcrypto для HMAC-RNG | фиксированная схема `extensions` (`extensions.hmac / digest / gen_random_bytes`) — одинаково на Supabase и локальном Postgres | уточнение схемы |
| RLS на 100 % таблиц | `0008_rls.sql` включает RLS циклом по `pg_tables`, затем `revoke all` и точечные `grant select` | нет |
| Денежные RPC | доступны только `service_role`; клиент получает доступ к чтению через свой JWT | нет |
| `@telegram-apps/sdk` | `apps/web/src/shared/telegram/adapter.ts` — типизированная обёртка с `isVersionAtLeast()` | **BUG-011**, interim до Q-01/Q-02 |
| Supabase/Railway доступы | `createMemoryDb()` в `apps/bot` для dev; `production_ready: false` в `/health` | **ADR-006** |
| Сборка бота | `tsup` → один ESM-бандл `apps/bot/dist/index.js`; `@hono/node-server` слушает `0.0.0.0:$PORT` | нет |
| Каталог/сид | `infra/scripts/import-prices.mjs` генерирует `supabase/seed-data.sql` из `docs/reference/` | ассеты не выгружены (Q-03/Q-12) |

Открытые пробелы: `case_drop_pool` пуст (BUG-012), CSP origin-ы требуют проверки (Q-16), 15k изображений и 62 звука не выгружены.

---

*Изменения архитектуры — только через новый ADR и `13-changelog.md`.*
