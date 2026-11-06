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
- **КРИТИЧНО · сид в CI** — `[db.seed] sql_paths` тоже считается от каталога `supabase/`: было `./supabase/seed.sql` (не находился), стало `./seed.sql`. Добавлен явный шаг `Ensure catalog seed` в `database` job (проверяет `count(*) from public.items` и при нуле грузит `supabase/seed.sql`), иначе pgTAP падал с `null value in column item_id`. `open_case` теперь явно бросает `CATALOG_EMPTY` при пустом пуле предметов.
- **КРИТИЧНО · путь миграций** — `supabase/config.toml` использовал `[db.migrations] schema_paths` для `packages/db/supabase/migrations/*.sql`, но по документации Supabase этот ключ задаёт порядок **декларативных** схем для движка `migra` и **не** перенаправляет версионированные миграции. В результате `db reset`/`db push` не применяли ни один файл: pgTAP падал с `relation "public.wallets" does not exist`, а прод остался бы без схемы. Все 12 миграций перенесены в канонический `supabase/migrations/`, bogus-ключ удалён, `verify-seed` запрещает миграции вне этого пути; скрипты, CI, ADR-примечание и docs (04/05/11/reference) обновлены.
- **pgTAP** — причина красного job `database` найдена воспроизведением тестов на PGlite: `permission denied for schema auth` (RLS вызывает `auth.jwt()` от имени `authenticated`). В `0001_extensions.sql` добавлены `GRANT USAGE ON SCHEMA auth` и `GRANT EXECUTE ON FUNCTION auth.jwt()` для `anon/authenticated/service_role`. Setup-вызовы `select public.ensure_user(...)` перенесены в `DO $$ ... PERFORM ... $$`, чтобы pg_prove не считал их лишними TAP-строками. Добавлен `pnpm db:pgtap` (14 проверок локально без Docker) в `setup:check` и CI; `db:check` дополнительно прогоняет smoke денежных RPC.
- **Преддеплойная проверка** — `infra/scripts/check-migrations.mjs` + `pnpm db:check`: все 12 миграций накатываются на PGlite (настоящий Postgres в WASM) **без Docker и Supabase CLI**, проверяются 45 таблиц с RLS, RPC, бакет `catalog` и политики. Добавлено в `setup:check` и CI. `ci.yml`: job `database` зафиксирован на `ubuntu-24.04` (ubuntu-latest уже Ubuntu 26) и разделён на именованные шаги для диагностики. `infra/scripts/sync-web-env.mjs` + `pnpm env:sync` выводят 6 `VITE_*` из корневого `.env` в `apps/web/.env`; `deploy-check` читает оба env-файла.
- **Storage** — миграция `0012_storage.sql`: публичный бакет `catalog` (50 MiB, PNG/WebP/AVIF/JPEG) + политика `catalog_public_read` на `storage.objects`, запись только service_role; безопасно и на Postgres без схемы `storage`. `infra/scripts/upload-assets.mjs` + `pnpm assets:upload` (dry-run/limit, x-upsert, immutable Cache-Control, параллельно 8). `assets/catalog/` в `.gitignore`, `verify-seed` проверяет 12 миграций. README §3.1 и `docs/10-ops-deploy.md` §2.1 — схема URL без двойного `catalog/`, ручное создание бакета, шаг 7 «Что делать дальше».
- **Фронтенд `apps/web/.env`** — исправлен баг двойного пути: при `VITE_CDN_BASE_URL=…/catalog` картинки собирались как `/catalog/catalog/cases/…`; `composeAssetUrl()` теперь отсекает хвостовой `/catalog`, добавлен тест. `apps/web/.env.example` переписан с явными правилами (в dev всё закомментировано, для прода — build-time env Cloudflare Pages, `VITE_API_BASE_URL` без `/v1`, CDN без `/catalog`, только publishable-ключ). `env:check` показывает статус и этого файла, `deploy:check` проверяет `/v1` и `sb_secret_…` в публичных переменных.
- **Настройка `.env`** — `infra/scripts/env-check.mjs` + `pnpm env:check` (маскированный статус полей). `.env.example` переписан: все секретные значения **пустые**, комментарии вынесены на отдельные строки (раньше `sb_secret_...` / `<project-ref>` были непустыми и бот ошибочно выбирал Supabase-адаптер). `env.ts` теперь отвергает плейсхолдеры, проверяет HTTPS/путь вебхука и JWK с `kid`; `/health` больше не лжёт про `production_ready`. Добавлены регресс-тесты и предупреждение о перевыпуске токена через @BotFather `/revoke`. В `docs/10-ops-deploy.md` §2 дописан обязательный импорт + **Rotate key** приватного ES256 JWK в Supabase Dashboard.
- **Деплой (0.2.0)** — `infra/scripts/deploy-check.mjs` + `pnpm deploy:check` (preflight Q-01/Q-02: формат JWK с `kid`, HTTPS/путь вебхука, `VITE_*`, CSP, отсутствие `.env` в git). `deploy.yml` теперь полный: CI-гейт → `supabase db push` → **отдельный сид каталога** по флагу `seed_catalog=true` (`db push` сид не применяет) → сборка SPA → `wrangler pages deploy` → ожидание `production_ready` → `bot:webhook:set` → smoke. Добавлены `.dockerignore`, `pages_build_output_dir` в `wrangler.toml`, pnpm без Corepack в Dockerfile, CSP-токены `{{API_ORIGIN}}`/`{{SUPABASE_ORIGIN}}`/`{{CDN_ORIGIN}}` подставляются из `VITE_*` (в CI незакрытый токен = ошибка).

### Изменено
- **ADR-006** — старт этапа 1 на interim-допущениях §5 `14-open-questions.md`; Q-01/Q-02/Q-03 остаются блокерами деплоя и релиза (ADR-006).
- `docs/00-ТЗ.md` — статус «stage 0» → «stage 1 (инфраструктура)»; `AGENTS.md`, `README.md` — новая структура и быстрый старт.
- `docs/04-architecture.md` — фактическая раскладка каталогов и отклонения этапа 1.
- `README.md` §«Запуск и настройка» — установка pnpm через `npm i -g pnpm@10.34.9` вместо `corepack enable`: на Node.js 25+ Corepack не поставляется (проверено на Node 26.13.0 в PowerShell, `pnpm setup:check` зелёный). Добавлена строка troubleshooting.

### Исправлено
- BUG-011 — вместо `@telegram-apps/sdk` на этапе 1 используется типизированный адаптер `window.Telegram.WebApp` с `isVersionAtLeast()`; статус **open**, закрывается вместе с Q-01/Q-02.
- BUG-013 — `supabase db push` не грузил каталог в прод (сид применяется только `db reset`); добавлен отдельный идемпотентный шаг сида по флагу `seed_catalog=true`. Заодно CSP больше не содержит нереальных origin-ов, а деплой сам устанавливает вебхук.

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
