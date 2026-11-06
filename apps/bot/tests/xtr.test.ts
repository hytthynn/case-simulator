import { describe, expect, it } from 'vitest';
import {
  assertInvoiceParams,
  assertXtrInvoiceCandidate,
  buildInvoiceParams,
} from '../src/payments/xtr.js';
import { SKU_CATALOG, assertSkuCatalogIsCompliant } from '@case-sim/shared';

const sku = { sku: 'boost.noAds', title_ru: 'Без пауз навсегда', amount_xtr: 300 };

describe('D-01 / XTR-инвойс', () => {
  it('каталог не содержит запрещённых SKU', () => {
    expect(() => assertSkuCatalogIsCompliant()).not.toThrow();
    expect(SKU_CATALOG.length).toBeGreaterThan(25);
    expect(SKU_CATALOG.every((s) => Number.isInteger(s.amountXtr))).toBe(true);
  });

  it('формирует строго XTR-инвойс с одним LabeledPrice', () => {
    const params = buildInvoiceParams(sku, 'payload-uuid');
    expect(params.currency).toBe('XTR');
    expect(params.provider_token).toBe('');
    expect(params.prices).toEqual([{ label: sku.title_ru, amount: 300 }]);
    expect(() => assertInvoiceParams(params)).not.toThrow();
  });

  it('отвергает фиат, дробную цену и неизвестный SKU', () => {
    expect(() => assertXtrInvoiceCandidate({ sku: 'boost.noAds', amount_xtr: 299 })).toThrow(/каталог/);
    expect(() => assertXtrInvoiceCandidate({ sku: 'boost.noAds', amount_xtr: 1.5 })).toThrow(/целым/);
    expect(() => assertXtrInvoiceCandidate({ sku: 'buy.cash.1000', amount_xtr: 10 })).toThrow(/не найден/);
    const bad = buildInvoiceParams(sku, 'p');
    expect(() => assertInvoiceParams({ ...bad, currency: 'USD' as never })).toThrow(/XTR/);
    expect(() => assertInvoiceParams({ ...bad, provider_token: 'token' as never })).toThrow(/provider_token/);
  });

  it('payload ограничен 128 байтами', () => {
    expect(() => buildInvoiceParams(sku, 'x'.repeat(129))).toThrow(/128/);
  });
});
