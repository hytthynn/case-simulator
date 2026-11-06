# 06 · API-контракты

> Реализация: `apps/bot` (Hono, Railway). Все схемы — Zod в `packages/shared` и используются и клиентом, и сервером.
> Аутентификация: `Authorization: Bearer <ES256 JWT>` + `apikey: <publishable>`; первичный вход — `Authorization: tma <initData>`.
> Все мутации требуют `Idempotency-Key: <uuid>`.

---

## 1. Общие соглашения

| | |
|---|---|
| Base URL | `https://api.<domain>/v1` |
| Формат | JSON, `Content-Type: application/json; charset=utf-8` |
| Время | ISO 8601 UTC; игровые таймеры считаются от `GET /time` |
| Пагинация | `?page=1&limit=50` → `{items, page, limit, total, has_more}` |
| Идемпотентность | `Idempotency-Key` обязателен для POST, изменяющих баланс/инвентарь; хранится 24 ч; повтор возвращает сохранённый ответ `200` |
| Rate limit | 120 req/мин на `telegram_user_id`; 10 openings/с; 5 инвойсов/мин; 429 + `Retry-After` |
| Версионирование | `/v1`; Breaking changes → `/v2` + ADR |

### Формат ошибки
```json
{
  "code": "INSUFFICIENT_BALANCE",
  "message": "Недостаточно средств",
  "request_id": "9d1e…",
  "details": { "required": 2.61, "available": 0.81 }
}
```

| HTTP | code | Когда |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod не прошёл |
| 401 | `INVALID_INIT_DATA` / `TOKEN_EXPIRED` | initData/JWT |
| 403 | `BANNED` / `LEVEL_LOCKED` / `GAME_DISABLED` | доступ |
| 404 | `NOT_FOUND` | ресурс |
| 409 | `IDEMPOTENCY_CONFLICT` / `ROUND_CLOSED` / `BATTLE_FULL` | конфликт состояния |
| 422 | `INSUFFICIENT_BALANCE` / `ITEM_LOCKED` / `NOT_ELIGIBLE` | бизнес-правило |
| 429 | `RATE_LIMITED` | лимит |
| 503 | `MAINTENANCE` / `OFFLINE_REQUIRED` | флаг/сеть |

---

## 2. Авторизация

### `POST /auth/telegram`
Заголовок: `Authorization: tma <Telegram.WebApp.initData>`.
Ответ:
```json
{
  "access_token": "<ES256 JWT, ttl 3600>",
  "refresh_token": "<ttl 30d>",
  "user": { "id": "uuid", "telegram_user_id": 123, "level": 1, "xp": 397,
            "balance": "11.74", "referral_code": "ANRS37",
            "agent_id": "…", "locale": "ru", "accepted_terms_at": null },
  "server_time_ms": 1793931663737,
  "flags": { "game_disabled_crash": false, "min_client_version": "1.0.0" }
}
```
Сервер: HMAC-валидация → `auth_date` TTL 3600 → anti-replay `query_id` → upsert `users/wallets` → JWT.

### `POST /auth/refresh` · `POST /auth/logout`

---

## 3. Каталог

| Метод | Путь | Ответ |
|---|---|---|
| GET | `/catalog/cases?tab=cases\|black_market\|capsules\|souvenir&page=` | `Case[]` |
| GET | `/catalog/cases/:id` | `Case { id,name,kind,image_url,base_price,key_price,min_level,contents: DropPreview[] }` |
| GET | `/catalog/items?q=&rarity=&type=&page=` | `Item[]` |
| GET | `/catalog/items/:id` | `Item` |
| GET | `/catalog/skus` | `Sku[]` (только активные XTR) |
| GET | `/catalog/ranks` | ранги 3×9 |
| GET | `/flags` | `Record<string, json>` |
| GET | `/time` | `{ now_ms }` |
| GET | `/stats/public` | `{ total_users, new_24h }` |

`Case` и `Item` кэшируются CDN + `ETag`; клиент держит в TanStack Query (`staleTime: 1h`).

---

## 4. Игрок

| Метод | Путь | Ответ |
|---|---|---|
| GET | `/me` | профиль + баланс + entitlements + upgrade tracks + активный раунд |
| PATCH | `/me` | `{ agent_id, background_id, border_id, effect_id, showcase, settings }` |
| GET | `/me/inventory?filters=&page=` | `InventoryItem[]` |
| GET | `/me/stats` | статистика по разделам |
| GET | `/me/quests` | дейли + контракты + прогресс |
| GET | `/me/transactions` | ledger (только свои) |
| GET | `/me/rolls/:id/verify` | `{ server_seed, seed_hash, client_seed, nonce, digest, result }` — provably fair |
| POST | `/me/accept-terms` | фиксация согласия 18+ **до** покупки |
| POST | `/me/delete` | удаление аккаунта (cooldown 4 ч) |

---

## 5. Кейсы

### `POST /cases/open`
```json
{ "case_id": "kilowatt-case", "count": 1,
  "client_seed": "optional-user-seed", "idempotency_key": "uuid",
  "options": { "auto_select": false, "auto_sell_below": null } }
```
Ответ:
```json
{
  "rolls": [{
    "roll_id": "uuid", "item_id": "AK-47 | Inheritance", "rarity": "classified",
    "wear": "FT", "float_value": 0.284, "stattrak": false, "price": "0.87",
    "server_seed_hash": "sha256…", "nonce": 421, "digest_hex": "…"
  }],
  "balance_after": "9.13",
  "inventory_item_ids": ["uuid"],
  "auto_sold": []
}
```
**Сервер возвращает готовый результат до анимации.** Клиент проигрывает рулетку до этого индекса.

### Остальное
| Метод | Путь | Описание |
|---|---|---|
| POST | `/cases/mass-open` | `{case_id, count ≤ 1000, sell_mode, idempotency_key}` |
| POST | `/cases/auto-opener/claim` | забрать офлайн-накопленное (интервал 5 мин, sell 65 %) |
| GET | `/cases/auto-opener` | слоты, заполненность, next_open_at |
| POST | `/inventory/sell` | `{item_ids[], idempotency_key}` |
| POST | `/inventory/mass-sell` | `{max_price, idempotency_key}` → `{count, total}` |
| POST | `/vault/deposit` / `/vault/claim` | хранилище |
| POST | `/supply-drop/claim` | получить снабжение |
| GET | `/black-market` | кастомные кейсы + cooldown |
| POST | `/black-market/claim` | бесплатный кейс |

---

## 6. Игры

| Метод | Путь | Описание |
|---|---|---|
| GET | `/games` | список игр, level-gates, `disabled` из флагов, RTP |
| GET | `/games/:game/state` | текущий раунд, фаза, таймер, ставки (без чужих сидов) |
| POST | `/games/:game/bet` | `{stake_item_ids[], stake_amount, client_seed, params, idempotency_key}` |
| POST | `/games/:game/cashout` | для crash/mines/towers/hilo/ridethebus |
| GET | `/games/:game/history` | последние результаты |
| GET | `/games/:game/verify/:round_id` | provably-fair проверка |

Имя `:game` ∈ `coinflip, roulette, dice, crash, mines, plinko, pachinko, towers, jackpot, blackjack, hilo, ridethebus, upgrader, tradeup, tradedown, scratch, cashclicker, defuse, rushb, casebattle, event`.

**Общие поля ставки:** `idempotency_key`, `client_seed`, `max_bet`, `stake_items` (предметы из инвентаря), `stake_amount`. Если игра отключена флагом → `403 GAME_DISABLED`.

---

## 7. Битвы кейсов (PvP, D-02)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/battles?mode=&status=&min_value=` | список лобби |
| POST | `/battles` | `{mode, case_ids[], max_players, modifiers, idempotency_key}` |
| GET | `/battles/:id` | состояние, игроки, роллы |
| POST | `/battles/:id/join` | вход живого игрока |
| POST | `/battles/:id/leave` | выход до старта (ставка не списывалась) |
| GET | `/battles/:id/replay` | повтор |
| GET | `/battles/recent` | история |

**Правило D-02:** ставка списывается **только** в момент `starting`, когда набрано нужное число **живых** игроков. Таймаут → `cancelled` + полный возврат. AI-соперники не создаются.

---

## 8. Платежи (XTR)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/payments/skus` | активные SKU с ценой в XTR |
| POST | `/payments/invoice` | `{sku}` → `{invoice_url, payment_id}`; создаёт `star_payments(pending)` |
| GET | `/payments/:id` | статус pending/paid/refunded |
| GET | `/payments/history` | покупки пользователя |
| POST | `/payments/restore` | восстановление покупок (сверка `getStarTransactions`) |
| POST | `/telegram/webhook` | **внутренний**: `pre_checkout_query`, `successful_payment`, `refunded_payment`, команды |

`createInvoiceLink` параметры (сервер, grammY):
```ts
{ title, description, payload: payment.invoice_payload,
  provider_token: "", currency: "XTR",
  prices: [{ label: sku.title_ru, amount: sku.amount_xtr }], photo_url }
```
`pre_checkout_query` → `answerPreCheckoutQuery(id, true)` **≤10 с**; выдача — только `successful_payment`; `telegram_payment_charge_id` уникален.
Подробнее: [`09-monetization.md`](09-monetization.md).

---

## 9. Социалка

| Метод | Путь | Описание |
|---|---|---|
| GET | `/social/friends` | список + online (heartbeat < 60 с) |
| POST | `/social/friends/request` | по коду |
| POST | `/social/friends/respond` | accept/decline |
| DELETE | `/social/friends/:id` | удалить |
| PATCH | `/social/friends/:id` | nickname |
| GET | `/social/requests` | входящие/исходящие |
| POST | `/social/gifts/send` · `/open` | подарки (1 на друга) |
| GET | `/social/chat?before=` | история (модерация, hidden) |
| POST | `/social/chat` | отправить (rate limit) |
| WS | `realtime:chat:global` | Broadcast новых сообщений |
| GET | `/referrals` | код, список, награды |
| POST | `/referrals/redeem` | применить код |
| POST | `/referrals/claim` | забрать награду |

---

## 10. Квесты, награды, админка

| Метод | Путь | Описание |
|---|---|---|
| POST | `/quests/:code/claim` | награда |
| POST | `/quests/:code/reroll` | заменить одно задание в день |
| POST | `/daily/claim` | ежедневный подарок |
| POST | `/event/spin` | бесплатный спин (1/день) |
| GET | `/leaderboard/:season` | топ |
| GET | `/admin/flags` · `POST /admin/flags` | фича-флаги |
| POST | `/admin/prices/import` | импорт нового снимка (по D-04 — только вручную) |
| POST | `/admin/moderation/hide` | скрыть сообщение |
| POST | `/admin/ban` | бан |
| POST | `/admin/grant` | ручная выдача entitlement |
| GET | `/admin/metrics` | RTP, DAU, платежи |

Админ-роуты — отдельная авторизация (список `ADMIN_TELEGRAM_IDS`), аудит в `audit_log`.

---

## 11. Realtime-события (Supabase)

| Канал | Тип | Событие | Payload |
|---|---|---|---|
| `user:<id>` | Postgres Changes | `balance_changed`, `inventory_changed`, `entitlement_granted`, `notification` | `{…}` |
| `chat:global` | Broadcast | `message`, `message_hidden` | `{id, user, text, ts}` |
| `battle:lobby` | Broadcast | `battle_created`, `battle_removed` | `{battle}` |
| `battle:<id>` | Broadcast | `player_joined`, `starting`, `roll`, `settled` | `{slot, item, total}` |
| `jackpot:current` | Broadcast | `bet`, `countdown`, `spin`, `settled` | `{pot, bets, winner}` |
| `crash:current` | Broadcast | `betting`, `launching_in`, `tick`, `crashed` | `{multiplier, round_id}` |

Клиент **не** шлёт игровые результаты по Realtime — только сервер (`.send()` с service key) или триггер `realtime.broadcast_changes()`.

---

## 12. Служебные

| Метод | Путь | Описание |
|---|---|---|
| GET | `/health` | 200 `{status, db, bot, version}` для Railway |
| GET | `/metrics` | Prometheus-метрики (без PII) |
| POST | `/analytics/event` | батч событий |
| POST | `/analytics/heartbeat` | онлайн-статус |
| POST | `/feedback` | обратная связь |

---

## 13. Контрактное тестирование

- Zod-схемы из `packages/shared` — единственный источник; генерация OpenAPI из Hono + `@hono/zod-openapi`.
- CI: `pnpm contract:check` сверяет типы клиента и сервера; `pnpm test:api` поднимает локальный Supabase и прогоняет все роуты.
- Любое изменение ответа → правка `06-api.md` + `13-changelog.md`.

---

*Не менять контракт без ADR и версионирования.*
