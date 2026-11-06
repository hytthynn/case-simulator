import { Bot } from 'grammy';
import type { Env } from '../env.js';
import type { InvoiceParams } from '../payments/xtr.js';

export interface TelegramPort {
  readonly configured: boolean;
  createInvoiceLink(params: InvoiceParams): Promise<string>;
  answerPreCheckoutQuery(id: string, ok: boolean, errorMessage?: string): Promise<void>;
  sendMessage(chatId: number, text: string): Promise<void>;
  health(): Promise<boolean>;
}

const TERMS_RU =
  'Оферта и условия. Симулятор для лиц 18+. Реальные деньги не используются. ' +
  'Виртуальные предметы не выводятся, не обмениваются и не имеют денежной стоимости. ' +
  'Не является азартной игрой. Оплата — только Telegram Stars (XTR) за косметику и бусты удобства. ' +
  'Бусты не влияют на вероятности дропа и исход раунда.';

const SUPPORT_RU =
  'Поддержка: напишите в этот чат, указав telegram_user_id из профиля Mini App. ' +
  'Платежи и возвраты — команда /paysupport.';

const PAYSUPPORT_RU =
  'Платежи проводятся только в Telegram Stars (XTR). История покупок — в Mini App, ' +
  'раздел «Магазин → Восстановить покупки». Возврат оформляется через @BotSupport ' +
  'и обрабатывается событием refunded_payment с отзывом выданного права.';

export const BOT_COMMAND_TEXTS: Record<string, string> = {
  '/start': 'Симулятор Кейсов 18+. Откройте Mini App кнопкой в меню бота. ' + TERMS_RU,
  '/terms': TERMS_RU,
  '/support': SUPPORT_RU,
  '/paysupport': PAYSUPPORT_RU,
  '/help':
    'Как играть: откройте кейс → результат фиксируется сервером → анимация рулетки. ' +
    'Честность раунда проверяется в разделе «Как это работает»: публикуется sha256(server_seed) ' +
    'до раунда, сид раскрывается после ротации. ' + TERMS_RU,
};

/**
 * grammY используется для серверных вызовов Bot API. Обновления webhook'а
 * разбираются в webhook.ts без long polling — Railway работает только по вебхуку.
 */
export function createTelegramPort(env: Env): TelegramPort {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return {
      configured: false,
      async createInvoiceLink() {
        return 'https://t.me/invoice/dev-placeholder';
      },
      async answerPreCheckoutQuery() {},
      async sendMessage() {},
      async health() {
        return false;
      },
    };
  }

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const api = bot.api.raw;

  return {
    configured: true,
    async createInvoiceLink(params) {
      return api.createInvoiceLink({
        title: params.title,
        description: params.description,
        payload: params.payload,
        provider_token: params.provider_token,
        currency: params.currency,
        prices: params.prices,
      });
    },
    async answerPreCheckoutQuery(id, ok, errorMessage) {
      await api.answerPreCheckoutQuery({
        pre_checkout_query_id: id,
        ok,
        ...(errorMessage ? { error_message: errorMessage } : {}),
      });
    },
    async sendMessage(chatId, text) {
      await api.sendMessage({ chat_id: chatId, text });
    },
    async health() {
      try {
        await api.getMe();
        return true;
      } catch {
        return false;
      }
    },
  };
}
