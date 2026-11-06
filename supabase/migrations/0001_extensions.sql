-- 0001 · Расширения и базовые роли/функции auth.
-- pgcrypto живёт в схеме `extensions` и на Supabase, и в локальном Postgres:
-- SECURITY DEFINER RPC работают с search_path = '' и обращаются к
-- extensions.hmac/ digest / gen_random_bytes (схема фиксирована, без подмены).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if to_regprocedure('extensions.hmac(text,text,text)') is null then
    raise exception 'pgcrypto должен быть установлен в схеме extensions (hmac не найден)';
  end if;
end
$$;

-- Supabase предоставляет auth.jwt(); для «голого» Postgres создаём совместимый стаб,
-- чтобы миграции и pgTAP-тесты выполнялись и локально.
create schema if not exists auth;
do $$
begin
  if to_regprocedure('auth.jwt()') is null then
    execute $fn$
      create function auth.jwt() returns jsonb
      language sql stable
      as $body$
        select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
      $body$
    $fn$;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- Единая точка получения telegram_user_id из JWT (app_metadata, НЕ user_metadata).
create or replace function public.current_telegram_user_id()
returns bigint
language sql
stable
set search_path = ''
as $$
  select nullif(
    (select auth.jwt() -> 'app_metadata' ->> 'telegram_user_id'),
    ''
  )::bigint
$$;

-- RLS-политики вызывают auth.jwt() ОТ ИМЕНИ authenticated/anon, поэтому
-- права нужны явно: на некоторых сборках Supabase/local дефолтных grants нет.
grant usage on schema auth to anon, authenticated, service_role;
do $$
begin
  if to_regprocedure('auth.jwt()') is not null then
    execute 'grant execute on function auth.jwt() to anon, authenticated, service_role';
  end if;
end
$$;

revoke all on function public.current_telegram_user_id() from public;
grant execute on function public.current_telegram_user_id() to authenticated, service_role;
