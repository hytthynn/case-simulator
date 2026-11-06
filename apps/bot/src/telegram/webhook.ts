import type { DbPort } from '../lib/db-port.js';
import { BOT_COMMAND_TEXTS, type TelegramPort } from './port.js';

export interface TelegramUpdate {
  update_id?: number;
  pre_checkout_query?: {
    id: string;
    from?: { id: number };
    invoice_payload?: string;
    currency?: string;
    total_amount?: number;
  };
  message?: {
    message_id?: number;
    chat?: { id: number };
    from?: { id: number };
    text?: string;
    entities?: { type: string; offset: number; length: number }[];
    successful_payment?: {
      invoice_payload?: string;
      telegram_payment_charge_id?: string;
      currency?: string;
      total_amount?: number;
    };
    refunded_payment?: {
      telegram_payment_charge_id?: string;
    };
  };
}

export interface WebhookDeps {
  db: DbPort;
  telegram: TelegramPort;
  log: (event: string, data?: Record<string, unknown>) => void;
}

/**
 * Обработка webhook-обновлений. Все события идемпотентны:
 * UNIQUE(telegram_payment_charge_id) + RPC grant_entitlement защищают от дублей.
 * Товар выдаётся ТОЛЬКО на successful_payment, никогда на pre_checkout_query.
 */
export async function handleTelegramUpdate(update: TelegramUpdate, deps: WebhookDeps): Promise<void> {
  const { db, telegram, log } = deps;

  if (update.pre_checkout_query) {
    const pcq = update.pre_checkout_query;
    const payload = pcq.invoice_payload ?? '';
    // Строго ≤10 с: только одна точечная проверка, без тяжёлых запросов.
    const payment = payload ? await db.findPaymentByPayload(payload) : null;
    const ok = Boolean(payment && payment.status === 'pending' && pcq.currency === 'XTR');
    await telegram.answerPreCheckoutQuery(
      pcq.id,
      ok,
      ok ? undefined : 'Заказ не найден или оплата доступна только в XTR',
    );
    log('pre_checkout_query', { ok, payload });
    return;
  }

  const message = update.message;
  if (!message) return;

  if (message.successful_payment) {
    const sp = message.successful_payment;
    if (!sp.invoice_payload || !sp.telegram_payment_charge_id) {
      log('successful_payment_invalid', {});
      return;
    }
    await db.grantEntitlement(sp.invoice_payload, sp.telegram_payment_charge_id, sp);
    if (message.chat?.id) {
      await telegram.sendMessage(message.chat.id, 'Покупка получена. Оформление/буст доступны в Mini App.');
    }
    log('successful_payment', { payload: sp.invoice_payload });
    return;
  }

  if (message.refunded_payment?.telegram_payment_charge_id) {
    await db.revokeEntitlement(message.refunded_payment.telegram_payment_charge_id);
    log('refunded_payment', {});
    return;
  }

  const command = extractCommand(message.text, message.entities);
  if (command && message.chat?.id) {
    const text = BOT_COMMAND_TEXTS[command];
    if (text) await telegram.sendMessage(message.chat.id, text);
  }
}

function extractCommand(
  text: string | undefined,
  entities: { type: string; offset: number; length: number }[] | undefined,
): string | null {
  if (!text) return null;
  const entity = entities?.find((e) => e.type === 'bot_command' && e.offset === 0);
  if (!entity) return null;
  return text.slice(0, entity.length).split('@')[0] ?? null;
}
