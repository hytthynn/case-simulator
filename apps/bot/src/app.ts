import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import {
  AppError,
  GAMES,
  RATE_LIMIT_INVOICES_PER_MINUTE,
  RATE_LIMIT_OPENINGS_PER_SECOND,
  RATE_LIMIT_PER_MINUTE,
  TABS,
  idempotencyKey,
  invoiceRequestSchema,
  massSellRequestSchema,
  openCaseRequestSchema,
  paginationQuery,
  sellRequestSchema,
} from '@case-sim/shared';
import type { Env } from './env.js';
import { isProductionReady } from './env.js';
import type { JwtSigner } from './auth/jwt.js';
import { validateInitData } from './auth/init-data.js';
import type { DbPort } from './lib/db-port.js';
import { RateLimiter } from './lib/rate-limit.js';
import { assertInvoiceParams, assertXtrInvoiceCandidate, buildInvoiceParams } from './payments/xtr.js';
import type { TelegramPort } from './telegram/port.js';
import { handleTelegramUpdate, type TelegramUpdate } from './telegram/webhook.js';

interface Variables {
  requestId: string;
  telegramUserId: number;
}

export interface AppDeps {
  env: Env;
  db: DbPort;
  telegram: TelegramPort;
  jwt: JwtSigner;
  limiter?: RateLimiter;
  now?: () => number;
}

export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: Variables }>();
  const limiter = deps.limiter ?? new RateLimiter(deps.now);
  const now = deps.now ?? Date.now;
  const log = (event: string, data: Record<string, unknown> = {}) => {
    // Структурированный JSON без initData/ПД (NFR-11).
    console.log(JSON.stringify({ ts: new Date(now()).toISOString(), event, ...data }));
  };

  app.use('*', async (c, next) => {
    c.set('requestId', randomUUID());
    await next();
  });

  app.onError((err, c) => {
    const requestId = c.get('requestId') ?? randomUUID();
    if (err instanceof AppError) {
      if (err.status >= 500) log('api_error', { code: err.code, request_id: requestId });
      return c.json(err.toPayload(requestId), err.status as never);
    }
    if (isZodLike(err)) {
      const e = new AppError('VALIDATION_ERROR', err.issues.map((i) => i.message).join('; '));
      return c.json(e.toPayload(requestId), e.status as never);
    }
    log('internal_error', { request_id: requestId, message: String(err) });
    return c.json(new AppError('INTERNAL').toPayload(requestId), 500);
  });

  app.notFound((c) =>
    c.json(new AppError('NOT_FOUND').toPayload(c.get('requestId') ?? randomUUID()), 404),
  );

  // --- Служебные (без авторизации) -----------------------------------------
  app.get('/health', async (c) => {
    const dbOk = await deps.db.health();
    return c.json({
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'ok' : 'down',
      bot: deps.telegram.configured ? 'ok' : 'unknown',
      version: deps.env.VERSION,
      production_ready: isProductionReady(deps.env),
    });
  });

  app.get('/metrics', (c) => {
    c.header('Content-Type', 'text/plain; version=0.0.4');
    return c.body(
      [
        '# HELP case_sim_build_info Static build information (no PII).',
        '# TYPE case_sim_build_info gauge',
        `case_sim_build_info{version="${deps.env.VERSION}"} 1`,
      ].join('\n'),
    );
  });

  app.get('/v1/time', (c) => c.json({ now_ms: now() }));
  app.get('/v1/flags', async (c) => c.json(await deps.db.listFlags()));
  app.get('/v1/stats/public', (c) => c.json({ total_users: 0, new_24h: 0 }));

  // --- Каталог (публичный, кэшируется CDN) ---------------------------------
  app.get('/v1/catalog/cases', async (c) => {
    const query = parse(paginationQuery, {
      page: c.req.query('page') ?? '1',
      limit: c.req.query('limit') ?? '50',
    });
    const tab = c.req.query('tab') ?? 'cases';
    const { items, total } = await deps.db.listCases(tab, query.page, query.limit);
    c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    return c.json({ items, page: query.page, limit: query.limit, total, has_more: query.page * query.limit < total });
  });

  app.get('/v1/catalog/skus', async (c) => c.json({ items: await deps.db.listSkus() }));
  app.get('/v1/games', async (c) => {
    const flags = await deps.db.listFlags();
    return c.json({
      items: GAMES.map((g) => ({ ...g, disabled: flags[`game_disabled_${g.key}`] === true })),
      tabs: TABS,
    });
  });

  // --- Авторизация ---------------------------------------------------------
  app.post('/v1/auth/telegram', async (c) => {
    const header = c.req.header('Authorization') ?? '';
    if (!header.startsWith('tma ')) throw new AppError('INVALID_INIT_DATA');
    const validated = validateInitData(
      header.slice(4),
      deps.env.TELEGRAM_BOT_TOKEN,
      deps.env.INIT_DATA_TTL_SECONDS,
      now(),
    );
    if (!limiter.allow(`auth:${validated.telegramUserId}`, 30, 60_000)) {
      throw new AppError('RATE_LIMITED');
    }
    // Anti-replay: query_id принимается один раз.
    if (validated.queryId) {
      const fresh = await deps.db.consumeQueryId(validated.queryId, validated.telegramUserId);
      if (!fresh) throw new AppError('INVALID_INIT_DATA', 'Повторное использование query_id');
    }
    const user = await deps.db.ensureUser({
      telegramUserId: validated.telegramUserId,
      username: validated.user.username ?? null,
      firstName: validated.user.first_name ?? null,
      photoUrl: validated.user.photo_url ?? null,
      languageCode: validated.user.language_code ?? 'ru',
    });
    const tokens = await deps.jwt.issue(validated.telegramUserId, user.id, now());
    return c.json({
      ...tokens,
      user: {
        id: user.id,
        telegram_user_id: user.telegram_user_id,
        level: user.level,
        xp: user.xp,
        balance: user.balance,
        referral_code: user.referral_code,
        agent_id: user.agent_id,
        locale: user.locale,
        accepted_terms_at: user.accepted_terms_at,
      },
      server_time_ms: now(),
      flags: await deps.db.listFlags(),
    });
  });

  app.post('/v1/auth/refresh', async (c) => {
    const { telegramUserId, subject } = await verifyBearer(c, deps.jwt);
    return c.json(await deps.jwt.issue(telegramUserId, subject, now()));
  });

  // --- Защищённые роуты ----------------------------------------------------
  app.use('/v1/me/*', requireAuth(deps.jwt, limiter));
  app.use('/v1/me', requireAuth(deps.jwt, limiter));
  app.use('/v1/cases/*', requireAuth(deps.jwt, limiter));
  app.use('/v1/inventory/*', requireAuth(deps.jwt, limiter));
  app.use('/v1/payments/*', requireAuth(deps.jwt, limiter));

  app.get('/v1/me', async (c) => {
    const tg = c.get('telegramUserId');
    const me = await deps.db.getMe(tg);
    if (!me) throw new AppError('NOT_FOUND');
    return c.json({ ...me, entitlements: await deps.db.listEntitlements(tg) });
  });

  app.post('/v1/me/accept-terms', async (c) => {
    await deps.db.acceptTerms(c.get('telegramUserId'));
    return c.json({ accepted: true, accepted_terms_at: new Date(now()).toISOString() });
  });

  app.get('/v1/me/inventory', (c) =>
    c.json({ items: [], page: 1, limit: 50, total: 0, has_more: false, note: 'этап 2: get_inventory RPC' }),
  );

  app.post('/v1/cases/open', async (c) => {
    const tg = c.get('telegramUserId');
    if (!limiter.allow(`open:${tg}`, RATE_LIMIT_OPENINGS_PER_SECOND, 1000)) {
      throw new AppError('RATE_LIMITED');
    }
    const body = parse(openCaseRequestSchema, await c.req.json().catch(() => ({})));
    const key = readIdempotency(c, body.idempotency_key);
    const result = await deps.db.openCase({
      telegramUserId: tg,
      caseId: body.case_id,
      count: body.count,
      clientSeed: body.client_seed ?? `default:${tg}`,
      idempotencyKey: key,
      autoSellBelow: body.options.auto_sell_below,
    });
    return c.json(result);
  });

  app.post('/v1/inventory/sell', async (c) => {
    const body = parse(sellRequestSchema, await c.req.json().catch(() => ({})));
    return c.json(
      await deps.db.sellItems(c.get('telegramUserId'), body.item_ids, readIdempotency(c, body.idempotency_key)),
    );
  });

  app.post('/v1/inventory/mass-sell', async (c) => {
    const body = parse(massSellRequestSchema, await c.req.json().catch(() => ({})));
    return c.json(
      await deps.db.massSell(c.get('telegramUserId'), body.max_price, readIdempotency(c, body.idempotency_key)),
    );
  });

  // --- Stars: только XTR, выдача только после successful_payment -------------
  app.get('/v1/payments/skus', async (c) => c.json({ items: await deps.db.listSkus() }));

  app.post('/v1/payments/invoice', async (c) => {
    const tg = c.get('telegramUserId');
    if (!limiter.allow(`invoice:${tg}`, RATE_LIMIT_INVOICES_PER_MINUTE, 60_000)) {
      throw new AppError('RATE_LIMITED');
    }
    const body = parse(invoiceRequestSchema, await c.req.json().catch(() => ({})));
    const key = readIdempotency(c, body.idempotency_key);
    const me = await deps.db.getMe(tg);
    if (!me?.accepted_terms_at) {
      throw new AppError('NOT_ELIGIBLE', 'Требуется согласие с офертой и 18+ до первой покупки');
    }
    const sku = (await deps.db.listSkus()).find((s) => s.sku === body.sku && s.active);
    if (!sku) throw new AppError('NOT_FOUND', 'SKU не найден или отключён');
    assertXtrInvoiceCandidate(sku);

    const payment = await deps.db.createStarPayment(tg, sku.sku, sku.amount_xtr, key);
    const params = buildInvoiceParams(sku, payment.invoice_payload);
    assertInvoiceParams(params);
    const invoiceUrl = await deps.telegram.createInvoiceLink(params);
    return c.json({
      invoice_url: invoiceUrl,
      payment_id: payment.id,
      currency: 'XTR',
      amount_xtr: sku.amount_xtr,
    });
  });

  app.get('/v1/payments/:id', async (c) => {
    const payment = await deps.db.getStarPayment(c.req.param('id'), c.get('telegramUserId'));
    if (!payment) throw new AppError('NOT_FOUND');
    return c.json(payment);
  });

  // --- Webhook бота --------------------------------------------------------
  app.post('/telegram/webhook', async (c) => {
    if (deps.env.TELEGRAM_WEBHOOK_SECRET) {
      const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
      if (secret !== deps.env.TELEGRAM_WEBHOOK_SECRET) throw new AppError('UNAUTHORIZED');
    }
    const update = (await c.req.json().catch(() => ({}))) as TelegramUpdate;
    await handleTelegramUpdate(update, { db: deps.db, telegram: deps.telegram, log });
    return c.json({ ok: true });
  });

  log('app_created', { version: deps.env.VERSION, production_ready: isProductionReady(deps.env) });
  return app;
}

// --- Helpers ---------------------------------------------------------------
function requireAuth(jwt: JwtSigner, limiter: RateLimiter) {
  return async (c: Context<{ Variables: Variables }>, next: () => Promise<void>) => {
    const { telegramUserId } = await verifyBearer(c, jwt);
    if (!limiter.allow(`api:${telegramUserId}`, RATE_LIMIT_PER_MINUTE, 60_000)) {
      throw new AppError('RATE_LIMITED');
    }
    c.set('telegramUserId', telegramUserId);
    await next();
  };
}

async function verifyBearer(c: Context<{ Variables: Variables }>, jwt: JwtSigner) {
  const header = c.req.header('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) throw new AppError('UNAUTHORIZED');
  return jwt.verify(header.slice(7));
}

function readIdempotency(c: Context<{ Variables: Variables }>, fromBody?: string): string {
  const value = c.req.header('Idempotency-Key') ?? fromBody;
  const parsed = idempotencyKey.safeParse(value);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Требуется валидный Idempotency-Key (UUID)');
  return parsed.data;
}

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: unknown } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = result.error as { issues?: { message: string }[] };
    throw new AppError('VALIDATION_ERROR', error.issues?.map((i) => i.message).join('; ') ?? 'Некорректное тело запроса');
  }
  return result.data;
}

function isZodLike(err: unknown): err is { issues: { message: string }[] } {
  return typeof err === 'object' && err !== null && Array.isArray((err as { issues?: unknown }).issues);
}
