-- 0002 · Справочники (read-only для клиента), docs/05-database.md §2.
set search_path = public;

create table public.rarity_config (
  rarity text primary key,
  weight numeric(9,6) not null default 0 check (weight >= 0),
  color_hex text not null,
  sort_order int not null
);

create table public.cases (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('case','capsule','souvenir','black_market')),
  image_url text not null default '',
  base_price numeric(20,2) not null default 0 check (base_price >= 0),
  key_price numeric(20,2) not null default 0 check (key_price >= 0),
  min_level int not null default 1 check (min_level >= 1),
  section text not null default 'cases',
  sort_order int not null default 0,
  enabled boolean not null default true,
  free_claims_per_day int not null default 0,
  cooldown_seconds int not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index cases_section_sort_idx on public.cases (section, sort_order);

create table public.items (
  id text primary key,
  name text not null,
  weapon text,
  skin text,
  collection text,
  type text not null default 'skin' check (type in ('skin','knife','glove','sticker','agent','package')),
  rarity text not null references public.rarity_config(rarity),
  image_url text not null default '',
  stattrak_eligible boolean not null default false,
  min_float numeric(4,3) not null default 0 check (min_float >= 0),
  max_float numeric(4,3) not null default 1 check (max_float <= 1),
  prices jsonb not null default '{}'::jsonb,
  base_price numeric(20,2) not null default 0 check (base_price >= 0),
  stattrak_multiplier numeric(4,2) not null default 2.0,
  created_at timestamptz not null default now()
);
create index items_rarity_idx on public.items (rarity);
create index items_type_idx on public.items (type);

-- INTERIM [Q-04/Q-12]: точные веса внутри кейса не восстановлены из Dart AOT.
-- case_drop_pool заполняется на этапе 2 после разбора CDN; до тех пор open_case
-- использует детерминированный fallback по rarity (см. 0009_functions.sql).
create table public.case_drop_pool (
  case_id text not null references public.cases(id) on delete cascade,
  item_id text not null references public.items(id) on delete cascade,
  rarity text not null references public.rarity_config(rarity),
  weight numeric(12,6) not null default 1 check (weight > 0),
  stattrak_chance numeric(6,5) not null default 0.1,
  primary key (case_id, item_id)
);
create index case_drop_pool_lookup_idx on public.case_drop_pool (case_id, rarity);

-- D-04: фиксированный снимок цен 05.11.2026. Ежедневного импорта НЕТ.
create table public.price_snapshots (
  id text primary key,
  captured_at date not null,
  source text not null,
  item_count int not null default 0,
  checksum text not null,
  meta jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now()
);
create table public.price_entries (
  snapshot_id text not null references public.price_snapshots(id) on delete cascade,
  item_id text not null,
  prices jsonb not null,
  primary key (snapshot_id, item_id)
);

create table public.sku_catalog (
  sku text primary key,
  kind text not null check (kind in ('cosmetic','convenience','bundle')),
  title_ru text not null,
  title_en text,
  amount_xtr int not null check (amount_xtr > 0),
  payload jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order int not null default 0,
  preview_url text
);
-- Инвариант D-01 на уровне БД: запрещены SKU с продажей валюты/шансов.
alter table public.sku_catalog add constraint sku_no_cash_sale
  check (sku not like 'buy.cash%' and sku not like '%odds%' and sku not like '%withdraw%');

create table public.admin_flags (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by bigint
);

create table public.level_curve (
  level int primary key check (level >= 1),
  xp_required bigint not null,
  max_bet numeric(20,2) not null default 1000,
  reward jsonb not null default '{}'::jsonb
);

create table public.quest_definitions (
  code text primary key,
  type text not null,
  params jsonb not null default '{}'::jsonb,
  rewards jsonb not null default '{}'::jsonb,
  active_from date,
  active_to date,
  weight int not null default 1
);
