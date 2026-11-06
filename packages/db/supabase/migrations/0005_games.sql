-- 0005 · Онлайн-раунды и PvP-битвы (D-02: только живые игроки).
set search_path = public;

create table public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  game text not null,
  state text not null default 'betting' check (state in ('betting','starting','running','settled','cancelled')),
  seed_hash text not null,
  server_seed text,
  config jsonb not null default '{}'::jsonb,
  result jsonb,
  starts_at timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index game_rounds_state_idx on public.game_rounds (game, state, created_at desc);

create table public.game_bets (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.game_rounds(id),
  telegram_user_id bigint not null,
  stake_amount numeric(20,2) not null default 0,
  stake_items jsonb not null default '[]'::jsonb,
  client_seed text not null,
  nonce bigint not null,
  payout numeric(20,2) not null default 0,
  result jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (telegram_user_id, idempotency_key)
);
create index game_bets_round_idx on public.game_bets (round_id);

create table public.case_battles (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('classic','fast','shared','reverse','clutch','terminal')),
  state text not null default 'waiting' check (state in ('waiting','starting','running','settled','cancelled')),
  case_ids jsonb not null default '[]'::jsonb,
  creator_id bigint not null,
  max_players int not null default 2 check (max_players between 2 and 3),
  entry_fee numeric(20,2) not null default 0,
  seed_hash text,
  server_seed text,
  winner_id bigint,
  result jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index case_battles_state_idx on public.case_battles (state, expires_at);

create table public.battle_players (
  battle_id uuid not null references public.case_battles(id) on delete cascade,
  telegram_user_id bigint not null,
  slot int not null,
  total_value numeric(20,2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  joined_at timestamptz not null default now(),
  primary key (battle_id, telegram_user_id)
);

create table public.battle_rolls (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.case_battles(id) on delete cascade,
  telegram_user_id bigint not null,
  case_index int not null,
  item jsonb not null,
  price numeric(20,2) not null default 0,
  created_at timestamptz not null default now()
);
