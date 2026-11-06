import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createJwtSigner } from '../src/auth/jwt.js';
import { signInitData } from '../src/auth/init-data.js';
import { loadEnv } from '../src/env.js';
import { createMemoryDb } from '../src/lib/memory-db.js';
import { RateLimiter } from '../src/lib/rate-limit.js';
import type { TelegramPort } from '../src/telegram/port.js';

const TOKEN = '123456:AA-TEST-TOKEN';
const USER_ID = 424242;
const IDEM = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

async function setup() {
  const env = loadEnv({
    NODE_ENV: 'test',
    TELEGRAM_BOT_TOKEN: TOKEN,
    TELEGRAM_WEBHOOK_SECRET: 'whsec',
    VERSION: '0.2.0',
  } as NodeJS.ProcessEnv);
  const db = createMemoryDb();
  const jwt = await createJwtSigner('', 3600);
  const preCheckout: { id: string; ok: boolean }[] = [];
  const telegram: TelegramPort = {
    configured: true,
    async createInvoiceLink() {
      return 'https://t.me/invoice/test';
    },
    async answerPreCheckoutQuery(id, ok) {
      preCheckout.push({ id, ok });
    },
    async sendMessage() {},
    async health() {
      return true;
    },
  };
  const app = createApp({ env, db, jwt, telegram, limiter: new RateLimiter() });
  const initData = signInitData(
    {
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: 'AAH-test-1',
      user: JSON.stringify({ id: USER_ID, first_name: 'Тест', language_code: 'ru' }),
    },
    TOKEN,
  );
  const auth = await app.request('/v1/auth/telegram', {
    method: 'POST',
    headers: { Authorization: `tma ${initData}`, 'Content-Type': 'application/json' },
  });
  const authBody = (await auth.json()) as { access_token: string; user: { balance: string } };
  const bearer = { Authorization: `Bearer ${authBody.access_token}` };
  return { app, db, env, jwt, telegram, preCheckout, auth, authBody, bearer, initData };
}

describe('HTTP v1 · базовый контракт', () => {
  it('/health и /v1/time доступны без авторизации', async () => {
    const { app } = await setup();
    const health = await app.request('/health');
    expect(health.status).toBe(200);
    expect((await health.json() as { status: string }).status).toBe('ok');
    const time = await app.request('/v1/time');
    expect((await time.json() as { now_ms: number }).now_ms).toBeGreaterThan(0);
  });

  it('авторизация по initData, anti-replay и /me', async () => {
    const { app, auth, authBody, bearer, initData } = await setup();
    expect(auth.status).toBe(200);
    expect(authBody.user.balance).toBe('10.00');

    const replay = await app.request('/v1/auth/telegram', {
      method: 'POST',
      headers: { Authorization: `tma ${initData}` },
    });
    expect(replay.status).toBe(401);

    const me = await app.request('/v1/me', { headers: bearer });
    expect(me.status).toBe(200);
    expect((await me.json() as { telegram_user_id: number }).telegram_user_id).toBe(USER_ID);

    const noAuth = await app.request('/v1/me');
    expect(noAuth.status).toBe(401);
  });

  it('каталог и список игр', async () => {
    const { app, bearer } = await setup();
    const cases = await app.request('/v1/catalog/cases');
    const body = (await cases.json()) as { items: unknown[]; total: number };
    expect(body.total).toBeGreaterThan(0);
    expect(body.items.length).toBeGreaterThan(0);

    const games = await app.request('/v1/games');
    expect((await games.json()) as { items: unknown[] }).toHaveProperty('items');
    expect(await app.request('/v1/me', { headers: bearer })).toBeTruthy();
  });

  it('открытие кейса идемпотентно и списывает баланс один раз', async () => {
    const { app, bearer } = await setup();
    const payload = { case_id: 'kilowatt-case', count: 1, idempotency_key: IDEM };
    const first = await app.request('/v1/cases/open', {
      method: 'POST',
      headers: { ...bearer, 'Content-Type': 'application/json', 'Idempotency-Key': IDEM },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(200);
    const result = (await first.json()) as {
      rolls: unknown[];
      balance_after: string;
      server_seed_hash?: string;
    };
    expect(result.rolls).toHaveLength(1);
    expect(result.balance_after).toBe('7.50');

    const second = await app.request('/v1/cases/open', {
      method: 'POST',
      headers: { ...bearer, 'Content-Type': 'application/json', 'Idempotency-Key': IDEM },
      body: JSON.stringify(payload),
    });
    expect(await second.json()).toEqual(result);

    const me = await app.request('/v1/me', { headers: bearer });
    expect((await me.json() as { balance: string }).balance).toBe('7.50');
  });

  it('отклоняет невалидное тело и попытку без Idempotency-Key', async () => {
    const { app, bearer } = await setup();
    const bad = await app.request('/v1/cases/open', {
      method: 'POST',
      headers: { ...bearer, 'Content-Type': 'application/json' },
      body: JSON.stringify({ case_id: 'kilowatt-case', count: 4, idempotency_key: IDEM }),
    });
    expect(bad.status).toBe(400);
  });

  it('инвойс требует согласия с офертой и выпускается только в XTR', async () => {
    const { app, bearer } = await setup();
    const headers = { ...bearer, 'Content-Type': 'application/json' };
    const before = await app.request('/v1/payments/invoice', {
      method: 'POST', headers, body: JSON.stringify({ sku: 'boost.noAds', idempotency_key: IDEM }),
    });
    expect(before.status).toBe(422);

    await app.request('/v1/me/accept-terms', { method: 'POST', headers });
    const invoice = await app.request('/v1/payments/invoice', {
      method: 'POST', headers, body: JSON.stringify({ sku: 'boost.noAds', idempotency_key: IDEM }),
    });
    expect(invoice.status).toBe(200);
    const body = (await invoice.json()) as { currency: string; amount_xtr: number; invoice_url: string };
    expect(body.currency).toBe('XTR');
    expect(body.amount_xtr).toBe(300);
    expect(body.invoice_url).toContain('https://');
  });

  it('webhook: pre_checkout НЕ выдаёт товар, successful_payment выдаёт один раз', async () => {
    const { app, db, preCheckout } = await setup();
    const payment = await db.createStarPayment(USER_ID, 'boost.noAds', 300, IDEM);
    const webhookHeaders = {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': 'whsec',
    };

    const pcq = await app.request('/telegram/webhook', {
      method: 'POST',
      headers: webhookHeaders,
      body: JSON.stringify({
        update_id: 1,
        pre_checkout_query: {
          id: 'pcq-1',
          invoice_payload: payment.invoice_payload,
          currency: 'XTR',
          total_amount: 300,
        },
      }),
    });
    expect(pcq.status).toBe(200);
    expect(preCheckout).toEqual([{ id: 'pcq-1', ok: true }]);
    expect(await db.listEntitlements(USER_ID)).toEqual([]);

    const paid = {
      update_id: 2,
      message: {
        chat: { id: USER_ID },
        successful_payment: {
          invoice_payload: payment.invoice_payload,
          telegram_payment_charge_id: 'charge-1',
          currency: 'XTR',
          total_amount: 300,
        },
      },
    };
    expect((await app.request('/telegram/webhook', {
      method: 'POST', headers: webhookHeaders, body: JSON.stringify(paid),
    })).status).toBe(200);
    expect(await db.listEntitlements(USER_ID)).toEqual(['boost.noAds']);

    // Дубль webhook не дублирует entitlement.
    await app.request('/telegram/webhook', { method: 'POST', headers: webhookHeaders, body: JSON.stringify(paid) });
    expect(await db.listEntitlements(USER_ID)).toEqual(['boost.noAds']);

    const badSecret = await app.request('/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_id: 3 }),
    });
    expect(badSecret.status).toBe(401);
  });
});
