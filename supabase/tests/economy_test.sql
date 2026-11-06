-- pgTAP: идемпотентность, provably-fair, отсутствие двойного списания.
begin;
select plan(7);

select public.ensure_user(920001, 'tester', 'Tester', null, 'ru');
insert into public.cases (id, name, kind, image_url, base_price, key_price, section)
values ('pgtap-case', 'PGTAP Case', 'case', 'catalog/cases/pgtap.png', 1.00, 0, 'cases')
on conflict (id) do nothing;

select is(
  public.fair_digest('a'::text, 'seed'::text, 7::bigint, 0::int),
  public.fair_digest('a'::text, 'seed'::text, 7::bigint, 0::int),
  'HMAC-диджест детерминирован'
);
select ok(
  public.fair_digest('a'::text, 'seed'::text, 7::bigint, 0::int)
    <> public.fair_digest('a'::text, 'seed'::text, 8::bigint, 0::int),
  'смена nonce меняет результат'
);
select is(
  public.fair_seed_hash(public.fair_digest('a'::text, 's'::text, 1::bigint, 0::int)),
  encode(extensions.digest(public.fair_digest('a'::text, 's'::text, 1::bigint, 0::int), 'sha256'), 'hex'),
  'sha256(server_seed) совпадает с публикуемым хешем'
);

select ok(public.open_case(920001, 'pgtap-case', 1, 'client-seed', '11111111-1111-4111-8111-111111111111') is not null,
  'открытие кейса возвращает готовый ролл');

select is(
  public.open_case(920001, 'pgtap-case', 1, 'client-seed', '11111111-1111-4111-8111-111111111111'),
  public.open_case(920001, 'pgtap-case', 1, 'client-seed', '11111111-1111-4111-8111-111111111111'),
  'повтор idempotency_key возвращает сохранённый ответ'
);

select is(
  (select count(*)::int from public.rolls where telegram_user_id = 920001),
  1,
  'повтор запроса не создаёт новый ролл'
);

select is(
  (select balance::text from public.wallets where telegram_user_id = 920001),
  '9.00',
  'баланс списан ровно один раз'
);

select * from finish();
rollback;
