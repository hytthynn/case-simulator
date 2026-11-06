-- 0006 · Социалка: друзья, подарки, рефералы, чат, уведомления.
set search_path = public;

create table public.friends (
  user_id bigint not null,
  friend_id bigint not null,
  telegram_user_id bigint not null,
  nickname text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_id bigint not null,
  to_id bigint not null,
  telegram_user_id bigint not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  from_id bigint not null,
  to_id bigint not null,
  telegram_user_id bigint not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  opened_at timestamptz
);
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_id bigint not null,
  invitee_id bigint not null,
  telegram_user_id bigint not null,
  invitee_level int not null default 1,
  reward numeric(20,2) not null default 0,
  paid_at timestamptz,
  unique (inviter_id, invitee_id)
);
create table public.chat_messages (
  id bigserial primary key,
  channel text not null default 'global',
  telegram_user_id bigint not null,
  text text not null,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index chat_messages_recent_idx on public.chat_messages (channel, created_at desc);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (telegram_user_id, created_at desc);
