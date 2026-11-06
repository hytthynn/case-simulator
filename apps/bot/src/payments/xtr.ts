import { AppError, XTR_CURRENCY, getSku, type SkuDto } from '@case-sim/shared';

export interface InvoiceParams {
  title: string;
  description: string;
  payload: string;
  provider_token: '';
  currency: 'XTR';
  prices: [{ label: string; amount: number }];
}

/**
 * createInvoiceLink: цифровые товары в Telegram — ТОЛЬКО XTR, provider_token '',
 * один LabeledPrice с целым amount (TOS §6.2, docs/09-monetization.md §1).
 */
export function buildInvoiceParams(sku: Pick<SkuDto, 'sku' | 'title_ru' | 'amount_xtr'>, invoicePayload: string): InvoiceParams {
  assertXtrInvoiceCandidate(sku);
  if (!invoicePayload || Buffer.byteLength(invoicePayload, 'utf8') > 128) {
    throw new AppError('VALIDATION_ERROR', 'invoice payload должен быть 1–128 байт');
  }
  return {
    title: sku.title_ru,
    description: 'Косметика / буст удобства. Не влияет на шансы дропа или исход раунда. 18+, симулятор.',
    payload: invoicePayload,
    provider_token: '',
    currency: XTR_CURRENCY,
    prices: [{ label: sku.title_ru, amount: sku.amount_xtr }],
  };
}

/** Явная проверка инвариантов D-01 / XTR перед любым сетевым вызовом Bot API. */
export function assertXtrInvoiceCandidate(sku: { sku: string; amount_xtr: number }): void {
  const definition = getSku(sku.sku);
  if (!definition) throw new AppError('NOT_FOUND', 'SKU не найден в каталоге D-01');
  if (!Number.isInteger(sku.amount_xtr) || sku.amount_xtr <= 0) {
    throw new AppError('VALIDATION_ERROR', 'amount_xtr должен быть целым положительным');
  }
  if (sku.amount_xtr !== definition.amountXtr) {
    throw new AppError('VALIDATION_ERROR', 'цена SKU не совпадает с каталогом (D-04)');
  }
}

export function assertInvoiceParams(params: InvoiceParams): void {
  if (params.currency !== 'XTR') throw new AppError('VALIDATION_ERROR', 'Разрешена только валюта XTR');
  if (params.provider_token !== '') throw new AppError('VALIDATION_ERROR', 'provider_token должен быть пустым');
  if (params.prices.length !== 1 || !Number.isInteger(params.prices[0].amount)) {
    throw new AppError('VALIDATION_ERROR', 'Ровно один LabeledPrice с целым amount');
  }
}
