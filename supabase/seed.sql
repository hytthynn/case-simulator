-- Supabase seed. Статические справочники + сгенерированный снимок цен.
-- Перед `supabase db reset` выполнить: pnpm db:seed:generate
-- (создаёт supabase/seed-data.sql из docs/reference/, D-04).
set search_path = public;

-- INTERIM [Q-04]: официальные веса CS2. Сумма = 1.0.
insert into public.rarity_config (rarity, weight, color_hex, sort_order) values
  ('consumer',     0,       '#B0C3D9', 1),
  ('industrial',   0,       '#5E98D9', 2),
  ('mil_spec',     0.7992,  '#4B69FF', 3),
  ('restricted',   0.1598,  '#8847FF', 4),
  ('classified',   0.0320,  '#D32CE6', 5),
  ('covert',       0.0064,  '#EB4B4B', 6),
  ('rare_special', 0.0026,  '#F5C542', 7)
on conflict (rarity) do update set weight = excluded.weight, color_hex = excluded.color_hex;

-- INTERIM [Q-06]: прайс XTR, docs/09-monetization.md §2. D-01: без продажи валюты.
insert into public.sku_catalog (sku, kind, title_ru, amount_xtr, sort_order) values
  ('pack.arcade','cosmetic','Аркадный профиль',250,10),
  ('pack.blood','cosmetic','Кровавый профиль',250,11),
  ('pack.deepSpace','cosmetic','Космический профиль',250,12),
  ('pack.neon','cosmetic','Неоновый набор',250,13),
  ('pack.smoke','cosmetic','Дымный набор',250,14),
  ('pack.void','cosmetic','Профиль Void',250,15),
  ('agent.1','cosmetic','Агент 01',100,20),
  ('agent.2','cosmetic','Агент 02',100,21),
  ('agent.3','cosmetic','Агент 03',100,22),
  ('border.neon','cosmetic','Рамка Neon',80,23),
  ('fx.aurora','cosmetic','Эффект Aurora',120,24),
  ('fx.laser','cosmetic','Эффект Laser',120,25),
  ('showcase.slot','cosmetic','+1 слот витрины',60,26),
  ('boost.noAds','convenience','Без пауз навсегда',300,30),
  ('boost.quickOpen','convenience','Быстрое открытие',150,31),
  ('boost.multiOpen','convenience','Мульти-открытие',200,32),
  ('boost.massOpen','convenience','Массовое открытие',250,33),
  ('boost.massOpenOverdrive','convenience','Массовое открытие 1000',400,34),
  ('boost.autoOpenerPro','convenience','Автооткрыватель Pro',350,35),
  ('boost.autoOpenerOverdrive','convenience','Автооткрыватель Overdrive',300,36),
  ('boost.xp','convenience','+50 % опыта',200,37),
  ('boost.maxBet','convenience','Макс. ставка +$20 000',350,38),
  ('boost.caseDiscount','convenience','−35 % на обычные кейсы',300,39),
  ('boost.vaultSlot','convenience','Слот хранилища',150,40),
  ('boost.betterSupplyDrop','convenience','Улучшенное снабжение',250,41),
  ('boost.stickerRemover','convenience','Снятие наклейки',80,42),
  ('boost.bountyHunter','convenience','Bounty Hunter',250,43),
  ('boost.highRoller','convenience','High Roller',350,44),
  ('boost.eventWheel','convenience','Дополнительные спины',150,45),
  ('unlock.games','convenience','Все игры сразу',500,46),
  ('unlock.cases','convenience','Премиум-кейсы сразу',500,47),
  ('bundle.ultimate','bundle','Ultimate Bundle',2500,99)
on conflict (sku) do update set amount_xtr = excluded.amount_xtr, title_ru = excluded.title_ru;

-- INTERIM [Q-05]: xp(n)=round(1440*n^1.35), потолок ставки растёт линейно.
insert into public.level_curve (level, xp_required, max_bet, reward)
select n,
       round(1440 * power(n, 1.35))::bigint,
       (1000 + (n - 1) * 100)::numeric(20,2),
       '{}'::jsonb
from generate_series(1, 26) as g(n)
on conflict (level) do nothing;

-- A-14: собственный набор флагов для TMA (оригинал ?platform=android).
insert into public.admin_flags (key, value) values
  ('platform', '"tma"'),
  ('min_client_version', '"0.2.0"'),
  ('maintenance', 'false'),
  ('chat_rate_limit_seconds', '2'),
  ('auto_opener_interval_minutes', '5'),
  ('auto_opener_sell_percent', '65'),
  ('referral_signup_bonus', '1000'),
  ('account_delete_cooldown_hours', '4')
on conflict (key) do nothing;

insert into public.quest_definitions (code, type, params, rewards, weight) values
  ('open_20_cases','daily','{"target":20}','{"cash":5,"xp":100}',10),
  ('open_100_cases','daily','{"target":100}','{"cash":20,"xp":400}',5),
  ('open_3_covert_cases','daily','{"target":3}','{"cases":3}',3),
  ('claim_3_supply_drops','daily','{"target":3}','{"cash":10}',5),
  ('tutorial_contract','contract','{}','{"cash":10,"cases":3}',100)
on conflict (code) do nothing;

-- Стартовый активный сид provably-fair создаётся лениво в active_server_seed().

-- 14 945 предметов, 241 кейс, price_entries и фича-флаги из снимков.
\ir seed-data.sql
