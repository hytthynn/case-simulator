-- 0007 · Telegram Stars (XTR). Выдача entitlement ТОЛЬКО после successful_payment.
set search_path = public;

create table public.star_payments (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  sku text not null references public.sku_catalog(sku),
  amount_xtr int not null check (amount_xtr > 0),
  invoice_payload text unique not null,
  telegram_payment_charge_id text unique,  -- НЕ charge_id!
  provider_payment_charge_id text,
  status text not null default 'pending' check (status in ('pending','paid','refunded','failed')),
  raw jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  unique (telegram_user_id, idempotency_key)
);
create index star_payments_user_idx on public.star_payments (telegram_user_id, created_at desc);
create index star_payments_pending_idx on public.star_payments (status, created_at) where status = 'pending';

create table public.payment_events (
  id bigserial primary key,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  error text
);
