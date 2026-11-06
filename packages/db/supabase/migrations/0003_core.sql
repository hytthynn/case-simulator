-- 0003 · Пользователь, кошелёк, профиль, entitlement, docs/05-database.md §3.
set search_path = public;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint unique not null,
  username text,
  first_name text,
  last_name text,
  photo_url text,
  language_code text not null default 'ru',
  is_premium boolean not null default false,
  referral_code text unique not null,
  referred_by bigint,
  level int not null default 1,
  xp bigint not null default 0,
  agent_id text,
  background_id text,
  border_id text,
  effect_id text,
  showcase jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  accepted_terms_at timestamptz,
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Anti-replay: query_id из провалидированного initData принимается один раз.
create table public.sessions (
  query_id text primary key,
  telegram_user_id bigint not null,
  used_at timestamptz not null default now()
);

create table public.wallets (
  user_id uuid primary key references public.users(id) on delete cascade,
  telegram_user_id bigint unique not null,
  balance numeric(20,2) not null default 0 check (balance >= 0),
  lifetime_earned numeric(20,2) not null default 0,
  lifetime_spent numeric(20,2) not null default 0,
  wagered numeric(20,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  telegram_user_id bigint unique not null,
  showcase jsonb not null default '[]'::jsonb,
  stats_visibility text not null default 'all'
);

create table public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  telegram_user_id bigint unique not null,
  sound boolean not null default true,
  haptics boolean not null default true,
  notifications jsonb not null default '{}'::jsonb,
  locale text not null default 'ru'
);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  telegram_user_id bigint not null,
  sku text not null references public.sku_catalog(sku),
  source text not null check (source in ('stars','admin','promo','quest')),
  telegram_payment_charge_id text,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  meta jsonb not null default '{}'::jsonb
);
create index entitlements_user_idx on public.entitlements (telegram_user_id, sku);
create unique index entitlements_charge_unique
  on public.entitlements (telegram_payment_charge_id) where telegram_payment_charge_id is not null;

create table public.user_upgrade_tracks (
  user_id uuid not null references public.users(id) on delete cascade,
  telegram_user_id bigint not null,
  track text not null check (track in ('supply_drop','auto_opener','xp_boost','max_bet','vault_slots')),
  level int not null default 0,
  primary key (user_id, track)
);

create table public.user_stats (
  user_id uuid primary key references public.users(id) on delete cascade,
  telegram_user_id bigint unique not null,
  jsonb_data jsonb not null default '{}'::jsonb
);

create table public.device_storage_mirror (
  user_id uuid primary key references public.users(id) on delete cascade,
  telegram_user_id bigint unique not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.idempotency_keys (
  key text primary key,
  telegram_user_id bigint not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
create index idempotency_user_idx on public.idempotency_keys (telegram_user_id, created_at);

create table public.rate_limit_buckets (
  key text primary key,
  tokens int not null,
  reset_at timestamptz not null
);

create table public.audit_log (
  id bigserial primary key,
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- updated_at для кошелька: любое изменение фиксируется сервером.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end
$$;
create trigger wallets_touch before update on public.wallets
  for each row execute function public.touch_updated_at();
