# 05 · Схема базы данных (Supabase PostgreSQL)

> Правила: RLS на **всех** таблицах `public`; деньги меняются **только** через `SECURITY DEFINER` RPC;_ledger append-only; все мутации идемпотентны.
> Типы генерируются: `supabase gen types typescript --local > packages/db/src/database.types.ts`.

---

## 1. Общие соглашения

- Первичный ключ: `uuid default gen_random_uuid()` (кроме справочников — `text` slug/id).
- Все таблицы: `created_at timestamptz default now()`, где нужно — `updated_at` с триггером.
- Идентификатор игрока: `telegram_user_id bigint` (из провалидированного `initData`), дублируется в строках для RLS.
- Деньги: `numeric(20,2)` (виртуальные `$`), XTR: `integer`.
- `set search_path = ''` во всех `SECURITY DEFINER` функциях.
- `revoke all on all tables in schema public from anon, authenticated;` + точечные `grant select`.
- Партиционирование `rolls`, `transactions`, `chat_messages` по `created_at` (месяц) при росте.

### RLS-политика (шаблон)
```sql
create policy "own_rows" on public.<table>
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'telegram_user_id')::bigint
         = telegram_user_id);
```
`user_metadata` **не использовать** — меняется пользователем. Обёртка `(select …)` кэширует initPlan. Индекс по `telegram_user_id` обязателен.

---

## 2. Справочники (read-only для клиента)

```sql
-- Редкости и их цвета/веса
rarity_config(rarity text pk, weight numeric(9,6), color_hex text, sort_order int)

-- Кейсы: 241 запись из reference/case-names.txt
cases(
  id text pk, name text, kind text check (kind in ('case','capsule','souvenir','black_market')),
  image_url text, base_price numeric(20,2), key_price numeric(20,2) default 0,
  min_level int default 1, section text, sort_order int, enabled bool default true,
  free_claims_per_day int default 0, cooldown_seconds int default 0, meta jsonb
)

-- Предметы: ~14 945 из reference/prices.json
items(
  id text pk, name text, weapon text, skin text, collection text,
  type text check (type in ('skin','knife','glove','sticker','agent','package')),
  rarity text references rarity_config, image_url text,
  stattrak_eligible bool, min_float numeric(4,3), max_float numeric(4,3),
  prices jsonb,           -- {"FN":..,"MW":..,"FT":..,"WW":..,"BS":..} или {"price":..}
  base_price numeric(20,2), stattrak_multiplier numeric(4,2) default 2.0
)

-- Таблица дропа кейса
case_drop_pool(
  case_id text references cases, item_id text references items,
  rarity text, weight numeric(12,6), stattrak_chance numeric(6,5) default 0.1,
  primary key (case_id, item_id)
)

-- Снимки цен (D-04)
price_snapshots(id text pk, captured_at date, source text, item_count int,
                checksum text, meta jsonb, imported_at timestamptz)
price_entries(snapshot_id text references price_snapshots, item_id text,
              prices jsonb, primary key (snapshot_id, item_id))

-- Магазин XTR
sku_catalog(sku text pk, kind text check (kind in ('cosmetic','convenience','bundle')),
            title_ru text, title_en text, amount_xtr int, payload jsonb,
            active bool, sort_order int, preview_url text)

-- Флаги
admin_flags(key text pk, value jsonb, updated_at timestamptz, updated_by bigint)

-- Уровни/квесты
level_curve(level int pk, xp_required bigint, max_bet numeric(20,2), reward jsonb)
quest_definitions(code text pk, type text, params jsonb, rewards jsonb,
                  active_from date, active_to date, weight int)
```

---

## 3. Пользователь

```sql
users(
  id uuid pk, telegram_user_id bigint unique not null,
  username text, first_name text, last_name text, photo_url text,
  language_code text default 'ru', is_premium bool default false,
  referral_code text unique not null, referred_by bigint,
  level int default 1, xp bigint default 0,
  agent_id text, background_id text, border_id text, effect_id text,
  showcase jsonb default '[]'::jsonb, settings jsonb default '{}'::jsonb,
  accepted_terms_at timestamptz, is_banned bool default false,
  created_at timestamptz, last_seen_at timestamptz
)

wallets(                       -- блокируется FOR UPDATE на каждой операции
  user_id uuid pk references users, balance numeric(20,2) default 0,
  lifetime_earned numeric(20,2) default 0, lifetime_spent numeric(20,2) default 0,
  wagered numeric(20,2) default 0, updated_at timestamptz
)

profiles(user_id uuid pk, showcase jsonb, stats_visibility text default 'all')
user_settings(user_id uuid pk, sound bool, haptics bool, notifications jsonb, locale text)
entitlements(
  id uuid pk, user_id uuid, sku text references sku_catalog,
  source text check (source in ('stars','admin','promo','quest')),
  telegram_payment_charge_id text, granted_at timestamptz, expires_at timestamptz,
  revoked_at timestamptz, meta jsonb
)
user_upgrade_tracks(user_id uuid, track text, level int, primary key(user_id,track))
user_stats(user_id uuid pk, jsonb_data jsonb)   -- денормализованная статистика
sessions(query_id text pk, telegram_user_id bigint, used_at timestamptz)  -- anti-replay
```

`user_upgrade_tracks.track`: `supply_drop | auto_opener | xp_boost | max_bet | vault_slots`.

---

## 4. Экономика (append-only ядро)

```sql
transactions(
  id bigserial pk, user_id uuid, telegram_user_id bigint,
  type text check (type in ('credit','debit')), amount numeric(20,2),
  reason text,                 -- case_open, item_sell, bet, win, quest, daily, refund
  ref_type text, ref_id uuid, balance_after numeric(20,2),
  idempotency_key text, created_at timestamptz
)
create unique index on transactions (telegram_user_id, idempotency_key) where idempotency_key is not null;

rolls(                        -- provably-fair аудит
  id uuid pk, telegram_user_id bigint, user_id uuid,
  context text check (context in ('case','game','battle','event')),
  case_id text, game text, round_id uuid, battle_id uuid,
  server_seed_hash text not null, server_seed text,   -- раскрывается после ротации
  client_seed text, nonce bigint, digest_hex text, roll_value numeric(18,12),
  result_item_id text, rarity text, wear text, float_value numeric(4,3),
  stattrak bool, price numeric(20,2),
  idempotency_key text not null, created_at timestamptz,
  unique (telegram_user_id, idempotency_key)
)

inventory_items(
  id uuid pk, telegram_user_id bigint, item_id text references items,
  wear text, float_value numeric(4,3), stattrak bool default false,
  price numeric(20,2), acquired_at timestamptz,
  source text, source_roll uuid, locked bool default false, vault_id uuid,
  meta jsonb
)

vaults(id uuid pk, telegram_user_id bigint, started_at timestamptz,
       ends_at timestamptz, payout_rate numeric(6,4), status text,
       total_value numeric(20,2), paid_out numeric(20,2) default 0)

supply_drops(user_id uuid pk, next_at timestamptz, streak int, rank int,
             claims_total int, last_claimed_at timestamptz)

game_rounds(
  id uuid pk, game text, state text,   -- betting|starting|running|settled|cancelled
  seed_hash text, server_seed text, config jsonb, result jsonb,
  starts_at timestamptz, started_at timestamptz, finished_at timestamptz
)
game_bets(
  id uuid pk, round_id uuid references game_rounds, telegram_user_id bigint,
  stake_amount numeric(20,2), stake_items jsonb, client_seed text, nonce bigint,
  payout numeric(20,2), result jsonb, idempotency_key text not null,
  created_at timestamptz, unique(telegram_user_id, idempotency_key)
)

case_battles(
  id uuid pk, mode text, state text, case_ids jsonb, creator_id bigint,
  max_players int, entry_fee numeric(20,2), seed_hash text, server_seed text,
  winner_id bigint, result jsonb, expires_at timestamptz,
  created_at timestamptz, finished_at timestamptz
)
battle_players(battle_id uuid, telegram_user_id bigint, slot int,
               total_value numeric(20,2), items jsonb, joined_at timestamptz,
               primary key(battle_id, telegram_user_id))
battle_rolls(id uuid pk, battle_id uuid, telegram_user_id bigint,
             case_index int, item jsonb, price numeric(20,2), created_at timestamptz)
```

---

## 5. Социалка

```sql
friends(user_id bigint, friend_id bigint, nickname text, status text,
        created_at timestamptz, primary key(user_id, friend_id))
friend_requests(id uuid pk, from_id bigint, to_id bigint, status text, created_at timestamptz)
gifts(id uuid pk, from_id bigint, to_id bigint, payload jsonb,
      created_at timestamptz, opened_at timestamptz)
referrals(id uuid pk, inviter_id bigint, invitee_id bigint,
          invitee_level int, reward numeric(20,2), paid_at timestamptz,
          unique(inviter_id, invitee_id))
chat_messages(id bigserial pk, channel text default 'global',
              telegram_user_id bigint, text text, is_hidden bool default false,
              created_at timestamptz)
notifications(id uuid pk, telegram_user_id bigint, kind text, payload jsonb,
              sent_at timestamptz, read_at timestamptz)
```

---

## 6. Платежи

```sql
star_payments(
  id uuid pk, telegram_user_id bigint, sku text,
  amount_xtr int not null, invoice_payload text unique not null,
  telegram_payment_charge_id text unique,   -- НЕ charge_id!
  provider_payment_charge_id text,
  status text check (status in ('pending','paid','refunded','failed')),
  raw jsonb, created_at timestamptz, paid_at timestamptz, refunded_at timestamptz
)
payment_events(id bigserial pk, event_type text, payload jsonb,
               processed_at timestamptz, error text)
```

Связь: `invoice_payload` → `star_payments` → `entitlements.telegram_payment_charge_id`.

---

## 7. Квесты, аудит, лимиты

```sql
user_quests(user_id uuid, quest_code text, quest_date date, progress int,
            completed_at timestamptz, claimed_at timestamptz,
            primary key(user_id, quest_code, quest_date))
daily_claims(telegram_user_id bigint, claim_date date, kind text, payload jsonb,
             primary key(telegram_user_id, claim_date, kind))
event_spins(id uuid pk, telegram_user_id bigint, spin_date date, result jsonb,
            created_at timestamptz, unique(telegram_user_id, spin_date))
audit_log(id bigserial pk, actor text, action text, entity text, entity_id text,
          before jsonb, after jsonb, created_at timestamptz)
rate_limit_buckets(key text pk, tokens int, reset_at timestamptz)
idempotency_keys(key text pk, telegram_user_id bigint, response jsonb,
                 created_at timestamptz)
```

---

## 8. RPC (все `SECURITY DEFINER`, `set search_path = ''`)

| Функция | Что делает |
|---|---|
| `open_case(p_case_id text, p_count int, p_client_seed text, p_idempotency_key text)` | списание, N роллов, выдача предметов, ledger. Возвращает `rolls[]` + баланс |
| `sell_items(p_ids uuid[], p_idempotency_key text)` | продажа, ledger |
| `mass_sell(p_max_price numeric, p_idempotency_key text)` | продажа всех дешевле порога |
| `place_bet(p_game text, p_params jsonb, p_item_ids uuid[], p_client_seed text, p_idempotency_key text)` | ставка в раунд |
| `settle_round(p_round_id uuid)` | расчёт и выдача выигрышей (вызывается воркером) |
| `create_battle(p_params jsonb)`, `join_battle(p_id uuid, …)`, `settle_battle(p_id uuid)` | PvP |
| `claim_daily(p_kind text)`, `claim_quest(p_code text)`, `claim_supply_drop()` | награды |
| `vault_deposit(p_ids uuid[])`, `vault_claim(p_id uuid)` | хранилище |
| `grant_entitlement(p_user bigint, p_sku text, p_charge text)` | **только service_role** |
| `get_me()`, `get_inventory(p_page int, p_filters jsonb)`, `get_stats()` | чтение |

**Шаблон денежной функции:**
```sql
begin;
  perform pg_advisory_xact_lock(hashtext(p_user::text));       -- или FOR UPDATE wallets
  select balance into v_balance from public.wallets
    where telegram_user_id = p_user for update;
  if v_balance < p_cost then raise exception 'INSUFFICIENT_BALANCE'; end if;
  insert into public.transactions(...) values (...) on conflict do nothing returning id into v_tx;
  if v_tx is null then  -- повтор запроса
    return (select response from public.idempotency_keys where key = p_idem);
  end if;
  -- ... ролл / выдача ...
  update public.wallets set balance = balance - p_cost ...;
  insert into public.rolls(...);
  insert into public.idempotency_keys(key, response) values (p_idem, v_response);
commit;
```

---

## 9. Realtime-публикации

```sql
alter publication supabase_realtime add table public.users;       -- только персональные
alter publication supabase_realtime add table public.wallets;
alter publication supabase_realtime add table public.inventory_items;
alter publication supabase_realtime add table public.entitlements;
alter table public.wallets replica identity full;
-- RLS на realtime.messages для Broadcast-каналов
create policy "chat_read" on realtime.messages for select to authenticated
  using (extension = 'broadcast' and topic like 'chat:%');
```
Массовые события (`battle:*`, `jackpot:current`, `crash:current`, `chat:global`) идут через **Broadcast** триггером `realtime.broadcast_changes()` или серверным `.send()`.

---

## 10. pg_cron

```sql
select cron.schedule('daily-quests','5 0 * * *', $$select public.reset_daily_quests()$$);
select cron.schedule('supply-drops','*/5 * * * *', $$select public.process_supply_drops()$$);
select cron.schedule('seed-rotation','0 3 * * *', $$select public.rotate_server_seeds()$$);
select cron.schedule('battle-timeouts','* * * * *', $$select public.cancel_expired_battles()$$);
select cron.schedule('chat-cleanup','0 4 * * *', $$delete from public.chat_messages where created_at < now() - interval '30 days'$$);
```
Ограничения: ≤8 параллельных задач, ≤10 мин на задачу, время UTC.

---

## 11. Миграции и сидирование

```
supabase/migrations/              # канонический путь: db reset / db push читают только его
  0001_extensions.sql         pgcrypto, pg_cron, pg_net
  0002_reference.sql          rarity_config, cases, items, case_drop_pool
  0003_core.sql               users, wallets, profiles, entitlements
  0004_economy.sql            transactions, rolls, inventory_items, vaults
  0005_games.sql              game_rounds, game_bets, case_battles, battle_*
  0006_social.sql             friends, gifts, referrals, chat, notifications
  0007_payments.sql           star_payments, payment_events, sku_catalog
  0008_rls.sql                enable RLS + policies + revoke/grant
  0009_functions.sql          все RPC
  0010_realtime.sql           publications + broadcast policies
  0011_cron.sql               расписания
  0012_storage.sql            бакет Storage `catalog` + публичное чтение
seed.sql                      импорт reference/prices.json + 241 кейса + SKU + level_curve
```

`docs-lint`/CI проверяют: `supabase db push` на чистой БД, `pgTAP` тесты RLS (пользователь A не видит строки B), `supabase gen types` не даёт диффа.

---

*Изменения схемы — миграция + ADR (если меняется экономика) + `13-changelog.md`.*
