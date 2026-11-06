-- pgTAP: RLS на 100 % таблиц и изоляция пользователей (docs/07-security.md §3).
begin;
select plan(7);

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'RLS включён на всех таблицах public'
);

select ok(
  not has_table_privilege('authenticated', 'public.wallets', 'INSERT'),
  'клиент не может писать в wallets'
);
select ok(
  not has_table_privilege('authenticated', 'public.rolls', 'UPDATE'),
  'клиент не может менять rolls'
);
select ok(
  not has_table_privilege('authenticated', 'public.transactions', 'DELETE'),
  'ledger append-only для клиента'
);
select ok(
  not has_table_privilege('anon', 'public.wallets', 'SELECT'),
  'anon не видит кошельки'
);
select ok(
  not has_table_privilege('authenticated', 'public.server_seeds', 'SELECT'),
  'сиды provably-fair недоступны клиенту'
);

select public.ensure_user(910001, 'alice', 'Alice', null, 'ru');
select public.ensure_user(910002, 'bob', 'Bob', null, 'ru');

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"telegram_user_id":"910001"}}';
select is(
  (select count(*)::int from public.wallets),
  1,
  'пользователь A видит только свой кошелёк'
);
reset role;

select * from finish();
rollback;
