import { describe, expect, it } from 'vitest';
import {
  assertSkuCatalogIsCompliant,
  SKU_CATALOG,
  getSku,
  FORBIDDEN_SKU_PATTERNS,
} from '../src/skus.js';
import { openCaseRequestSchema, invoiceRequestSchema, virtualMoney } from '../src/schemas.js';
import { translate, RU } from '../src/i18n.js';
import { DISCLAIMER_RU, GAMES, TABS, xpForLevel } from '../src/constants.js';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('D-01 · каталог XTR', () => {
  it('проходит проверку на запрещённые SKU и уникальность', () => {
    expect(() => assertSkuCatalogIsCompliant()).not.toThrow();
    expect(SKU_CATALOG.length).toBeGreaterThan(25);
  });

  it('не содержит SKU с игровой валютой, шансами или выводом', () => {
    for (const sku of SKU_CATALOG) {
      expect(FORBIDDEN_SKU_PATTERNS.some((p) => p.test(sku.sku))).toBe(false);
      expect(sku.sku.startsWith('buy.cash')).toBe(false);
    }
  });

  it('отбрасывает добавление запрещённого SKU', () => {
    expect(() =>
      assertSkuCatalogIsCompliant([
        { sku: 'buy.cash.1000', kind: 'convenience', titleRu: '$', amountXtr: 10, effect: '', active: true },
      ]),
    ).toThrow(/D-01/);
  });

  it('getSku возвращает только активные позиции', () => {
    expect(getSku('bundle.ultimate')?.amountXtr).toBe(2500);
    expect(getSku('unknown')).toBeUndefined();
  });
});

describe('Zod-контракты', () => {
  it('принимает корректный /cases/open и отклоняет count=4', () => {
    const valid = openCaseRequestSchema.safeParse({
      case_id: 'kilowatt-case',
      count: 3,
      idempotency_key: UUID,
    });
    expect(valid.success).toBe(true);
    expect(valid.data?.options.auto_select).toBe(false);
    expect(openCaseRequestSchema.safeParse({ case_id: 'x', count: 4, idempotency_key: UUID }).success).toBe(false);
    expect(openCaseRequestSchema.safeParse({ case_id: 'x', count: 1, idempotency_key: 'nope' }).success).toBe(false);
  });

  it('виртуальные деньги — строка с двумя знаками, без валюты', () => {
    expect(virtualMoney.safeParse('11.74').success).toBe(true);
    expect(virtualMoney.safeParse('€4.99').success).toBe(false);
    expect(virtualMoney.safeParse(11.74).success).toBe(false);
  });

  it('инвойс требует uuid идемпотентности', () => {
    expect(invoiceRequestSchema.safeParse({ sku: 'boost.noAds', idempotency_key: UUID }).success).toBe(true);
    expect(invoiceRequestSchema.safeParse({ sku: 'boost.noAds' }).success).toBe(false);
  });
});

describe('шелл и константы', () => {
  it('5 нижних табов, 22 игры, дисклеймер 18+', () => {
    expect(TABS).toEqual(['cases', 'inventory', 'contracts', 'games', 'shop']);
    expect(GAMES).toHaveLength(22);
    expect(DISCLAIMER_RU).toContain('18+');
    expect(DISCLAIMER_RU).not.toContain('гарантированный');
  });

  it('i18n: интерполяция и деградация отсутствующих ключей', () => {
    expect(translate('ru', 'cases.open.useKey', { price: '$2.61' })).toContain('$2.61');
    expect(translate('en', 'tabs.cases')).toBe('Cases');
    expect(translate('es', 'shop.buy', { amount: 250 })).toBe(RU['shop.buy'].replace('{amount}', '250'));
  });

  it('XP-кривая монотонна', () => {
    expect(xpForLevel(1)).toBe(1440);
    expect(xpForLevel(26)).toBeGreaterThan(xpForLevel(1));
  });
});
