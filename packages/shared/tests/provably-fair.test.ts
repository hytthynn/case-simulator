import { describe, expect, it } from 'vitest';
import {
  deriveUniform,
  digestHex,
  formatVirtualMoney,
  pickByWeights,
  resolvePrice,
  selectRarity,
  sha256Hex,
  uniformStream,
  verifySeedHash,
  wearFromFloat,
  generateServerSeed,
} from '../src/provably-fair.js';
import { RARITY_WEIGHTS } from '../src/constants.js';

const SEED = 'a'.repeat(64);
const CLIENT_SEED = 'player-seed-42';

describe('provably fair', () => {
  it('публикуемый хеш совпадает с sha256(server_seed)', () => {
    const seed = generateServerSeed();
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySeedHash(seed, sha256Hex(seed))).toBe(true);
    expect(verifySeedHash(seed, sha256Hex('other'))).toBe(false);
  });

  it('digest детерминирован и меняется при изменении любого входа', () => {
    const a = digestHex(SEED, CLIENT_SEED, 7);
    expect(a).toBe(digestHex(SEED, CLIENT_SEED, 7));
    expect(a).not.toBe(digestHex(SEED, CLIENT_SEED, 8));
    expect(a).not.toBe(digestHex(SEED, 'another-seed', 7));
    expect(a).not.toBe(digestHex('b'.repeat(64), CLIENT_SEED, 7));
  });

  it('uniform лежит в [0,1) и поток стабилен', () => {
    const stream = uniformStream(SEED, CLIENT_SEED, 1, 8);
    expect(stream).toHaveLength(8);
    expect(new Set(stream.map((r) => r.digestHex)).size).toBe(8);
    for (const roll of stream) {
      expect(roll.value).toBeGreaterThanOrEqual(0);
      expect(roll.value).toBeLessThan(1);
    }
    expect(deriveUniform(SEED, CLIENT_SEED, 1, 0).digestHex).toBe(stream[0]!.digestHex);
  });

  it('веса дропа дают официальное распределение CS2', () => {
    const counts = new Map<string, number>();
    for (let nonce = 0; nonce < 20_000; nonce += 1) {
      const { value } = deriveUniform(SEED, CLIENT_SEED, nonce);
      const rarity = selectRarity(value);
      counts.set(rarity, (counts.get(rarity) ?? 0) + 1);
    }
    for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
      expect((counts.get(rarity) ?? 0) / 20_000).toBeCloseTo(weight, 2);
    }
  });

  it('pickByWeights никогда не выходит за границы', () => {
    expect(pickByWeights(0, { a: 1, b: 1 })).toBe('a');
    expect(pickByWeights(0.999999, { a: 1, b: 1 })).toBe('b');
    expect(() => pickByWeights(0.5, { a: 0, b: 0 })).toThrow();
  });

  it('wear и цена считаются по снимку, StatTrak ×2', () => {
    expect(wearFromFloat(0.02)).toBe('FN');
    expect(wearFromFloat(0.284)).toBe('FT');
    expect(wearFromFloat(0.99)).toBe('BS');
    const prices = { FN: 1.11, MW: 1, FT: 0.87, WW: 0.8, BS: 0.7 };
    expect(resolvePrice(prices, 'FT', false)).toBe(0.87);
    expect(resolvePrice(prices, 'FT', true)).toBe(1.74);
    expect(resolvePrice({ price: 7.19 }, null, false)).toBe(7.19);
    expect(formatVirtualMoney(2.615)).toBe('2.62');
  });
});
