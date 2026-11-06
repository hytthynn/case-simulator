/**
 * Provably fair (commit–reveal), docs/07-security.md §4.
 *
 * ВНИМАНИЕ: этот модуль — СЕРВЕРНАЯ игровая логика. Импорт в `apps/web`
 * запрещён и проверяется `infra/scripts/docs-lint.mjs`. Клиент получает только
 * готовый результат и, после ротации сида, может проверить sha256(server_seed).
 *
 * Никакого Math.random(): только crypto.randomBytes + HMAC-SHA256.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  RARITY_WEIGHTS,
  STATTRAK_MULTIPLIER,
  WEAR_RANGES,
  type RarityKey,
  type Wear,
} from './constants.js';

export interface FairRoll {
  /** Порядковый номер запроса игрока (монотонен, хранится в rolls.nonce). */
  nonce: number;
  /** Счётчик производных значений внутри одного ролла. */
  counter: number;
  digestHex: string;
  /** Равномерное значение из [0, 1). */
  value: number;
}

export function generateServerSeed(): string {
  return randomBytes(32).toString('hex');
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/** digest = HMAC_SHA256(key = server_seed, msg = "<client_seed>:<nonce>[:<counter>]") */
export function digestHex(serverSeed: string, clientSeed: string, nonce: number, counter = 0): string {
  const message = counter === 0 ? `${clientSeed}:${nonce}` : `${clientSeed}:${nonce}:${counter}`;
  return createHmac('sha256', serverSeed).update(message).digest('hex');
}

/** u32 = первые 4 байта digest, value = u32 / 2^32. */
export function uniformFromDigest(hex: string): number {
  return parseInt(hex.slice(0, 8), 16) / 2 ** 32;
}

export function deriveUniform(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  counter = 0,
): FairRoll {
  const hex = digestHex(serverSeed, clientSeed, nonce, counter);
  return { nonce, counter, digestHex: hex, value: uniformFromDigest(hex) };
}

/** Детерминированный поток значений для одного ролла (редкость, предмет, float, ST). */
export function uniformStream(serverSeed: string, clientSeed: string, nonce: number, count: number): FairRoll[] {
  return Array.from({ length: count }, (_, counter) => deriveUniform(serverSeed, clientSeed, nonce, counter));
}

/** Проверка игроком: sha256(раскрытого сида) == опубликованный до раунда хеш. */
export function verifySeedHash(serverSeed: string, publishedHash: string): boolean {
  const actual = Buffer.from(sha256Hex(serverSeed), 'utf8');
  const expected = Buffer.from(publishedHash, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Выбор по накопленным весам. Входное значение из [0,1). */
export function pickByWeights<T extends string>(value: number, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) throw new Error('Сумма весов дропа должна быть положительной');
  let acc = 0;
  const scaled = Math.min(Math.max(value, 0), 0.999999999999) * total;
  for (const [key, weight] of entries) {
    acc += weight;
    if (scaled < acc) return key;
  }
  return entries[entries.length - 1]![0];
}

export function selectRarity(value: number): RarityKey {
  return pickByWeights(value, RARITY_WEIGHTS as Record<RarityKey, number>);
}

export function wearFromFloat(value: number): Wear {
  const clamped = Math.min(Math.max(value, 0), 1);
  for (const range of WEAR_RANGES) {
    if (clamped < range.max) return range.wear;
  }
  return 'BS';
}

export type ItemPrices = Record<string, number | undefined> & { price?: number };

/** Цена фиксируется на момент ролла в rolls.price (D-04). */
export function resolvePrice(prices: ItemPrices, wear: Wear | null, stattrak: boolean): number {
  const base = (wear ? prices[wear] : undefined) ?? prices.price ?? 0;
  return roundMoney(base * (stattrak ? STATTRAK_MULTIPLIER : 1));
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatVirtualMoney(value: number): string {
  return roundMoney(value).toFixed(2);
}
