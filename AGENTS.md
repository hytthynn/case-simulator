# AGENTS.md — входная точка для агентов и разработчиков

**Проект:** Telegram Mini App «Симулятор Кейсов» — реплика **1:1** Android-приложения
`com.cs2casesim.cs2_case_sim` v1.1.5 (Flutter) в браузере Telegram.
**БД:** Supabase · **Бэкенд/бот:** Railway · **Платежи:** только Telegram Stars `XTR`.
**Статус:** stage 1 (ADR-006) — монорепо, БД/RLS/RPC, бот и SPA-шелл созданы на interim-допущениях.
**Q-01…Q-03 не закрыты:** без `BOT_TOKEN`/доменов/доступов и юр. заключения запрещены реальный логин, XTR-платежи, деплой и релиз. `/health` → `production_ready: false`.

> ⚠️ **Прочитай `docs/00-ТЗ.md` перед любым изменением кода или требований.**
> Этот файл — только карта. Истина в `docs/`. Не дублируй сюда содержимое.

---

## 1. Обязательные правила (не нарушать)

1. **Клиент ничего не решает.** Баланс, дроп, ставка, награда, исход PvP — только серверная транзакция (`SELECT … FOR UPDATE` + `idempotency_key`). `Math.random()` в игровой логике запрещён.
2. **Только `XTR`.** Никаких фиата/крипты/сторонних провайдеров/внешних платёжных ссылок. Товар выдаётся **только** после `successful_payment`.
3. **Не продаём игровую валюту.** Решение D-01: Stars покупают косметику и бусты удобства; бусты **не влияют** на вероятности и исход раунда.
4. **Реальный онлайн, без ботов** (D-02). Нет соперника → лобби ждёт, ставка не списывается, таймаут = полный возврат.
5. **Ассеты 1:1** из APK/CDN (D-03), экономика = **снимок цен 05.11.2026** (D-04). Не менять без ADR.
6. **`initData` валидируется только на сервере**; `initDataUnsafe` — только для отображения имени/аватара.
7. **Секреты** (`BOT_TOKEN`, service key, JWK, `DATABASE_URL`) — только в Railway/Supabase Secrets. В репо, логах и клиенте их быть не должно.
8. **RLS включён на 100 % таблиц `public`**, `revoke grants` + pgTAP-тесты. Клиенту — publishable key.
9. **18+/симулятор.** Никакого вывода денег/скинов, P2P-обмена, Steam, «гарантированного выигрыша», гемблинг-фрейминга.
10. **Документация обновляется в том же PR**, что и код: минимум профильный doc + строка в `13-changelog.md`.

---

## 2. Карта документации

### Главное
| Файл | О чём |
|---|---|
| [`docs/00-ТЗ.md`](docs/00-ТЗ.md) | **ГЛАВНЫЙ КОНТРАКТ**: FR/NFR, архитектура, БД, Stars, онлайн, приёмка, риски, этапы |
| [`README.md`](README.md) | Быстрый старт и навигация |
| [`docs/14-open-questions.md`](docs/14-open-questions.md) | Принятые решения D-01…D-04 + вопросы Q-01…Q-14 |

### Исходный разбор (не переделывать)
| Файл | О чём |
|---|---|
| [`docs/01-reverse-engineering.md`](docs/01-reverse-engineering.md) | Как разбирались видео/APK/API, факты, доказательства, что не восстановлено |
| [`docs/02-ui-map.md`](docs/02-ui-map.md) | Покадровая карта экранов с таймкодами 00:00–09:50 |
| [`docs/reference/`](docs/reference/) | Снимки: `prices.json`, `flags.json`, `original-openapi.json`, `case-names.txt`, `ru-strings.txt`, `i18n-keys.txt`, `asset-manifest.txt`, `screenshots/` |

### Проектирование
| Файл | О чём |
|---|---|
| [`docs/03-design-system.md`](docs/03-design-system.md) | **Оформление 1:1**: палитра, шрифты, компоненты, отступы, анимации, эталонные кадры |
| [`docs/04-architecture.md`](docs/04-architecture.md) | **Структура проекта/монорепо**, стек, компоненты, потоки |
| [`docs/05-database.md`](docs/05-database.md) | Схема БД, RLS, индексы, RPC, миграции |
| [`docs/06-api.md`](docs/06-api.md) | HTTP/Realtime контракты, ошибки, идемпотентность |
| [`docs/07-security.md`](docs/07-security.md) | initData, JWT, provably-fair, анти-чит, rate limits |
| [`docs/08-game-logic.md`](docs/08-game-logic.md) | Вероятности, RTP, таблицы дропа, XP-кривая, формулы игр |
| [`docs/09-monetization.md`](docs/09-monetization.md) | SKU, XTR-цены, флоу инвойса, возвраты |
| [`docs/10-ops-deploy.md`](docs/10-ops-deploy.md) | Railway, Supabase, CI/CD, окружения, мониторинг |
| [`docs/11-testing-qa.md`](docs/11-testing-qa.md) | Тест-план, чек-листы, 12 критериев приёмки |

### Процесс и история
| Файл | О чём |
|---|---|
| [`docs/12-bugs-and-fixes.md`](docs/12-bugs-and-fixes.md) | **Реестр багов и исправлений** (вести всегда) |
| [`docs/13-changelog.md`](docs/13-changelog.md) | **Журнал изменений** (строка на каждый PR) |
| [`docs/decisions/`](docs/decisions/) | ADR-001…006: стек, авторизация, Stars, онлайн, ассеты/экономика, границы этапа 1 |

---

## 3. Целевая структура репозитория

```
AGENTS.md  README.md  .gitignore  .editorconfig  .env.example
package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
.github/workflows/{ci.yml,deploy.yml,docs-lint.yml}
docs/                      # ← ВСЯ документация, отдельная папка
apps/web/                  # Vite + React + TS SPA → Cloudflare Pages
apps/bot/                  # Node/Hono/grammY → Railway (webhook, RNG, воркеры)
packages/shared/           # Zod-схемы, типы, константы, provably-fair, i18n
packages/db/               # supabase/migrations, seed.sql, RPC, generated types
supabase/{config.toml,migrations/,seed.sql,functions/,tests/}
infra/{railway/,cloudflare/,monitoring/,scripts/}
```

Полное дерево и назначение каждого каталога — [`docs/04-architecture.md`](docs/04-architecture.md).
Корень чистый: без артефактов сборки, дампов, секретов, `.apk(s)`, `.MP4`, `*.db`.

---

## 4. Стек (кратко)

Vite + React 19 + TypeScript + Tailwind CSS 4 + Zustand + TanStack Query + Motion ·
Canvas/Three.js для рулетки и 3D-монетки · `@telegram-apps/sdk` ·
Node 22 + Hono + grammY на Railway · Supabase (Postgres/RLS/RPC/Realtime/Storage/pg_cron) ·
XTR · pnpm workspaces + Turborepo · Vitest / Playwright / pgTAP / k6 · GitHub Actions.

Обоснование и версии — [`docs/04-architecture.md`](docs/04-architecture.md), ADR-001.

---

## 5. Рабочий процесс

- **Ветки:** `main` (prod) ← `develop` ← `feat/<scope>-<short>` / `fix/<bug-id>`.
- **Коммиты:** Conventional Commits, например `feat(cases): add roulette canvas`, `fix(BUG-007): idempotent sell`. Ссылка на ADR/баг в теле.
- **Перед PR:** `pnpm lint && pnpm typecheck && pnpm test && pnpm docs:lint`.
- **Локально:** `pnpm install` → `pnpm --filter @case-sim/bot dev` (порт 3000, in-memory БД) + `pnpm --filter @case-sim/web dev` (порт 5173). Перед `supabase db reset`: `pnpm db:seed:generate`.
- **PR обязан содержать:** что изменено, затронутые FR/NFR, обновлённые doc-файлы, скриншоты для UI, тесты, чекбокс «секреты не добавлены».
- **Экономику/вероятности/прайс XTR** менять только вместе с новым ADR и правкой `08-game-logic.md` / `09-monetization.md`.
- **Любой баг** → сначала строка в `12-bugs-and-fixes.md` (со статусом `open`), затем исправление, затем `fixed` + коммит + регресс-тест.
- **Не перезаписывать** `docs/reference/` — это неизменяемые снимки исходных данных.

---

## 6. Контекстные заметки (чтобы не терять между сессиями)

- Исходники-эталоны лежат в корне воркспейса: `IMG_4385.MP4` (09:59, 576×1280) и `Симулятор Кейсов.apks`. В git не коммитятся.
- Оригинальный бэкенд: `https://cs2-case-api.fly.dev` (FastAPI, 92 эндпоинта), CDN `https://cs2-case-images.fly.dev`. Используются **только как справочник**, не как рантайм-зависимость.
- 5 нижних табов: `Кейсы · Инвентарь · Контракты · Игры · Магазин`. 241 кейс, 22 мини-игры, уровни 1…26, 62 звука, шрифты Orbitron + Rajdhani.
- В APK есть `assets/page/coin.html` — готовая 3D-монетка на Three.js, портируется в `apps/web`.
- AdMob/Play Billing/Play Games/FCM/Play Integrity в TMA недоступны → замены в разделе 7 ТЗ.
- Версия Telegram Bot API у клиента может отставать: всегда `WebApp.isVersionAtLeast()`, деградация без поломки.

---

## 7. Частые ловушки

| ❌ Не делать | ✅ Делать |
|---|---|
| Считать дроп/множитель на клиенте | Серверный HMAC-RNG + `rolls` |
| Выдавать товар на `pre_checkout_query` | Только `successful_payment` |
| Доверять `initDataUnsafe.user.id` | Провалидированный `initData` → JWT |
| Подставлять бота в пустое PvP-лобби | Ждать/отменять с возвратом |
| Добавлять «купить $» в магазин | Только косметика + бусты (D-01) |
| Обновлять цены «живьём» | Снимок 05.11.2026 + `price_snapshots` (D-04) |
| Хранить состояние в `localStorage` как источник истины | Postgres + кэш TanStack Query |
| Писать текст прямо в JSX | i18n-ключи из `reference/i18n-keys.txt` |

---

*Файл поддерживать ≤200 строк. Изменения правил — через ADR + `13-changelog.md`.*
