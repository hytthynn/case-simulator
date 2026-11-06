-- 0010 · Realtime: Postgres Changes ТОЛЬКО для персональных данных,
-- массовые события идут через Broadcast (docs/06-api.md §11, 15).
set search_path = public;

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;
  foreach t in array array['users','wallets','inventory_items','entitlements','notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

alter table public.wallets replica identity full;
alter table public.entitlements replica identity full;

-- Политика Broadcast для чата (если схема realtime доступна, т.е. Supabase).
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'alter table realtime.messages enable row level security';
    if not exists (
      select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'chat_read'
    ) then
      execute $policy$
        create policy chat_read on realtime.messages for select to authenticated
        using (extension = 'broadcast' and topic like 'chat:%')
      $policy$;
    end if;
  end if;
end
$$;
