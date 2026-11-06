# 13 · Журнал изменений

> Формат: `## [версия] — дата` → `### Добавлено / Изменено / Исправлено / Решения`.
> **Каждый PR добавляет строку.** Для изменений экономики/архитектуры — ссылка на ADR.
> Связано: [`12-bugs-and-fixes.md`](12-bugs-and-fixes.md), [`decisions/`](decisions/).

---

## [0.2.0] — 2026-11-06 · Этап 1: инфраструктура и каркас 1:1

### Добавлено
- **Монорепо** (`pnpm workspaces + Turborepo`): корневые `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.nvmrc`, `.npmrc`, `NOTICES` (атрибуция Orbitron/Rajdhani/Valve).
- **`packages/shared`** — Zod-контракты (`06-api.md`), константы экономики/22 игр/редкостей, коды ошибок, HMAC-SHA256 provably-fair, каталог XTR-SKU с проверкой D-01, каркас i18n (RU 100 % для шелла), unit-тесты.
- **`packages/db`** — 11 SQL-миграций: ~40 таблиц, RLS на **100 %** `public` (цикл по `pg_tables`), `revoke grants`, `SECURITY DEFINER` RPC (`open_case`, `sell_items`, `mass_sell`, `grant_entitlement`, `consume_query_id`, …), append-only `rolls`, Realtime, pg_cron. pgTAP-тесты на изоляцию RLS и идемпотентность. `infra/scripts/import-prices.mjs` генерирует сид из неизменяемых снимков `reference/` (14 945 предметов, 241 кейс, флаги).
- **`apps/bot`** — Hono REST v1 + grammY: валидация `initData` (HMAC/TTL/anti-replay), ES256 JWT, `/health`, `/time`, `/catalog/*`, `/auth/telegram`, `/me`, `/cases/open`, `/inventory/sell`, `/payments/invoice`, webhook Stars (`pre_checkout_query` ≤10 с, выдача **только** на `successful_payment`, `refunded_payment`), единый формат ошибок, rate limits. In-memory адаптер для dev без Supabase, unit/интеграционные тесты.
- **`apps/web`** — Vite + React 19 + Tailwind CSS 4 SPA: TMA-bootstrap, 5 нижних табов, шапка с балансом/уровнем, каталог кейсов 3-в-ряд, открытие кейса с серверным результатом, инвентарь/контракты/игры/магазин, 18+ дисклеймер, оффлайн-баннер, i18n, `prefers-reduced-motion`, загрузочные экраны.
- **CI/CD и infra** — `ci.yml` (lint/typecheck/test/docs-lint/build/pgTAP), `docs-lint.yml`, `deploy.yml` (без секретов деплой пропускается), PR-шаблон, Railway `Dockerfile`/`railway.toml`, Cloudflare `_headers`/`wrangler.toml`, `docs-lint.mjs`, `verify-seed.mjs`, `verify-assets.mjs`, алерты.
- **Настройка и запуск** — `README.md` → пошаговый раздел «Запуск и настройка» (demo без ключей, `.env`, Supabase, @BotFather, Railway/Cloudflare, проверка, troubleshooting). `apps/bot dev` автоматически читает корневой `.env` (`--env-file-if-exists`), `apps/web/.env.example` для `VITE_*`, `pnpm setup:check`.
- **Скрипты** — `infra/scripts/set-webhook.mjs` (`pnpm bot:webhook:set|info|delete`: `secret_token`, `allowed_updates`, test-окружение, без вывода токена) и `infra/scripts/copy-headers.mjs` (CSP `_headers` автоматически попадает в `apps/web/dist` при сборке).

### Изменено
- **ADR-006** — старт этапа 1 на interim-допущениях §5 `14-open-questions.md`; Q-01/Q-02/Q-03 остаются блокерами деплоя и релиза (ADR-006).
- `docs/00-ТЗ.md` — статус «stage 0» → «stage 1 (инфраструктура)»; `AGENTS.md`, `README.md` — новая структура и быстрый старт.
- `docs/04-architecture.md` — фактическая раскладка каталогов и отклонения этапа 1.

### Исправлено
- BUG-011 — вместо `@telegram-apps/sdk` на этапе 1 используется типизированный адаптер `window.Telegram.WebApp` с `isVersionAtLeast()`; статус **open**, закрывается вместе с Q-01/Q-02.

### Решения
- **D-07** — interim-значения из §5 принимаются как действующие (официальные веса CS2, StatTrak 10 %, RTP 0.95–0.97, XP-кривая, старт $10, interim-прайс XTR, RU 100 %), помечены в коде как INTERIM.
- Q-01/Q-02/Q-03 **не закрыты**: без `BOT_TOKEN`, домена и юр. заключения недоступны реальная авторизация, XTR-платежи и публикация. Код не содержит секретов и запускается локально.

### Известные пробелы (переносятся в этап 2)
Q-01…Q-16, BUG-001…BUG-011, точная таблица дропа `case_drop_pool` и ~15 000 изображений CDN (Q-12).

---

## [0.1.0] — 2026-11-06 · Пакет ТЗ и документации

### Добавлено
- **`docs/00-ТЗ.md`** — подробнейшее техническое задание: 22 функциональных блока (FR-01…FR-22), 17 нефункциональных требований, архитектура, модель данных, API, безопасность, платежи XTR, онлайн/Realtime, дизайн, ассеты, тестирование, риски, план из 11 этапов, Definition of Done.
- **`AGENTS.md`** (≤200 строк) — карта всей документации, 10 обязательных правил, структура репозитория, рабочий процесс, ловушки.
- **`README.md`**, **`.gitignore`**, **`.editorconfig`**, **`.env.example`** — чистая корневая структура.
- **Профильная документация:**
  - `01-reverse-engineering.md` — разбор видео/APK/живого API, методы, доказательства, что не восстановлено.
  - `02-ui-map.md` — покадровая карта ~40 состояний UI с таймкодами 00:00–09:50.
  - `03-design-system.md` — палитра, редкости, шрифты, компоненты, анимации, Telegram-тема.
  - `04-architecture.md` — стек, компонентная схема, дерево монорепо, 5 потоков, ADR-ссылки.
  - `05-database.md` — ~30 таблиц, RLS, индексы, RPC, pg_cron, миграции.
  - `06-api.md` — REST/Realtime контракты, коды ошибок, идемпотентность.
  - `07-security.md` — initData/JWT/provably-fair/анти-чит/платежи/соответствие.
  - `08-game-logic.md` — вероятности, RTP, формулы 22 игр, XP, квесты.
  - `09-monetization.md` — каталог XTR-SKU, платёжный флоу, возвраты.
  - `10-ops-deploy.md` — Supabase/Railway/CI/CD/мониторинг.
  - `11-testing-qa.md` — пирамида тестов, 40+ тест-кейсов, 12 критериев приёмки.
  - `12-bugs-and-fixes.md` — реестр багов, 10 дефектов оригинала, 10 открытых пробелов.
  - `14-open-questions.md` — принятые решения и 16 вопросов заказчику.
  - `decisions/ADR-001…005.md` — стек, авторизация, Stars, онлайн, ассеты/экономика.
- **`docs/reference/`** — неизменяемые снимки:
  - `prices.json` (14 945 предметов, 949 KB, снимок 05.11.2026),
  - `flags.json`, `original-openapi.json` (92 эндпоинта),
  - `case-names.txt` (241 кейс), `i18n-keys.txt` (3 844 ключа), `ru-strings.txt` (953 строки), `asset-manifest.txt` (389 путей),
  - `screenshots/sheet_01..06.jpg` + `screenshots/detail/01..12.jpg` (18 эталонных листов, ~6 MB).

### Исследовано
- Видео `IMG_4385.MP4`: 09:59, 576×1280, 29.53 fps → 599 кадров 1 fps + 60 кадров 1/10 fps.
- APK `Симулятор Кейсов.apks`: Flutter/AOT, `com.cs2casesim.cs2_case_sim` v1.1.5 (33), 241 кейс, 62 звука, 6 шрифтов, Three.js `coin.html`, 3 844 i18n-ключа.
- Живой бэкенд: `cs2-case-api.fly.dev` (FastAPI, `/openapi.json`) + `cs2-case-images.fly.dev` (nginx CDN).
- Официальные документы Telegram (WebApp, Stars, TOS), Supabase (JWT Signing Keys, RLS, Realtime, pg_cron, лимиты EF), Railway (Railpack, healthchecks, регионы).

### Решения заказчика (зафиксированы)
- **D-01** — гибридная монетизация: косметика + отдельные бусты, без продажи игровой валюты и без влияния на шансы.
- **D-02** — реальный онлайн, без ботов/AI-соперников.
- **D-03** — исходные ассеты 1:1 (риск R-01 вынесен на юр. проверку).
- **D-04** — фиксированный снимок цен 05.11.2026.

### Известные пробелы (переносятся в работу)
Q-01…Q-16, BUG-001…BUG-010 — см. `14-open-questions.md` и `12-bugs-and-fixes.md`.

---

## Шаблон для следующих записей

```
## [0.2.0] — YYYY-MM-DD · <название этапа>
### Добавлено
- …
### Изменено
- … (ADR-xxx)
### Исправлено
- BUG-XXX — … (коммит `…`, тест `…`)
### Решения
- ADR-006 — …
```

---

*Changelog обязан содержать запись для каждого тега; проверяется `docs-lint` в CI.*
