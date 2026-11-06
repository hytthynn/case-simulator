-- 0009 · RPC. Все SECURITY DEFINER + set search_path = '' (docs/05-database.md §8).
-- Денежные функции доступны ТОЛЬКО service_role (Railway), клиент их не вызывает:
-- сервер валидирует JWT и сам передаёт p_telegram_user_id из провалидированного initData.
set search_path = public;

-- --- Provably-fair примитивы (pgcrypto в схеме extensions) ------------------
create or replace function public.fair_digest(p_seed text, p_client_seed text, p_nonce bigint, p_counter int)
returns text language sql immutable set search_path = '' as $$
  select encode(
    extensions.hmac(
      case when p_counter = 0
        then p_client_seed || ':' || p_nonce::text
        else p_client_seed || ':' || p_nonce::text || ':' || p_counter::text
      end,
      p_seed, 'sha256'
    ), 'hex')
$$;

create or replace function public.fair_uniform(p_seed text, p_client_seed text, p_nonce bigint, p_counter int)
returns numeric language sql immutable set search_path = '' as $$
  select (('x' || substr(public.fair_digest(p_seed, p_client_seed, p_nonce, p_counter), 1, 8))::bit(32)::bigint)::numeric
         / 4294967296.0
$$;

create or replace function public.fair_seed_hash(p_seed text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_seed, 'sha256'), 'hex')
$$;

create or replace function public.active_server_seed()
returns public.server_seeds language plpgsql security definer set search_path = '' as $$
declare v_row public.server_seeds%rowtype;
begin
  select * into v_row from public.server_seeds where active limit 1;
  if not found then
    insert into public.server_seeds (seed, seed_hash)
    values (encode(extensions.gen_random_bytes(32), 'hex'), '')
    returning * into v_row;
    update public.server_seeds set seed_hash = public.fair_seed_hash(seed) where id = v_row.id
      returning * into v_row;
  end if;
  return v_row;
end
$$;

-- --- Онбординг --------------------------------------------------------------
create or replace function public.ensure_user(
  p_telegram_user_id bigint, p_username text, p_first_name text,
  p_photo_url text, p_language_code text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user public.users%rowtype;
  v_code text;
  v_starting numeric(20,2) := 10.00;  -- INTERIM [Q-07]
begin
  select * into v_user from public.users where telegram_user_id = p_telegram_user_id;
  if not found then
    v_code := upper(substring(md5(p_telegram_user_id::text || clock_timestamp()::text) from 1 for 6));
    insert into public.users (telegram_user_id, username, first_name, photo_url, language_code, referral_code)
    values (p_telegram_user_id, p_username, p_first_name, p_photo_url,
            coalesce(p_language_code, 'ru'), v_code)
    returning * into v_user;

    insert into public.wallets (user_id, telegram_user_id, balance, lifetime_earned)
    values (v_user.id, p_telegram_user_id, v_starting, v_starting);
    insert into public.transactions (user_id, telegram_user_id, type, amount, reason, balance_after, idempotency_key)
    values (v_user.id, p_telegram_user_id, 'credit', v_starting, 'signup_bonus', v_starting,
            'signup:' || p_telegram_user_id::text);
    insert into public.profiles (user_id, telegram_user_id) values (v_user.id, p_telegram_user_id);
    insert into public.user_settings (user_id, telegram_user_id, locale)
    values (v_user.id, p_telegram_user_id, coalesce(p_language_code, 'ru'));
    insert into public.user_stats (user_id, telegram_user_id) values (v_user.id, p_telegram_user_id);
    insert into public.supply_drops (user_id, telegram_user_id) values (v_user.id, p_telegram_user_id);
  else
    update public.users set
      username = coalesce(p_username, username),
      first_name = coalesce(p_first_name, first_name),
      photo_url = coalesce(p_photo_url, photo_url),
      last_seen_at = now()
    where id = v_user.id returning * into v_user;
  end if;

  return jsonb_build_object(
    'id', v_user.id,
    'telegram_user_id', v_user.telegram_user_id,
    'level', v_user.level,
    'xp', v_user.xp,
    'referral_code', v_user.referral_code,
    'agent_id', v_user.agent_id,
    'locale', v_user.language_code,
    'accepted_terms_at', v_user.accepted_terms_at,
    'is_banned', v_user.is_banned
  );
end
$$;

-- Anti-replay: query_id принимается один раз (docs/07-security.md §2).
create or replace function public.consume_query_id(p_query_id text, p_telegram_user_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_query_id is null or p_query_id = '' then return false; end if;
  insert into public.sessions (query_id, telegram_user_id)
  values (p_query_id, p_telegram_user_id)
  on conflict (query_id) do nothing;
  return found;
end
$$;

-- --- Чтение своего состояния -------------------------------------------------
create or replace function public.get_me()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tg bigint := public.current_telegram_user_id(); v jsonb;
begin
  if v_tg is null then raise exception 'UNAUTHORIZED'; end if;
  select jsonb_build_object(
    'id', u.id, 'telegram_user_id', u.telegram_user_id, 'level', u.level, 'xp', u.xp,
    'balance', to_char(w.balance, 'FM999999999999999990.00'),
    'referral_code', u.referral_code, 'agent_id', u.agent_id,
    'locale', u.language_code, 'accepted_terms_at', u.accepted_terms_at
  ) into v
  from public.users u join public.wallets w on w.user_id = u.id
  where u.telegram_user_id = v_tg;
  return coalesce(v, '{}'::jsonb);
end
$$;

-- --- Открытие кейса: списание + RNG + выдача в ОДНОЙ транзакции -------------
create or replace function public.open_case(
  p_telegram_user_id bigint, p_case_id text, p_count int,
  p_client_seed text, p_idempotency_key text, p_auto_sell_below numeric default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_key_row public.idempotency_keys%rowtype;
  v_user uuid;
  v_wallet public.wallets%rowtype;
  v_case public.cases%rowtype;
  v_seed_row public.server_seeds%rowtype;
  v_seed text;
  v_hash text;
  v_cost numeric(20,2);
  v_discount numeric := 0;
  v_balance numeric(20,2);
  v_credits numeric(20,2) := 0;
  v_nonce bigint;
  v_u_rarity numeric;
  v_rarity text;
  v_acc numeric := 0;
  v_r record;
  v_pool text[];
  v_item_id text;
  v_item public.items%rowtype;
  v_u_item numeric;
  v_u_st numeric;
  v_u_float numeric;
  v_st boolean;
  v_float numeric(4,3);
  v_wear text;
  v_price numeric(20,2);
  v_digest text;
  v_inv_id uuid;
  v_roll_id uuid;
  v_rolls jsonb := '[]'::jsonb;
  v_inventory_ids uuid[] := '{}';
  v_auto_sold uuid[] := '{}';
  i int;
begin
  -- Один и тот же ключ не может выполниться дважды даже при гонке.
  perform pg_advisory_xact_lock(hashtext(p_idempotency_key));
  select * into v_key_row from public.idempotency_keys
    where key = p_idempotency_key and telegram_user_id = p_telegram_user_id;
  if found then return v_key_row.response; end if;

  if p_count < 1 or p_count > 6 then raise exception 'VALIDATION_ERROR'; end if;

  select id into v_user from public.users where telegram_user_id = p_telegram_user_id;
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;

  select * into v_case from public.cases where id = p_case_id and enabled;
  if not found then raise exception 'NOT_FOUND'; end if;

  -- D-01: скидка буста не влияет на вероятности, только на цену открытия.
  if v_case.kind = 'case' and exists (
    select 1 from public.entitlements e
    where e.telegram_user_id = p_telegram_user_id and e.sku = 'boost.caseDiscount' and e.revoked_at is null
  ) then v_discount := 0.35; end if;

  v_cost := round((v_case.base_price + v_case.key_price) * p_count * (1 - v_discount), 2);

  select * into v_wallet from public.wallets
    where telegram_user_id = p_telegram_user_id for update;
  if not found then raise exception 'UNAUTHORIZED'; end if;
  if v_wallet.balance < v_cost then
    raise exception using errcode = 'P0001', message = 'INSUFFICIENT_BALANCE';
  end if;

  v_seed_row := public.active_server_seed();
  v_seed := v_seed_row.seed;
  v_hash := v_seed_row.seed_hash;
  select coalesce(max(nonce), 0) + 1 into v_nonce from public.rolls
    where telegram_user_id = p_telegram_user_id;

  for i in 1..p_count loop
    declare v_current_nonce bigint := v_nonce + i - 1;
    begin
      v_digest := public.fair_digest(v_seed, p_client_seed, v_current_nonce, 0);
      v_u_rarity := public.fair_uniform(v_seed, p_client_seed, v_current_nonce, 0);

      -- Редкость по накопленным весам из rarity_config (INTERIM, Q-04).
      v_rarity := 'mil_spec';
      v_acc := 0;
      for v_r in select rarity, weight from public.rarity_config where weight > 0 order by sort_order loop
        v_acc := v_acc + v_r.weight;
        if v_u_rarity < v_acc then v_rarity := v_r.rarity; exit; end if;
      end loop;

      -- INTERIM [Q-12]: точная таблица дропа кейса появится на этапе 2.
      select array_agg(item_id order by item_id) into v_pool from public.case_drop_pool
        where case_id = p_case_id and rarity = v_rarity;
      if v_pool is null or array_length(v_pool, 1) is null then
        select array_agg(id order by id) into v_pool from public.items where rarity = v_rarity;
      end if;
      if v_pool is null or array_length(v_pool, 1) is null then
        select array_agg(id order by id) into v_pool from public.items;
      end if;

      -- Без сида каталог пуст: лучше явная ошибка, чем NULL в NOT NULL колонку.
      if v_pool is null or array_length(v_pool, 1) is null then
        raise exception using errcode = 'P0001', message = 'CATALOG_EMPTY';
      end if;

      v_u_item := public.fair_uniform(v_seed, p_client_seed, v_current_nonce, 1);
      v_item_id := v_pool[1 + floor(v_u_item * array_length(v_pool, 1))::int];
      select * into v_item from public.items where id = v_item_id;

      v_u_st := public.fair_uniform(v_seed, p_client_seed, v_current_nonce, 2);
      v_st := v_item.stattrak_eligible and v_u_st < 0.1;

      v_u_float := public.fair_uniform(v_seed, p_client_seed, v_current_nonce, 3);
      v_float := round((v_item.min_float + v_u_float * (v_item.max_float - v_item.min_float))::numeric, 3);
      v_wear := case
        when v_float < 0.07 then 'FN'
        when v_float < 0.15 then 'MW'
        when v_float < 0.38 then 'FT'
        when v_float < 0.45 then 'WW'
        else 'BS'
      end;

      v_price := coalesce((v_item.prices ->> v_wear)::numeric, (v_item.prices ->> 'price')::numeric, v_item.base_price);
      if v_st then v_price := v_price * v_item.stattrak_multiplier; end if;
      v_price := round(v_price, 2);

      insert into public.inventory_items
        (telegram_user_id, user_id, item_id, wear, float_value, stattrak, price, source, meta)
      values (p_telegram_user_id, v_user, v_item_id, v_wear, v_float, v_st, v_price, 'case', '{}'::jsonb)
      returning id into v_inv_id;
      v_inventory_ids := array_append(v_inventory_ids, v_inv_id);

      insert into public.rolls
        (telegram_user_id, user_id, context, case_id, server_seed_hash, client_seed, nonce,
         digest_hex, roll_value, result_item_id, rarity, wear, float_value, stattrak, price, idempotency_key)
      values (p_telegram_user_id, v_user, 'case', p_case_id, v_hash, p_client_seed, v_current_nonce,
              v_digest, v_u_rarity, v_item_id, v_rarity, v_wear, v_float, v_st, v_price, p_idempotency_key)
      returning id into v_roll_id;

      if p_auto_sell_below is not null and v_price <= p_auto_sell_below then
        delete from public.inventory_items where id = v_inv_id;
        v_credits := v_credits + v_price;
        v_auto_sold := array_append(v_auto_sold, v_inv_id);
        v_inventory_ids := array_remove(v_inventory_ids, v_inv_id);
        insert into public.transactions
          (user_id, telegram_user_id, type, amount, reason, ref_id, balance_after, idempotency_key)
        values (v_user, p_telegram_user_id, 'credit', v_price, 'auto_sell', v_inv_id,
                v_wallet.balance - v_cost + v_credits, p_idempotency_key || ':sell:' || i::text);
      end if;

      v_rolls := v_rolls || jsonb_build_array(jsonb_build_object(
        'roll_id', v_roll_id,
        'item_id', v_item_id,
        'name', v_item.name,
        'rarity', v_rarity,
        'wear', v_wear,
        'float_value', v_float,
        'stattrak', v_st,
        'price', to_char(v_price, 'FM999999999999999990.00'),
        'server_seed_hash', v_hash,
        'nonce', v_current_nonce,
        'digest_hex', v_digest
      ));
    end;
  end loop;

  v_balance := v_wallet.balance - v_cost + v_credits;
  insert into public.transactions
    (user_id, telegram_user_id, type, amount, reason, ref_id, balance_after, idempotency_key)
  values (v_user, p_telegram_user_id, 'debit', v_cost, 'case_open', null, v_balance, p_idempotency_key);

  update public.wallets set
    balance = v_balance,
    lifetime_spent = lifetime_spent + v_cost,
    lifetime_earned = lifetime_earned + v_credits,
    wagered = wagered + v_cost
  where user_id = v_user;

  declare v_response jsonb := jsonb_build_object(
    'rolls', v_rolls,
    'balance_after', to_char(v_balance, 'FM999999999999999990.00'),
    'inventory_item_ids', to_jsonb(v_inventory_ids),
    'auto_sold', to_jsonb(v_auto_sold)
  );
  begin
    insert into public.idempotency_keys (key, telegram_user_id, response)
    values (p_idempotency_key, p_telegram_user_id, v_response);
    return v_response;
  end;
end
$$;

-- --- Продажа ----------------------------------------------------------------
create or replace function public.sell_items(
  p_telegram_user_id bigint, p_ids uuid[], p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cached jsonb; v_user uuid; v_total numeric(20,2) := 0; v_balance numeric(20,2); v_locked int;
begin
  perform pg_advisory_xact_lock(hashtext(p_idempotency_key));
  select response into v_cached from public.idempotency_keys
    where key = p_idempotency_key and telegram_user_id = p_telegram_user_id;
  if found then return v_cached; end if;

  select id into v_user from public.users where telegram_user_id = p_telegram_user_id;
  select balance into v_balance from public.wallets
    where telegram_user_id = p_telegram_user_id for update;
  select count(*) into v_locked from public.inventory_items
    where id = any(p_ids) and telegram_user_id = p_telegram_user_id and locked;
  if v_locked > 0 then raise exception 'ITEM_LOCKED'; end if;

  select coalesce(sum(price), 0) into v_total from public.inventory_items
    where id = any(p_ids) and telegram_user_id = p_telegram_user_id;
  delete from public.inventory_items where id = any(p_ids) and telegram_user_id = p_telegram_user_id;

  v_balance := v_balance + v_total;
  update public.wallets set balance = v_balance, lifetime_earned = lifetime_earned + v_total
    where user_id = v_user;
  insert into public.transactions
    (user_id, telegram_user_id, type, amount, reason, balance_after, idempotency_key)
  values (v_user, p_telegram_user_id, 'credit', v_total, 'item_sell', v_balance, p_idempotency_key);

  declare v_response jsonb := jsonb_build_object(
    'count', array_length(p_ids, 1), 'total', to_char(v_total, 'FM999999999999999990.00'),
    'balance_after', to_char(v_balance, 'FM999999999999999990.00'));
  begin
    insert into public.idempotency_keys (key, telegram_user_id, response)
    values (p_idempotency_key, p_telegram_user_id, v_response);
    return v_response;
  end;
end
$$;

create or replace function public.mass_sell(
  p_telegram_user_id bigint, p_max_price numeric, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.inventory_items
    where telegram_user_id = p_telegram_user_id and price <= p_max_price and not locked;
  if v_ids is null then return jsonb_build_object('count', 0, 'total', '0.00'); end if;
  return public.sell_items(p_telegram_user_id, v_ids, p_idempotency_key);
end
$$;

-- --- Stars: выдача ТОЛЬКО после successful_payment -------------------------
create or replace function public.grant_entitlement(
  p_invoice_payload text, p_charge_id text, p_raw jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.star_payments%rowtype;
  v_user uuid;
  v_entitlement uuid;
begin
  select * into v_payment from public.star_payments
    where invoice_payload = p_invoice_payload for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_payment.status = 'paid' then
    return jsonb_build_object('status', 'already_paid', 'payment_id', v_payment.id);
  end if;
  if p_charge_id is null or p_charge_id = '' then raise exception 'VALIDATION_ERROR'; end if;

  update public.star_payments set
    status = 'paid', telegram_payment_charge_id = p_charge_id,
    raw = p_raw, paid_at = now()
  where id = v_payment.id;

  select id into v_user from public.users where telegram_user_id = v_payment.telegram_user_id;
  insert into public.entitlements
    (user_id, telegram_user_id, sku, source, telegram_payment_charge_id, meta)
  values (v_user, v_payment.telegram_user_id, v_payment.sku, 'stars', p_charge_id, '{}'::jsonb)
  on conflict (telegram_payment_charge_id) where telegram_payment_charge_id is not null do nothing
  returning id into v_entitlement;

  insert into public.payment_events (event_type, payload)
  values ('successful_payment', jsonb_build_object('payment_id', v_payment.id, 'charge_id', p_charge_id));
  insert into public.audit_log (actor, action, entity, entity_id, after)
  values ('telegram', 'grant_entitlement', 'star_payments', v_payment.id::text,
          jsonb_build_object('sku', v_payment.sku, 'charge_id', p_charge_id));

  return jsonb_build_object('status', 'paid', 'payment_id', v_payment.id, 'entitlement_id', v_entitlement);
end
$$;

create or replace function public.revoke_entitlement(p_charge_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.entitlements set revoked_at = now() where telegram_payment_charge_id = p_charge_id;
  update public.star_payments set status = 'refunded', refunded_at = now()
    where telegram_payment_charge_id = p_charge_id;
  insert into public.payment_events (event_type, payload)
  values ('refunded_payment', jsonb_build_object('charge_id', p_charge_id));
end
$$;

-- --- Сервисные задачи (pg_cron, 0011) --------------------------------------
create or replace function public.rotate_server_seeds()
returns void language plpgsql security definer set search_path = '' as $$
declare v_new_seed text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  update public.server_seeds set active = false, revealed_at = now() where active;
  insert into public.server_seeds (seed, seed_hash) values (v_new_seed, public.fair_seed_hash(v_new_seed));
end
$$;

-- D-02: ботов не создаём; ставка не списывалась до starting, достаточно отмены.
create or replace function public.cancel_expired_battles()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  with cancelled as (
    update public.case_battles set state = 'cancelled', finished_at = now()
    where state = 'waiting' and expires_at < now()
    returning id
  ) select count(*) into v_count from cancelled;
  return v_count;
end
$$;

create or replace function public.reset_daily_quests()
returns void language sql security definer set search_path = '' as $$
  delete from public.user_quests where quest_date < current_date - 30;
$$;

create or replace function public.process_supply_drops()
returns void language sql security definer set search_path = '' as $$
  update public.supply_drops set next_at = now() where next_at < now() - interval '1 day';
$$;

-- --- Права: денежные RPC — ТОЛЬКО service_role -----------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'fair_digest(text,text,bigint,int)', 'fair_uniform(text,text,bigint,int)',
    'fair_seed_hash(text)', 'active_server_seed()',
    'ensure_user(bigint,text,text,text,text)', 'get_me()', 'consume_query_id(text,bigint)',
    'open_case(bigint,text,int,text,text,numeric)',
    'sell_items(bigint,uuid[],text)', 'mass_sell(bigint,numeric,text)',
    'grant_entitlement(text,text,jsonb)', 'revoke_entitlement(text)',
    'rotate_server_seeds()', 'cancel_expired_battles()',
    'reset_daily_quests()', 'process_supply_drops()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end
$$;

grant execute on function public.get_me() to authenticated, service_role;
grant execute on function public.fair_seed_hash(text) to authenticated, service_role;
do $$
declare f text;
begin
  foreach f in array array[
    'fair_digest(text,text,bigint,int)', 'fair_uniform(text,text,bigint,int)',
    'active_server_seed()', 'ensure_user(bigint,text,text,text,text)', 'consume_query_id(text,bigint)',
    'open_case(bigint,text,int,text,text,numeric)',
    'sell_items(bigint,uuid[],text)', 'mass_sell(bigint,numeric,text)',
    'grant_entitlement(text,text,jsonb)', 'revoke_entitlement(text)',
    'rotate_server_seeds()', 'cancel_expired_battles()',
    'reset_daily_quests()', 'process_supply_drops()'
  ] loop
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end
$$;
