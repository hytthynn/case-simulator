-- 0010 · Realtime: Postgres Changes ТОЛЬКО для персональных данных,
-- массовые события идут через Broadcast (docs/06-api.md §11, 15).
--
-- ВАЖНО: на hosted/local Supabase публикация `supabase_realtime` и таблица
-- `realtime.messages` принадлежат служебным ролям (supabase_admin,
-- supabase_realtime_admin). ALTER PUBLICATION / CREATE POLICY от имени роли
-- миграций может упасть с "must be owner of ...". Realtime — улучшение, а не
-- ядро экономики: каждое такое действие завернуто в exception handler, чтобы
-- миграция НИКОГДА не ломала накат схемы.
set search_path = public;

do $$
declare t text;
begin
  begin
    if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
      execute 'create publication supabase_realtime';
    end if;
  exception when others then
    raise notice 'Realtime: не удалось создать публикацию (%); пропущено', sqlerrm;
  end;

  foreach t in array array['users','wallets','inventory_items','entitlements','notifications'] loop
    begin
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    exception when others then
      raise notice 'Realtime: public.% не добавлена в публикацию (%); пропущено', t, sqlerrm;
    end;
  end loop;
end
$$;

-- Наши собственные таблицы: replica identity доступна владельцу всегда.
alter table public.wallets replica identity full;
alter table public.entitlements replica identity full;

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'Realtime: схема realtime отсутствует — broadcast-политика пропущена';
    return;
  end if;
  begin
    execute 'alter table realtime.messages enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'realtime' and tablename = 'messages' and policyname = 'chat_read'
    ) then
      execute $policy$
        create policy chat_read on realtime.messages for select to authenticated
        using (extension = 'broadcast' and topic like 'chat:%')
      $policy$;
    end if;
  exception when others then
    raise notice 'Realtime: broadcast-политика не создана (%); включите вручную в Dashboard', sqlerrm;
  end;
end
$$;
