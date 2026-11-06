#!/usr/bin/env node
/**
 * Управление вебхуком Telegram-бота (docs/09-monetization.md §6, 10-ops-deploy.md §9).
 *
 *   pnpm bot:webhook:set      # установить из TELEGRAM_WEBHOOK_URL + SECRET
 *   pnpm bot:webhook:info     # проверить состояние
 *   pnpm bot:webhook:delete   # снять (например, перед локальной отладкой)
 *
 * Читает корневой .env через process.loadEnvFile (Node >= 22), но НЕ переопределяет
 * уже заданные переменные окружения — Railway/CI имеют приоритет.
 * Токен никогда не выводится в лог.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const envFile = resolve(ROOT, '.env');
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // Уже заданные переменные не перезаписываются; ошибку парсинга покажем ниже.
  }
}

const command = process.argv[2] ?? 'info';
if (!['set', 'info', 'delete'].includes(command)) {
  console.error('Использование: node set-webhook.mjs <set|info|delete>');
  process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Нет TELEGRAM_BOT_TOKEN: создайте бота в @BotFather и заполните .env (Q-01).');
  process.exit(1);
}

const useTestEnv = process.env.TELEGRAM_USE_TEST_ENV === 'true';
const base = `https://api.telegram.org/bot${token}${useTestEnv ? '/test' : ''}`;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL ?? '';
const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';

if (command === 'set') {
  if (!webhookUrl || !secret) {
    console.error('Нужны TELEGRAM_WEBHOOK_URL и TELEGRAM_WEBHOOK_SECRET в .env.');
    process.exit(1);
  }
  if (!webhookUrl.startsWith('https://')) {
    console.error('Webhook должен быть HTTPS (docs/10-ops-deploy.md §1).');
    process.exit(1);
  }
  if (!webhookUrl.endsWith('/telegram/webhook')) {
    console.warn(`⚠️  Ожидается путь /telegram/webhook, получено: ${webhookUrl}`);
  }
  // refunded_payment приходит внутри message — отдельного allowed_update нет.
  const body = {
    url: webhookUrl,
    secret_token: secret,
    drop_pending_updates: false,
    max_connections: 40,
    allowed_updates: ['message', 'pre_checkout_query', 'callback_query', 'edited_message'],
  };
  const result = await call(`${base}/setWebhook`, body);
  console.log(`setWebhook: ${result.ok === true ? 'OK' : 'ОШИБКА'}`);
  console.log(`  url: ${webhookUrl}`);
  console.log(`  окружение: ${useTestEnv ? 'TEST (/test/)' : 'PROD'}`);
  if (result.ok !== true) {
    console.error(JSON.stringify(result));
    process.exit(1);
  }
} else if (command === 'delete') {
  const result = await call(`${base}/deleteWebhook`, { drop_pending_updates: false });
  console.log(`deleteWebhook: ${result.ok === true ? 'OK' : 'ОШИБКА'}`);
  if (result.ok !== true) process.exit(1);
} else {
  const response = await fetch(`${base}/getWebhookInfo`);
  const data = await response.json();
  if (!data.ok) {
    console.error('getWebhookInfo не удался');
    process.exit(1);
  }
  const info = data.result;
  console.log('getWebhookInfo:');
  console.log(`  url: ${info.url || '(не задан)'}`);
  console.log(`  pending_update_count: ${info.pending_update_count}`);
  console.log(`  has_custom_certificate: ${info.has_custom_certificate}`);
  console.log(`  last_error_date: ${info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : 'нет'}`);
  console.log(`  last_error_message: ${info.last_error_message ?? 'нет'}`);
  console.log(`  ip_address: ${info.ip_address ?? 'нет'}`);
  if (info.last_error_message) process.exitCode = 1;
}

async function call(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Bot API вернул HTTP ${response.status}`);
  }
  return response.json();
}
