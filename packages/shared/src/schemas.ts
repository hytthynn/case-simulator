/**
 * Zod-контракты — единственный источник истины для клиента и сервера
 * (docs/06-api.md §13). Изменение ответа = правка 06-api.md + changelog.
 */
import { z } from 'zod';
import { CASE_TABS, GAME_KEYS, OPEN_COUNTS, RARITY_ORDER, WEAR_ORDER } from './constants.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `z.uuid()` в Zod 4 / `z.string().uuid()` в Zod 3 — держим собственный regex, чтобы контракт не зависел от минорной версии. */
export const uuid = z.string().regex(UUID_RE, 'Ожидается UUID v4/v5');
export const idempotencyKey = uuid;
export const virtualMoney = z.string().regex(/^\d+\.\d{2}$/, 'Виртуальная сумма: строка «0.00»');
export const telegramUserId = z.number().int().positive();

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    has_more: z.boolean(),
  });

export const raritySchema = z.enum(RARITY_ORDER);
export const wearSchema = z.enum(WEAR_ORDER);
export const gameKeySchema = z.enum(GAME_KEYS);
export const caseTabSchema = z.enum(CASE_TABS);

export const caseSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['case', 'capsule', 'souvenir', 'black_market']),
  image_url: z.string(),
  base_price: virtualMoney,
  key_price: virtualMoney,
  min_level: z.number().int().min(1),
  section: z.string(),
  enabled: z.boolean(),
});
export type CaseDto = z.infer<typeof caseSchema>;

export const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['skin', 'knife', 'glove', 'sticker', 'agent', 'package']),
  rarity: raritySchema,
  image_url: z.string(),
  base_price: virtualMoney,
  stattrak_eligible: z.boolean(),
});
export type ItemDto = z.infer<typeof itemSchema>;

export const skuSchema = z.object({
  sku: z.string(),
  kind: z.enum(['cosmetic', 'convenience', 'bundle']),
  title_ru: z.string(),
  amount_xtr: z.number().int().positive(),
  active: z.boolean(),
  preview_url: z.string().nullable(),
});
export type SkuDto = z.infer<typeof skuSchema>;

export const inventoryItemSchema = z.object({
  id: uuid,
  item_id: z.string(),
  name: z.string(),
  rarity: raritySchema,
  wear: wearSchema.nullable(),
  float_value: z.number().min(0).max(1).nullable(),
  stattrak: z.boolean(),
  price: virtualMoney,
  image_url: z.string(),
  locked: z.boolean(),
  acquired_at: z.string(),
});
export type InventoryItemDto = z.infer<typeof inventoryItemSchema>;

export const userSchema = z.object({
  id: uuid,
  telegram_user_id: telegramUserId,
  level: z.number().int(),
  xp: z.number().int(),
  balance: virtualMoney,
  referral_code: z.string(),
  agent_id: z.string().nullable(),
  locale: z.string(),
  accepted_terms_at: z.string().nullable(),
});
export type UserDto = z.infer<typeof userSchema>;

export const authResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  user: userSchema,
  server_time_ms: z.number().int(),
  flags: z.record(z.string(), z.unknown()),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

/** POST /cases/open — docs/06-api.md §5 */
export const openCaseRequestSchema = z.object({
  case_id: z.string().min(1),
  count: z.number().int().refine((v) => (OPEN_COUNTS as readonly number[]).includes(v), {
    message: 'Допустимо 1, 2, 3, 5 или 6 кейсов (массовое открытие — /cases/mass-open)',
  }),
  client_seed: z.string().min(1).max(128).optional(),
  idempotency_key: idempotencyKey,
  options: z
    .object({
      auto_select: z.boolean().default(false),
      auto_sell_below: virtualMoney.nullable().default(null),
    })
    .default({ auto_select: false, auto_sell_below: null }),
});
export type OpenCaseRequest = z.infer<typeof openCaseRequestSchema>;

export const rollSchema = z.object({
  roll_id: uuid,
  item_id: z.string(),
  name: z.string(),
  rarity: raritySchema,
  wear: wearSchema.nullable(),
  float_value: z.number().min(0).max(1).nullable(),
  stattrak: z.boolean(),
  price: virtualMoney,
  server_seed_hash: z.string().length(64),
  nonce: z.number().int(),
  digest_hex: z.string().length(64),
});
export type RollDto = z.infer<typeof rollSchema>;

export const openCaseResponseSchema = z.object({
  rolls: z.array(rollSchema),
  balance_after: virtualMoney,
  inventory_item_ids: z.array(uuid),
  auto_sold: z.array(uuid),
});
export type OpenCaseResponse = z.infer<typeof openCaseResponseSchema>;

export const sellRequestSchema = z.object({
  item_ids: z.array(uuid).min(1).max(500),
  idempotency_key: idempotencyKey,
});

export const massSellRequestSchema = z.object({
  max_price: virtualMoney,
  idempotency_key: idempotencyKey,
});

/** POST /payments/invoice — только XTR, только косметика/бусты (D-01). */
export const invoiceRequestSchema = z.object({
  sku: z.string().min(1),
  idempotency_key: idempotencyKey,
});
export type InvoiceRequest = z.infer<typeof invoiceRequestSchema>;

export const invoiceResponseSchema = z.object({
  invoice_url: z.string().url(),
  payment_id: uuid,
  currency: z.literal('XTR'),
  amount_xtr: z.number().int().positive(),
});

export const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  request_id: z.string(),
  details: z.record(z.string(), z.unknown()),
});

export const timeResponseSchema = z.object({ now_ms: z.number().int() });

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  db: z.enum(['ok', 'down', 'unknown']),
  bot: z.enum(['ok', 'down', 'unknown']),
  version: z.string(),
});
