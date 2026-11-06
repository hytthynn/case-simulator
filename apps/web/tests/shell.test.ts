import { describe, expect, it } from 'vitest';
import {
  DAILY_FREE_SPINS,
  DISCLAIMER_RU,
  GAMES,
  RARITY_COLORS,
  RARITY_ORDER,
  STARTING_BALANCE,
  TABS,
  assertSkuCatalogIsCompliant,
  translate,
  xpForLevel,
} from '@case-sim/shared';
import { caseImageUrl, composeAssetUrl } from '../src/features/cases/CaseCard';

describe('шелл 1:1', () => {
  it('5 нижних табов и 22 игры', () => {
    expect(TABS).toEqual(['cases', 'inventory', 'contracts', 'games', 'shop']);
    expect(GAMES).toHaveLength(22);
    expect(GAMES.every((g) => g.level >= 1 && g.rtp >= 0 && g.rtp <= 1)).toBe(true);
  });

  it('все редкости имеют цвет', () => {
    for (const rarity of RARITY_ORDER) {
      expect(RARITY_COLORS[rarity]).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('дисклеймер 18+ и отсутствие гемблинг-фрейминга', () => {
    expect(DISCLAIMER_RU).toContain('18+');
    expect(DISCLAIMER_RU).toContain('не выводятся');
    expect(DISCLAIMER_RU.toLowerCase()).not.toContain('гарантированный выигрыш');
    expect(STARTING_BALANCE).toBe(10);
    expect(DAILY_FREE_SPINS).toBe(1);
    expect(xpForLevel(1)).toBe(1440);
  });

  it('i18n: нет хардкода, интерполяция работает', () => {
    expect(translate('ru', 'cases.open.useKey', { price: '$2.61' })).toContain('$2.61');
    expect(translate('en', 'tabs.shop')).toBe('Shop');
    expect(translate('es', 'common.accept', {})).toBe('ПРИНЯТЬ');
  });

  it('каталог SKU не продаёт валюту/шансы (D-01)', () => {
    expect(() => assertSkuCatalogIsCompliant()).not.toThrow();
  });

  it('URL ассета строится из CDN_BASE_URL', () => {
    expect(caseImageUrl('catalog/cases/x.png')).toBeTypeOf('string');
  });

  it('CDN без /catalog и с /catalog дают один и тот же корректный путь', () => {
    const path = 'catalog/cases/Kilowatt Case.png';
    expect(composeAssetUrl('https://cdn.example.com', path)).toBe(
      'https://cdn.example.com/catalog/cases/Kilowatt Case.png',
    );
    expect(composeAssetUrl('https://cdn.example.com/catalog/', path)).toBe(
      'https://cdn.example.com/catalog/cases/Kilowatt Case.png',
    );
    expect(composeAssetUrl('https://cdn.example.com/', path)).not.toContain('//catalog');
    expect(composeAssetUrl('', path)).toBe('');
  });
});
