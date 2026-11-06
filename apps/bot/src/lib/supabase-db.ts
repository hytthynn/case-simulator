import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  AppError,
  type CaseDto,
  type ErrorCode,
  type OpenCaseResponse,
  type SkuDto,
} from '@case-sim/shared';
import type { DbPort, MeRecord, NewUserInput, StarPaymentRecord } from './db-port.js';

const PG_ERROR_MAP: Record<string, ErrorCode> = {
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  ITEM_LOCKED: 'ITEM_LOCKED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
};

function rethrow(error: { message: string } | null, fallback: ErrorCode = 'INTERNAL'): never {
  const code = error ? PG_ERROR_MAP[error.message] : undefined;
  throw new AppError(code ?? fallback, code ? undefined : error?.message);
}

function money(value: unknown): string {
  return Number(value ?? 0).toFixed(2);
}

/** Реальный адаптер: все деньги идут через SECURITY DEFINER RPC (service_role). */
export function createSupabaseDb(url: string, secretKey: string): DbPort {
  const client: SupabaseClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args);
    if (error) rethrow(error);
    return data as T;
  }

  async function getMe(telegramUserId: number): Promise<MeRecord | null> {
    const { data, error } = await client
      .from('users')
      .select('id, telegram_user_id, level, xp, referral_code, agent_id, language_code, accepted_terms_at, wallets(balance)')
      .eq('telegram_user_id', telegramUserId)
      .maybeSingle();
    if (error) rethrow(error);
    if (!data) return null;
    const wallets = data.wallets as unknown as { balance: number }[] | { balance: number } | null;
    const balance = Array.isArray(wallets) ? wallets[0]?.balance : wallets?.balance;
    return {
      id: String(data.id),
      telegram_user_id: Number(data.telegram_user_id),
      level: Number(data.level),
      xp: Number(data.xp),
      balance: money(balance),
      referral_code: String(data.referral_code),
      agent_id: data.agent_id as string | null,
      locale: String(data.language_code),
      accepted_terms_at: data.accepted_terms_at as string | null,
    };
  }

  return {
    async health() {
      const { error } = await client.from('rarity_config').select('rarity').limit(1);
      return !error;
    },

    async consumeQueryId(queryId, telegramUserId) {
      if (!queryId) return false;
      return rpc<boolean>('consume_query_id', {
        p_query_id: queryId,
        p_telegram_user_id: telegramUserId,
      });
    },

    async ensureUser(input: NewUserInput) {
      const profile = await rpc<Record<string, unknown>>('ensure_user', {
        p_telegram_user_id: input.telegramUserId,
        p_username: input.username,
        p_first_name: input.firstName,
        p_photo_url: input.photoUrl,
        p_language_code: input.languageCode,
      });
      const me = await getMe(input.telegramUserId);
      if (!me) throw new AppError('INTERNAL', 'ensure_user: кошелёк не создан');
      return { ...me, ...normalizeProfile(profile) };
    },

    getMe,

    async acceptTerms(telegramUserId) {
      const { error } = await client
        .from('users')
        .update({ accepted_terms_at: new Date().toISOString() })
        .eq('telegram_user_id', telegramUserId);
      if (error) rethrow(error);
    },

    async listCases(tab, page, limit) {
      const section = tab === 'black_market' ? 'black_market' : tab === 'capsules' ? 'capsules' : 'cases';
      const { data, error, count } = await client
        .from('cases')
        .select('*', { count: 'exact' })
        .eq('enabled', true)
        .eq('section', section)
        .order('sort_order', { ascending: true })
        .range((page - 1) * limit, page * limit - 1);
      if (error) rethrow(error);
      const items: CaseDto[] = (data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        kind: row.kind as CaseDto['kind'],
        image_url: String(row.image_url),
        base_price: money(row.base_price),
        key_price: money(row.key_price),
        min_level: Number(row.min_level),
        section: String(row.section),
        enabled: Boolean(row.enabled),
      }));
      return { items, total: count ?? items.length };
    },

    async listSkus(): Promise<SkuDto[]> {
      const { data, error } = await client
        .from('sku_catalog')
        .select('sku, kind, title_ru, amount_xtr, active, preview_url')
        .eq('active', true)
        .order('sort_order');
      if (error) rethrow(error);
      return (data ?? []).map((row) => ({
        sku: String(row.sku),
        kind: row.kind as SkuDto['kind'],
        title_ru: String(row.title_ru),
        amount_xtr: Number(row.amount_xtr),
        active: Boolean(row.active),
        preview_url: row.preview_url as string | null,
      }));
    },

    async listFlags() {
      const { data, error } = await client.from('admin_flags').select('key, value');
      if (error) rethrow(error);
      return Object.fromEntries((data ?? []).map((row) => [String(row.key), row.value]));
    },

    async openCase(args) {
      const data = await rpc<OpenCaseResponse>('open_case', {
        p_telegram_user_id: args.telegramUserId,
        p_case_id: args.caseId,
        p_count: args.count,
        p_client_seed: args.clientSeed,
        p_idempotency_key: args.idempotencyKey,
        p_auto_sell_below: args.autoSellBelow === null ? null : Number(args.autoSellBelow),
      });
      return data;
    },

    async sellItems(telegramUserId, itemIds, idempotencyKey) {
      return rpc('sell_items', {
        p_telegram_user_id: telegramUserId,
        p_ids: itemIds,
        p_idempotency_key: idempotencyKey,
      });
    },

    async massSell(telegramUserId, maxPrice, idempotencyKey) {
      return rpc('mass_sell', {
        p_telegram_user_id: telegramUserId,
        p_max_price: Number(maxPrice),
        p_idempotency_key: idempotencyKey,
      });
    },

    async createStarPayment(telegramUserId, sku, amountXtr, idempotencyKey) {
      const invoicePayload = crypto.randomUUID();
      const { data, error } = await client
        .from('star_payments')
        .insert({
          telegram_user_id: telegramUserId,
          sku,
          amount_xtr: amountXtr,
          invoice_payload: invoicePayload,
          status: 'pending',
          idempotency_key: idempotencyKey,
        })
        .select('id, telegram_user_id, sku, amount_xtr, invoice_payload, status')
        .single();
      if (error) rethrow(error, 'IDEMPOTENCY_CONFLICT');
      return data as unknown as StarPaymentRecord;
    },

    async getStarPayment(id, telegramUserId) {
      const { data, error } = await client
        .from('star_payments')
        .select('id, telegram_user_id, sku, amount_xtr, invoice_payload, status')
        .eq('id', id)
        .eq('telegram_user_id', telegramUserId)
        .maybeSingle();
      if (error) rethrow(error);
      return (data as unknown as StarPaymentRecord) ?? null;
    },

    async findPaymentByPayload(payload) {
      const { data, error } = await client
        .from('star_payments')
        .select('id, telegram_user_id, sku, amount_xtr, invoice_payload, status')
        .eq('invoice_payload', payload)
        .maybeSingle();
      if (error) rethrow(error);
      return (data as unknown as StarPaymentRecord) ?? null;
    },

    async grantEntitlement(payload, chargeId, raw) {
      return rpc('grant_entitlement', {
        p_invoice_payload: payload,
        p_charge_id: chargeId,
        p_raw: raw,
      });
    },

    async revokeEntitlement(chargeId) {
      await rpc('revoke_entitlement', { p_charge_id: chargeId });
    },

    async listEntitlements(telegramUserId) {
      const { data, error } = await client
        .from('entitlements')
        .select('sku')
        .eq('telegram_user_id', telegramUserId)
        .is('revoked_at', null);
      if (error) rethrow(error);
      return (data ?? []).map((row) => String(row.sku));
    },
  };
}

function normalizeProfile(profile: Record<string, unknown>): Partial<MeRecord> {
  return {
    id: String(profile.id),
    level: Number(profile.level),
    xp: Number(profile.xp),
    referral_code: String(profile.referral_code),
    agent_id: (profile.agent_id as string | null) ?? null,
    locale: String(profile.locale ?? 'ru'),
    accepted_terms_at: (profile.accepted_terms_at as string | null) ?? null,
  };
}
