/**
 * Единые константы продукта. Значения, помеченные INTERIM, зафиксированы в
 * docs/08-game-logic.md и docs/14-open-questions.md §5 до ответов Q-04…Q-07.
 * Правка любого числа из экономики = новый ADR + строка в 13-changelog.md.
 */

export const PRICE_SNAPSHOT_ID = '2026-11-05-skinport' as const;
export const PRICE_SNAPSHOT_DATE = '2026-11-05' as const;

/** INTERIM [Q-07]: стартовый баланс и стартовый набор. */
export const STARTING_BALANCE = 10 as const;
export const STARTING_FREE_CASES = 3 as const;
export const DAILY_FREE_SPINS = 1 as const;

/** INTERIM [Q-04]: официальные вероятности CS2, сумма = 1.0. */
export const RARITY_WEIGHTS = {
  mil_spec: 0.7992,
  restricted: 0.1598,
  classified: 0.032,
  covert: 0.0064,
  rare_special: 0.0026,
} as const;

export type RarityKey = keyof typeof RARITY_WEIGHTS;

export const RARITY_ORDER = [
  'consumer',
  'industrial',
  'mil_spec',
  'restricted',
  'classified',
  'covert',
  'rare_special',
] as const;

export type Rarity = (typeof RARITY_ORDER)[number];

export const RARITY_COLORS: Record<Rarity, string> = {
  consumer: '#B0C3D9',
  industrial: '#5E98D9',
  mil_spec: '#4B69FF',
  restricted: '#8847FF',
  classified: '#D32CE6',
  covert: '#EB4B4B',
  rare_special: '#F5C542',
};

export const STATTRAK_COLOR = '#CF6A32';
export const STATTRAK_CHANCE = 0.1;
export const STATTRAK_MULTIPLIER = 2.0;

/** INTERIM [Q-04]: границы wear по float. */
export const WEAR_RANGES = [
  { wear: 'FN', min: 0, max: 0.07 },
  { wear: 'MW', min: 0.07, max: 0.15 },
  { wear: 'FT', min: 0.15, max: 0.38 },
  { wear: 'WW', min: 0.38, max: 0.45 },
  { wear: 'BS', min: 0.45, max: 1 },
] as const;

export type Wear = (typeof WEAR_RANGES)[number]['wear'];
export const WEAR_ORDER: readonly Wear[] = WEAR_RANGES.map((r) => r.wear);

/** Скидка boost.caseDiscount: 35 % на обычные кейсы, НЕ на чёрный рынок/капсулы. */
export const CASE_DISCOUNT = 0.35;
export const AUTO_OPENER_SELL_PERCENT = 0.65;
export const AUTO_OPENER_INTERVAL_MINUTES = 5;
export const AUTO_OPENER_SLOTS = 5;

export const OPEN_COUNTS = [1, 2, 3, 5, 6] as const;
export const MASS_OPEN_LIMIT = 200;
export const MASS_OPEN_LIMIT_OVERDRIVE = 1000;

/** INTERIM [Q-05]: XP-кривая xp(n)=round(1440*n^1.35). */
export function xpForLevel(level: number): number {
  return Math.round(1440 * Math.pow(level, 1.35));
}

/** 22 игры из reference/flags.json + level-gates по docs/08-game-logic.md §5. */
export const GAMES = [
  { key: 'coinflip', ru: 'КОИНФЛИП', level: 1, rtp: 0.97 },
  { key: 'roulette', ru: 'РУЛЕТКА', level: 1, rtp: 0.973 },
  { key: 'tradeup', ru: 'ОБМЕН', level: 1, rtp: 0.97 },
  { key: 'casebattle', ru: 'БИТВА КЕЙСОВ', level: 2, rtp: 0.97 },
  { key: 'mines', ru: 'МИНЫ', level: 3, rtp: 0.97 },
  { key: 'plinko', ru: 'ПЛИНКО', level: 4, rtp: 0.97 },
  { key: 'upgrader', ru: 'АПГРЕЙД', level: 5, rtp: 0.95 },
  { key: 'ridethebus', ru: 'RIDE THE BUS', level: 9, rtp: 0.96 },
  { key: 'blackjack', ru: 'БЛЭКДЖЕК', level: 11, rtp: 0.975 },
  { key: 'cashclicker', ru: 'CASH CLICKER', level: 12, rtp: 0 },
  { key: 'crash', ru: 'КРАШ', level: 14, rtp: 0.97 },
  { key: 'tradedown', ru: 'РАЗМЕН', level: 14, rtp: 0.97 },
  { key: 'towers', ru: 'БАШНИ', level: 16, rtp: 0.96 },
  { key: 'scratch', ru: 'СКРЕТЧ-КАРТЫ', level: 18, rtp: 0.95 },
  { key: 'pool', ru: 'ПРИЗОВОЙ СЕЙФ', level: 19, rtp: 0.97 },
  { key: 'dice', ru: 'КОСТИ', level: 21, rtp: 0.97 },
  { key: 'pachinko', ru: 'ПАЧИНКО', level: 22, rtp: 0.96 },
  { key: 'hilo', ru: 'ХАЙ-ЛО', level: 23, rtp: 0.97 },
  { key: 'defuse', ru: 'РАЗМИНИРОВАНИЕ', level: 25, rtp: 0.97 },
  { key: 'rushb', ru: 'RUSH B', level: 26, rtp: 0.97 },
  { key: 'jackpot', ru: 'ДЖЕКПОТ', level: 1, rtp: 0.97 },
  { key: 'event', ru: 'ЕЖЕДНЕВНЫЙ СПИН', level: 1, rtp: 0 },
] as const;

export type GameKey = (typeof GAMES)[number]['key'];
export const GAME_KEYS: readonly GameKey[] = GAMES.map((g) => g.key);

export const TABS = ['cases', 'inventory', 'contracts', 'games', 'shop'] as const;
export type TabKey = (typeof TABS)[number];

export const CASE_TABS = ['cases', 'black_market', 'capsules'] as const;
export type CaseTabKey = (typeof CASE_TABS)[number];

export const INIT_DATA_TTL_SECONDS = 3600;
export const AUTH_JWT_TTL_SECONDS = 3600;
export const IDEMPOTENCY_TTL_HOURS = 24;
export const RATE_LIMIT_PER_MINUTE = 120;
export const RATE_LIMIT_OPENINGS_PER_SECOND = 10;
export const RATE_LIMIT_INVOICES_PER_MINUTE = 5;

export const XTR_CURRENCY = 'XTR' as const;

export const DISCLAIMER_RU =
  'Симулятор. Реальные деньги не используются. Виртуальные предметы не выводятся, ' +
  'не обмениваются и не имеют денежной стоимости. Не является азартной игрой. 18+';
