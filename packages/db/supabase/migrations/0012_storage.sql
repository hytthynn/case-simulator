-- 0012 · Supabase Storage: публичный бакет `catalog` для ассетов 1:1 (D-03).
-- docs/00-ТЗ.md §18, docs/10-ops-deploy.md §6.
--
-- Схема URL:
--   VITE_CDN_BASE_URL = https://<ref>.supabase.co/storage/v1/object/public
--   image_url в БД    = catalog/cases/<name>.png | catalog/items/<name>.png
--   итог              = .../public/catalog/cases/<name>.png
-- Значит ВНУТРИ бакета ключ объекта = cases/... или items/... (БЕЗ префикса catalog/).
--
-- Все обращения к схеме storage завернуты в DO/EXECUTE: миграция безопасна и на
-- «голом» Postgres без Supabase Storage (тогда она просто пишет notice).
set search_path = public;

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Схема storage недоступна — бакет catalog пропущен (создайте в Supabase Dashboard)';
    return;
  end if;

  execute $sql$
    insert into storage.buckets (id, name, public)
    values ('catalog', 'catalog', true)
    on conflict (id) do update set public = true
  $sql$;

  -- Необязательные колонки есть не во всех версиях storage — ставим по наличию.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
  ) then
    execute 'update storage.buckets set file_size_limit = 52428800 where id = ''catalog''';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types'
  ) then
    execute $mime$
      update storage.buckets
      set allowed_mime_types = array['image/png','image/webp','image/avif','image/jpeg']
      where id = 'catalog'
    $mime$;
  end if;

  -- Публичное чтение каталога. Запись — ТОЛЬКО service_role (у него bypassrls),
  -- клиент ничего не загружает: RLS на storage.objects остаётся включённым.
  if to_regclass('storage.objects') is not null then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'catalog_public_read'
    ) then
      execute $policy$
        create policy catalog_public_read on storage.objects
        for select to public
        using (bucket_id = 'catalog')
      $policy$;
    end if;
  end if;

  raise notice 'Storage: бакет catalog готов (public read, запись только service_role)';
end
$$;
