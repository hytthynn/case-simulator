-- 0008 · RLS на 100 % таблиц public + revoke grants + точечные политики.
-- docs/05-database.md §1, docs/07-security.md §3, NFR-10.
set search_path = public;

-- 1. ВКЛЮЧАЕМ RLS НА КАЖДОЙ таблице (цикл защищает от «забытой» новой таблицы).
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from anon, authenticated', t.tablename);
  end loop;
end
$$;

revoke all on all sequences in schema public from anon, authenticated;
revoke all on all sequences in schema public from public;

-- 2. Справочники: только чтение, одинаково для всех авторизованных.
do $$
declare t text;
begin
  foreach t in array array[
    'rarity_config','cases','items','case_drop_pool','price_snapshots','price_entries',
    'sku_catalog','admin_flags','level_curve','quest_definitions'
  ] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy public_read on public.%I for select to authenticated using (true)', t);
  end loop;
end
$$;

-- 3. Персональные таблицы: доступны только строки текущего telegram_user_id.
--    Политика через current_telegram_user_id() (app_metadata, НЕ user_metadata).
do $$
declare t text;
begin
  foreach t in array array[
    'users','wallets','profiles','user_settings','entitlements','user_upgrade_tracks',
    'user_stats','device_storage_mirror','transactions','rolls','inventory_items',
    'vaults','supply_drops','daily_claims','event_spins','user_quests',
    'game_bets','battle_players','battle_rolls','star_payments','friends',
    'friend_requests','gifts','referrals','notifications'
  ] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy own_rows on public.%I for select to authenticated using ' ||
      '(public.current_telegram_user_id() = telegram_user_id)', t
    );
  end loop;
end
$$;

-- 4. Публичные состояния раундов/лобби: БЕЗ server_seed (column-level grants).
grant select (id, game, state, seed_hash, config, result, starts_at, started_at, finished_at, created_at)
  on public.game_rounds to authenticated;
create policy rounds_read on public.game_rounds for select to authenticated using (true);

grant select (id, mode, state, case_ids, creator_id, max_players, entry_fee, seed_hash,
              winner_id, result, expires_at, created_at, finished_at)
  on public.case_battles to authenticated;
create policy battles_read on public.case_battles for select to authenticated using (true);

grant select on public.chat_messages to authenticated;
create policy chat_read on public.chat_messages for select to authenticated using (not is_hidden);

grant select on public.vault_items to authenticated;
create policy vault_items_own on public.vault_items for select to authenticated using (
  exists (
    select 1 from public.vaults v
    where v.id = vault_id and v.telegram_user_id = public.current_telegram_user_id()
  )
);

-- 5. Серверные таблицы: НИКАКИХ grants клиенту (только service_role).
--    sessions, server_seeds, idempotency_keys, rate_limit_buckets, audit_log,
--    payment_events. Политик нет => доступ запрещён даже при включённом RLS.

-- 6. Денежные таблицы доступны клиенту ТОЛЬКО на чтение: ни INSERT/UPDATE/DELETE.
--    Запись исключительно через SECURITY DEFINER RPC (0009_functions.sql).
