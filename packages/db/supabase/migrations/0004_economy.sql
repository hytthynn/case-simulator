-- 0004 · Append-only ядро экономики + сиды provably-fair, docs/05-database.md §4.
set search_path = public;

-- Commit–reveal: hash публикуется ДО раунда, сид раскрывается после ротации.
create table public.server_seeds (
  id uuid primary key default gen_random_uuid(),
  seed text not null,
  seed_hash text unique not null,
  active boolean not null default true,
  revealed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index server_seeds_one_active on public.server_seeds (active) where active;

create table public.transactions (
  id bigserial primary key,
  user_id uuid not null,
  telegram_user_id bigint not null,
  type text not null check (type in ('credit','debit')),
  amount numeric(20,2) not null check (amount >= 0),
  reason text not null,
  ref_type text,
  ref_id uuid,
  balance_after numeric(20,2) not null,
  idempotency_key text,
  created_at timestamptz not null default now()
);
create index transactions_user_idx on public.transactions (telegram_user_id, created_at desc);
create unique index transactions_idem_unique
  on public.transactions (telegram_user_id, idempotency_key) where idempotency_key is not null;

create table public.rolls (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  user_id uuid not null,
  context text not null check (context in ('case','game','battle','event')),
  case_id text,
  game text,
  round_id uuid,
  battle_id uuid,
  server_seed_hash text not null,
  server_seed text,
  client_seed text not null,
  nonce bigint not null,
  digest_hex text not null,
  roll_value numeric(18,12) not null,
  result_item_id text,
  rarity text,
  wear text,
  float_value numeric(4,3),
  stattrak boolean not null default false,
  price numeric(20,2) not null default 0,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (telegram_user_id, idempotency_key, nonce)
);
create index rolls_user_idx on public.rolls (telegram_user_id, created_at desc);
create index rolls_case_idx on public.rolls (case_id, created_at desc);

-- rolls append-only: сид/результат нельзя изменить после коммита.
create or replace function public.rolls_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'rolls is append-only (docs/07-security.md §4)';
end
$$;
create trigger rolls_no_update before update on public.rolls
  for each row execute function public.rolls_immutable();
create trigger rolls_no_delete before delete on public.rolls
  for each row execute function public.rolls_immutable();

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  user_id uuid not null,
  item_id text not null references public.items(id),
  wear text,
  float_value numeric(4,3),
  stattrak boolean not null default false,
  price numeric(20,2) not null default 0,
  acquired_at timestamptz not null default now(),
  source text not null default 'case',
  source_roll uuid,
  locked boolean not null default false,
  vault_id uuid,
  meta jsonb not null default '{}'::jsonb
);
create index inventory_user_idx on public.inventory_items (telegram_user_id, acquired_at desc);
create index inventory_price_idx on public.inventory_items (telegram_user_id, price);

create table public.vaults (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  payout_rate numeric(6,4) not null default 0,
  status text not null default 'active',
  total_value numeric(20,2) not null default 0,
  paid_out numeric(20,2) not null default 0
);
create table public.vault_items (
  vault_id uuid not null references public.vaults(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  primary key (vault_id, inventory_item_id)
);

create table public.supply_drops (
  user_id uuid primary key,
  telegram_user_id bigint unique not null,
  next_at timestamptz not null default now(),
  streak int not null default 0,
  rank int not null default 0,
  claims_total int not null default 0,
  last_claimed_at timestamptz
);

create table public.daily_claims (
  telegram_user_id bigint not null,
  claim_date date not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  primary key (telegram_user_id, claim_date, kind)
);
create table public.event_spins (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  spin_date date not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (telegram_user_id, spin_date)
);
create table public.user_quests (
  user_id uuid not null,
  telegram_user_id bigint not null,
  quest_code text not null,
  quest_date date not null,
  progress int not null default 0,
  completed_at timestamptz,
  claimed_at timestamptz,
  primary key (user_id, quest_code, quest_date)
);
