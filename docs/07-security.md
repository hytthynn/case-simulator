# 07 · Безопасность, честность, анти-чит

> Обязательный стандарт: **клиент не является источником истины**. Любое изменение баланса/инвентаря/результата — серверная транзакция.
> Связано: [`06-api.md`](06-api.md), [`08-game-logic.md`](08-game-logic.md), [`09-monetization.md`](09-monetization.md), ADR-002.

---

## 1. Trust boundary

```
[ НЕ ДОВЕРЯЕМ ]  window.Telegram.WebApp.initDataUnsafe, localStorage, DevTools,
                 любые параметры запроса, client_seed (кроме как «вклад игрока»),
                 результат анимации, локальные часы устройства
───────────────────────────────────────────────────────────────────────
[ ДОВЕРЯЕМ ]     провалидированный initData, BOT_TOKEN в secrets, ES256 JWT,
                 Postgres (RLS + RPC), server_seed, серверное время
```

---

## 2. Валидация `initData` (канонический алгоритм)

```ts
// apps/bot/src/auth/validateInitData.ts
const params = new URLSearchParams(initData);
const receivedHash = params.get('hash');
params.delete('hash');                          // signature (third-party) тоже исключить

const dataCheckString = [...params.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k}=${v}`)
  .join('\n');                                  // 0x0A, НЕ '&', без пере-сериализации JSON

const secretKey = createHmac('sha256', 'WebAppData')
  .update(BOT_TOKEN).digest();                 // ключ = "WebAppData", сообщение = токен
const computed = createHmac('sha256', secretKey)
  .update(dataCheckString).digest('hex');

if (!timingSafeEqual(Buffer.from(computed), Buffer.from(receivedHash ?? '')))
  throw new AuthError('INVALID_INIT_DATA');

const authDate = Number(params.get('auth_date'));
if (Math.abs(Date.now() / 1000 - authDate) > 3600) throw new AuthError('TOKEN_EXPIRED');
// anti-replay
await db.sessions.insertOnConflictDoNothing({ query_id: params.get('query_id'), ... });
```

**Правила:**
- `initData` передаётся **только** в `Authorization: tma …`. Запрещено: URL/query, логи, аналитика, ошибки, Sentry.
- `initDataUnsafe` — **только** для имени/аватара/языка в UI; `user.id` для авторизации берём из провалидированных данных.
- Telegram **не задаёт** числовой TTL — 3600 с (или 300 с для платежей) — наше решение; плюс NTP/clock-skew допуск.
- Third-party Ed25519 `signature` (Bot API 8.0+) в нашем флоу не используется, но схема совместима.
- Login Widget (`SHA256(bot_token)`) и Mini App (`HMAC(WebAppData, bot_token)`) — **разные алгоритмы**, не путать.

---

## 3. JWT и Supabase

| | |
|---|---|
| Алгоритм | **ES256** через Supabase JWT Signing Keys (`supabase gen signing-key --algorithm ES256`) |
| Header | `{ alg:'ES256', kid, typ:'JWT' }` |
| Payload | `{ sub, role:'authenticated', exp, iat, app_metadata:{ telegram_user_id } }` |
| Запрос | `Authorization: Bearer <JWT>` + `apikey: sb_publishable_...` |
| JWKS | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`, кэш 10–20 мин |
| Клиенту | **`sb_publishable_...` только** |
| Серверу | `sb_secret_...` / `service_role` (обходит RLS) — в Railway Secrets |

`signInWithIdToken` **не принимает** сырой `initData` (предназначен для OIDC). Telegram Login OIDC (`id_token`) внутри Mini App избыточен.

### RLS
```sql
alter table public.<t> enable row level security;
revoke all on public.<t> from anon, authenticated;
grant select on public.<t> to authenticated;
create policy own_rows on public.<t> for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'telegram_user_id')::bigint
         = telegram_user_id);
```
- `app_metadata`, **не** `user_metadata`.
- Запись в денежные таблицы — только `SECURITY DEFINER` RPC с `set search_path = ''` в схеме `private`.
- pgTAP-тест: пользователь A не видит/не меняет строки B; `anon` не видит ничего.
- Индекс по `telegram_user_id` на каждой таблице с RLS.

---

## 4. Provably fair

**Commit–reveal, HMAC-SHA256, серверный RNG.**

```
1. Сервер: server_seed = crypto.randomBytes(32).toString('hex')
           seed_hash   = sha256(server_seed)         → публикуется ДО раунда
2. Игрок:  client_seed (свой ввод или дефолт), nonce монотонен
3. digest  = HMAC_SHA256(key=server_seed, msg="<client_seed>:<nonce>")
4. u32     = digest.readUInt32BE(0)
5. value   = u32 / 2^32  ∈ [0,1)                    → индекс в таблице вероятностей
6. Результат + списание + выдача фиксируются в ОДНОЙ транзакции в rolls
7. После ротации сид раскрывается; игрок проверяет sha256(server_seed) == seed_hash
```

| Требование | Реализация |
|---|---|
| Никакого `Math.random()` в игровой логике | линтер-правило + code review |
| Результат известен до анимации | `/cases/open` возвращает готовый ролл |
| Повтор запроса не создаёт новый ролл | `unique(telegram_user_id, idempotency_key)` + `idempotency_keys.response` |
| Сид не меняется после коммита | `rolls.server_seed_hash` immutable, триггер запрета UPDATE |
| Проверка игроком | `GET /me/rolls/:id/verify`, экран «Проверить раунд» в Mini App |
| Ротация | pg_cron ежедневно, старые сиды раскрываются и остаются в архиве |
| Аудит | `rolls` append-only, `audit_log`, алерты при аномальном RTP |

---

## 5. Экономическая целостность

| Угроза | Защита |
|---|---|
| Double-spend / повтор запроса | `idempotency_key` + `ON CONFLICT DO NOTHING RETURNING` |
| Гонка ставок | `SELECT … FROM wallets FOR UPDATE` / `pg_advisory_xact_lock` |
| Отрицательный баланс | `check (balance >= 0)` + триггер сверки `transactions` |
| Подмена цены | цена берётся из `items.prices` на сервере, в `rolls.price` фиксируется |
| Повторная продажа одного предмета | `inventory_items.locked` + удаление в той же транзакции |
| Подмена серверного времени | все кулдауны/стрики/раунды от `/time`, не от `Date.now()` клиента |
| Накрутка офлайн-автооткрывателя | расчёт по серверным таймстемпам, лимит слотов, `auto_opener_cap_knife_value` |
| Frozen/broken save | reconciliation `/me` при реконнекте; сервер — источник истины |

**Правило:** ни один клиентский вызов не может напрямую `UPDATE wallets/inventory_items` — только RPC.

---

## 6. Анти-чит и злоупотребления

- Rate limiting: 120 req/мин/пользователь, 10 openings/с, 5 инвойсов/мин, 1 сообщение чата / 2 с. Токен-бакет в `rate_limit_buckets`.
- Anti-replay `query_id` (таблица `sessions`, TTL).
- Heartbeat + anomaly detection: резкий RTP, серии редких дропов, >N ставок в секунду → автобан + алерт.
- Бан по `telegram_user_id`, флаг `users.is_banned`, проверка в middleware и RLS.
- Модерация чата: фильтр, скрытие, бан, лимит длины, запрет ссылок на внешние платежи.
- Play Integrity в TMA нет → заменяется валидацией initData + rate limits + аудитом (A-05).
- Админ-действия — отдельная авторизация + `audit_log`.

---

## 7. Безопасность платежей (Stars)

| Правило | Почему |
|---|---|
| `currency: "XTR"`, `provider_token: ""`, один `LabeledPrice`, `amount` целое | TOS §6.2 |
| `answerPreCheckoutQuery` ≤ 10 с | иначе транзакция отменяется |
| Выдача **только** после `successful_payment` | `pre_checkout_query` не гарантирует оплату |
| `telegram_payment_charge_id UNIQUE` | защита от дублей webhook; поля `charge_id` не существует |
| `invoice_payload` ↔ `star_payments` | связываем заказ и выдачу |
| `refunded_payment` → отзыв entitlement | возврат/чарджбэк |
| `getStarTransactions` сверка | восстановление покупок |
| Без внешних платёжных ссылок | главный риск блокировки бота |

Webhook проверяется по `X-Telegram-Bot-Api-Secret-Token`. Все события идемпотентны.

---

## 8. Веб-безопасность

- Только HTTPS; CSP: `default-src 'self'; script-src 'self' https://telegram.org; connect-src 'self' https://<supabase>.supabase.co wss://<supabase>.supabase.co https://api.<domain>; img-src 'self' data: https://<cdn>; frame-ancestors https://web.telegram.org https://t.me; base-uri 'none'`. Точный список origin-ов проверить на реальных клиентах (Q-16).
- Никаких inline-скриптов, `eval`, `dangerouslySetInnerHTML` с пользовательским вводом.
- Zod-валидация **всех** входящих данных; параметризованные запросы; `search_path = ''` в RPC.
- Каталог подписывается/кешируется по `ETag`; клиент не может подменить `items`/`case_drop_pool`.
- Sentry без PII: скремблинг `initData`, токенов, `telegram_user_id` в breadcrumbs.
- `Content-Disposition: attachment` + `Access-Control-Allow-Origin: https://web.telegram.org` для скачиваний.
- Зависимости: `pnpm audit`, Dependabot, renovate, lockfile в git.

---

## 9. Персональные данные и соответствие

| Требование | Реализация |
|---|---|
| Минимизация | храним `telegram_user_id`, `username`, `first_name`, `photo_url`, `language_code`, `is_premium` |
| Согласие | 18+ + оферта **до** первой покупки, `users.accepted_terms_at` |
| `/terms`, `/support`, `/paysupport` | обязательные команды бота + ссылки из Mini App |
| Удаление | `POST /me/delete`, каскад, cooldown 4 ч, отметка в аудите |
| GDPR / 152-ФЗ | политика конфиденциальности, DPA с Supabase, вопрос локализации ПД (Q-11) |
| Дисклеймер | «Симулятор. Не азартная игра. Реальные деньги не используются; предметы не выводятся, не обмениваются и не имеют денежной стоимости» |
| Возраст | 18+, age-gate на онбординге |
| Логи | без ПД и initData; структурированный JSON + `request_id`; ротация 30 дней |

---

## 10. Чек-лист перед релизом

- [ ] HMAC-валидация initData + TTL + anti-replay, unit-тесты на подделку каждого поля
- [ ] ES256 JWT через Signing Keys; legacy HS256 secret не используется
- [ ] RLS на 100 % таблиц + `revoke grants` + pgTAP зелёный
- [ ] Ни одного `service_role`/`BOT_TOKEN` в клиентском бандле (проверка `grep` в CI)
- [ ] Все денежные RPC идемпотентны и покрыты конкурентным тестом (k6, 50 параллельных открытий)
- [ ] `Math.random()` отсутствует в `apps/bot` и в игровой логике `apps/web`
- [ ] Provably-fair: верификация раунда проходит, `seed_hash` совпадает
- [ ] Webhook идемпотентен: дубль `successful_payment` не выдаёт товар дважды
- [ ] `answerPreCheckoutQuery` < 10 с под нагрузкой
- [ ] Rate limits, бан, модерация чата работают
- [ ] CSP/HTTPS/`frame-ancestors` проверены на iOS/Android/Desktop/Web
- [ ] Sentry не получает PII; логи не содержат `initData`
- [ ] `/terms`, `/support`, `/paysupport`, оферта, 18+, Privacy Policy доступны
- [ ] Юридическая проверка R-01 (Valve IP) и gambling-фрейминга завершена

---

*Любой инцидент → строка в [`12-bugs-and-fixes.md`](12-bugs-and-fixes.md) с меткой `security` + postmortem.*
