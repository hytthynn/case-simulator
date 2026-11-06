# 10 · Эксплуатация, окружения и деплой

> Цель: production-готовая инфраструктура на **Supabase** (БД/RLS/Realtime/Storage) + **Railway** (бот/API/воркеры) + CDN для SPA.

---

## 1. Окружения

| | `dev` | `staging` | `prod` |
|---|---|---|---|
| SPA | `localhost:5173` | Cloudflare Pages preview | Cloudflare Pages, custom domain, HTTPS |
| API/бот | Railway dev-сервис | Railway staging | Railway prod, `europe-west4-drams3a` |
| Supabase | локальный `supabase start` / branch | отдельный project | **Pro-план**, PITR + daily backups |
| Telegram | тестовый бот, **test-окружение** | тестовый бот, XTR test | прод-бот, реальные XTR |
| Данные | сид из `reference/` | сид + обезличенные фикстуры | реальные |
| Домен | http (только dev) | `staging.<domain>` | `app.<domain>`, `api.<domain>` |

> Production Mini App — **только HTTPS**. В test-окружении Telegram допустим HTTP без TLS. Bot API test: `https://api.telegram.org/bot<token>/test/METHOD_NAME`.

---

## 2. Supabase

| Настройка | Значение |
|---|---|
| План | **Pro** с первого дня продакшена (Free паузится через неделю простоя и не имеет бэкапов) |
| Регион | EU (ближайший к Railway `europe-west4`), проверить пинг на этапе 1 |
| Auth | JWT Signing Keys, ES256; rotation по регламенту; legacy JWT secret не использовать |
| Подключение | Railway → direct `db.<ref>.supabase.co:5432` (долгоживущий процесс); Edge Functions → Supavisor `:6543` с `prepare:false` / `statement_cache_size=0` |
| RLS | включён на всех таблицах, pgTAP-тесты в CI |
| Realtime | Broadcast для массовых каналов, Postgres Changes для `user:<id>`; RLS на `realtime.messages` |
| Storage | бакет `catalog` (public), WebP/AVIF, immutable `Cache-Control` |
| Cron | `pg_cron`: daily quests 00:05 UTC, supply drops */5, seed rotation 03:00, battle timeouts */1, chat cleanup 04:00; ≤8 параллельных задач |
| Edge Functions | только лёгкие валидаторы/админ-хуки; лимиты: 256 MB RAM, CPU 2 с, 150/400 с wall clock, HTML только с custom domain |
| Миграции | `supabase migration new` → `supabase db push` в **pre-deploy**, не в build-фазе |
| Типы | `supabase gen types typescript --local > packages/db/src/database.types.ts`, дифф проверяется CI |
| Бэкапы | daily 7 дней + PITR, еженедельное тестовое восстановление |

```bash
supabase start
supabase db reset                    # migrations + seed.sql
supabase db push                     # staging/prod
supabase test db                     # pgTAP
supabase gen signing-key --algorithm ES256
```

---

## 3. Railway

| Настройка | Значение |
|---|---|
| Билдер | Railpack (при наличии `Dockerfile` используется он) — проверить актуальность на этапе 1 |
| Слушатель | `0.0.0.0:$PORT` (Railway инжектит `PORT`) |
| Healthcheck | `GET /health` → 200 `{status, db, bot, version}`, `RAILWAY_HEALTHCHECK_TIMEOUT_SEC` |
| Zero-downtime | healthcheck 2xx до переключения трафика; сервисы с volume имеют кратковременный downtime → томов не использовать |
| Регион | `europe-west4-drams3a` (Амстердам, ближайший к СНГ) — замер пинга до `api.telegram.org` и Supabase обязателен |
| Private networking | `<service>.railway.internal:<PORT>` для внутренних сервисов; **недоступна в build-фазе** → миграции в start/pre-deploy |
| Автодеплой | GitHub, trigger-ветка, `Wait for CI`, watch paths |
| Секреты | Service Variables; ротация; ни одного секрета в репозитории/логах |
| Масштаб | начать с 1 реплики; состояние раундов в Postgres, не в памяти; при >1 — `pg_advisory_lock` |

`Dockerfile` (упрощённо):
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps/bot ./apps/bot
RUN pnpm install --frozen-lockfile && pnpm --filter bot build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/bot/dist ./dist
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

---

## 4. Секреты

| Переменная | Где | Клиенту |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Railway | ❌ |
| `TELEGRAM_WEBHOOK_SECRET` | Railway | ❌ |
| `SUPABASE_SECRET_KEY` / `service_role` | Railway, Supabase Secrets | ❌ |
| `SUPABASE_JWT_JWK` (приватный ES256) | Railway | ❌ |
| `DATABASE_URL`, `DATABASE_DIRECT_URL` | Railway | ❌ |
| `SUPABASE_PUBLISHABLE_KEY` | Railway + `VITE_*` | ✅ |
| `VITE_API_BASE_URL`, `VITE_CDN_BASE_URL` | сборка SPA | ✅ (не секрет) |

Шаблон — [`.env.example`](../.env.example). CI проверяет отсутствие секретов в бандле (`grep` по `dist/`).

---

## 5. CI/CD

```yaml
# .github/workflows/ci.yml (логика)
jobs:
  lint:        pnpm lint && pnpm typecheck
  test:        pnpm test:unit && pnpm test:contract
  db:          supabase start && supabase test db
  docs-lint:   ссылки в AGENTS.md/00-ТЗ.md резолвятся; AGENTS.md ≤ 200 строк; changelog содержит текущий тег
  build:       pnpm build (web + bot)
  visual:      Playwright снапшоты против docs/reference/screenshots
  security:    pnpm audit, grep секретов в dist, проверка CSP
```
`deploy.yml`: `Wait for CI` → `supabase db push` (pre-deploy) → Railway deploy → Cloudflare Pages deploy → smoke-тесты → алерт.

**Откат:** Railway — предыдущий деплой; миграции — только forward-compatible (никогда не дропать колонки в том же релизе); SPA — откат к предыдущему immutable-бандлу.

---

## 6. Фронтенд-хостинг

- **Cloudflare Pages** (или Vercel): глобальный CDN, immutable-кэш ассетов, собственный домен → стабильный origin для Bot API 10.2 (запрет вызова Mini App-методов с других origin).
- `_headers`:
```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://telegram.org; connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co https://api.<domain>; img-src 'self' data: https://<cdn>; frame-ancestors https://web.telegram.org https://t.me; base-uri 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
/catalog/*
  Cache-Control: public, max-age=31536000, immutable
```
- `index.html`: `<script src="https://telegram.org/js/telegram-web-app.js?64"></script>` **в `<head>` до остальных скриптов**.
- Для скачиваний: `Content-Disposition: attachment` + `Access-Control-Allow-Origin: https://web.telegram.org`.
- Ассеты каталога: Supabase Storage + CDN; `infra/scripts/verify-assets.ts` проверяет 404 по всему каталогу.

---

## 7. Мониторинг и алерты

| Метрика | Порог алерта |
|---|---|
| 5xx на API | > 1 % за 5 мин |
| p95 ролла | > 250 мс |
| p95 Realtime | > 500 мс |
| `/health` | любой failed |
| `answerPreCheckoutQuery` | p95 > 2 с, любой > 10 с |
| `star_payments` в `pending` | > 5 мин |
| Фактический RTP | отклонение > ±3 п.п. от целевого за 10 000 роллов |
| Egress / Storage / MAU | > 80 % лимита плана |
| Ошибки save/load | > 0.5 % сессий |
| Аномалии (редкие серии, всплеск ставок) | немедленно |

Инструменты: Railway metrics, Supabase dashboard, Sentry (без PII), `/metrics` (Prometheus), алерты в отдельный канал. Логи — структурированный JSON с `request_id`, без `initData`/ПД, ротация 30 дней.

---

## 8. Регламенты

| Процедура | Периодичность |
|---|---|
| Ротация `BOT_TOKEN`/JWT JWK | раз в 90 дней и при инциденте |
| Проверка бэкапа восстановлением | еженедельно |
| `pnpm audit` / обновление зависимостей | еженедельно |
| Сверка `star_payments` ↔ `getStarTransactions` | ежедневно |
| Проверка RTP/экономики | ежедневно |
| Ревизия `admin_flags` | при каждом релизе |
| Ревизия документации (`docs-lint`) | каждый PR |
| Постмортем инцидента | в течение 24 ч, запись в `12-bugs-and-fixes.md` |

---

## 9. Чек-лист запуска prod

- [ ] Supabase Pro, PITR и daily backups включены, восстановление проверено
- [ ] Railway: регион, `/health`, autodeploy, `Wait for CI`, секреты
- [ ] Webhook бота установлен с `secret_token`, 2FA владельца включена
- [ ] Custom domain + HTTPS + CSP + `frame-ancestors`
- [ ] Каталог ассетов загружен, `verify-assets` зелёный
- [ ] `/api/flags`-аналог (`admin_flags`) заполнен, все 22 игры включены
- [ ] Test-бот проверил полный XTR-флоу, включая возврат
- [ ] `/terms`, `/support`, `/paysupport`, Privacy Policy, 18+ доступны
- [ ] Мониторинг и алерты подключены
- [ ] Юридическая проверка R-01 (Valve IP) завершена
- [ ] `docs-lint`, RLS-тесты, k6-нагрузка, визуальные снапшоты зелёные

---

*Изменения инфраструктуры — в `infra/` + ADR при смене архитектуры + `13-changelog.md`.*
