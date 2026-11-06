import { randomUUID } from 'node:crypto';
import {
  AppError,
  RARITY_COLORS,
  SKU_CATALOG,
  type CaseDto,
  type OpenCaseResponse,
  type SkuDto,
} from '@case-sim/shared';
import {
  deriveUniform,
  formatVirtualMoney,
  generateServerSeed,
  selectRarity,
  sha256Hex,
  wearFromFloat,
} from '@case-sim/shared/provably-fair';
import type { DbPort, MeRecord, NewUserInput, StarPaymentRecord } from './db-port.js';

interface MemoryItem {
  id: string;
  name: string;
  rarity: keyof typeof RARITY_COLORS;
  price: number;
  stattrakEligible: boolean;
}

interface InventoryRow {
  id: string;
  telegramUserId: number;
  itemId: string;
  price: number;
  name: string;
}

const DEMO_CASES: CaseDto[] = [
  ['kilowatt-case', 'Kilowatt Case', 2.5],
  ['revolution-case', 'Revolution Case', 1.9],
  ['spectrum-2-case', 'Spectrum 2 Case', 3.2],
  ['chroma-3-case', 'Chroma 3 Case', 2.1],
  ['glove-case', 'Glove Case', 6.4],
  ['horizon-case', 'Horizon Case', 1.4],
  ['prisma-case', 'Prisma Case', 1.2],
  ['cs20-case', 'CS20 Case', 2.8],
  ['fracture-case', 'Fracture Case', 0.9],
  ['operation-bravo-case', 'Operation Bravo Case', 12.5],
  ['dreams-nightmares-case', 'Dreams & Nightmares Case', 1.1],
  ['recoil-case', 'Recoil Case', 0.8],
].map(([id, name, price], index) => ({
  id: String(id),
  name: String(name),
  kind: 'case' as const,
  image_url: `catalog/cases/${encodeURIComponent(String(id))}.png`,
  base_price: formatVirtualMoney(Number(price)),
  key_price: '0.00',
  min_level: 1,
  section: 'cases',
  enabled: true,
  sort_order: index,
})) as CaseDto[];

const DEMO_ITEMS: MemoryItem[] = [
  { id: 'AK-47 | Inheritance', name: 'AK-47 | Inheritance', rarity: 'classified', price: 0.87, stattrakEligible: true },
  { id: 'M4A1-S | Printstream', name: 'M4A1-S | Printstream', rarity: 'covert', price: 24.5, stattrakEligible: true },
  { id: 'USP-S | Whiteout', name: 'USP-S | Whiteout', rarity: 'restricted', price: 4.2, stattrakEligible: true },
  { id: 'Glock-18 | Water Elemental', name: 'Glock-18 | Water Elemental', rarity: 'mil_spec', price: 0.32, stattrakEligible: true },
  { id: 'P250 | See Ya Later', name: 'P250 | See Ya Later', rarity: 'mil_spec', price: 0.18, stattrakEligible: true },
  { id: '★ Kukri Knife | Fade', name: '★ Kukri Knife | Fade', rarity: 'rare_special', price: 480.0, stattrakEligible: false },
  { id: 'AWP | Asiimov', name: 'AWP | Asiimov', rarity: 'covert', price: 38.9, stattrakEligible: true },
  { id: 'Desert Eagle | Blaze', name: 'Desert Eagle | Blaze', rarity: 'restricted', price: 18.7, stattrakEligible: false },
  { id: 'MP9 | Starlight Protector', name: 'MP9 | Starlight Protector', rarity: 'classified', price: 1.35, stattrakEligible: true },
  { id: 'Nova | Sand Dune', name: 'Nova | Sand Dune', rarity: 'industrial', price: 0.03, stattrakEligible: false },
];

/**
 * Dev/тестовый адаптер: приложение поднимается БЕЗ Supabase и BOT_TOKEN (Q-01/Q-02).
 * НЕ источник истины для продакшена; экономика повторяет контракт RPC и
 * использует тот же HMAC-RNG, что и сервер (никакого Math.random).
 */
export function createMemoryDb(): DbPort {
  const users = new Map<number, MeRecord>();
  const inventory = new Map<string, InventoryRow>();
  const payments = new Map<string, StarPaymentRecord>();
  const entitlements = new Map<number, Set<string>>();
  const idempotency = new Map<string, OpenCaseResponse>();
  const usedQueryIds = new Set<string>();
  const serverSeed = generateServerSeed();
  const seedHash = sha256Hex(serverSeed);
  let nonce = 0;

  function requireUser(telegramUserId: number): MeRecord {
    const user = users.get(telegramUserId);
    if (!user) throw new AppError('UNAUTHORIZED');
    return user;
  }

  async function sellItems(telegramUserId: number, itemIds: string[]): Promise<{ count: number; total: string }> {
    requireUser(telegramUserId);
    let total = 0;
    for (const id of itemIds) {
      const row = inventory.get(id);
      if (row && row.telegramUserId === telegramUserId) {
        total += row.price;
        inventory.delete(id);
      }
    }
    const user = requireUser(telegramUserId);
    users.set(telegramUserId, {
      ...user,
      balance: formatVirtualMoney(Number(user.balance) + total),
    });
    return { count: itemIds.length, total: formatVirtualMoney(total) };
  }

  return {
    async health() {
      return true;
    },

    async consumeQueryId(queryId, telegramUserId) {
      if (!queryId || usedQueryIds.has(queryId)) return false;
      if (!users.has(telegramUserId)) users.set(telegramUserId, makeUser(telegramUserId));
      usedQueryIds.add(queryId);
      return true;
    },

    async ensureUser(input: NewUserInput) {
      const existing = users.get(input.telegramUserId);
      if (existing) return existing;
      const created = makeUser(input.telegramUserId);
      users.set(input.telegramUserId, created);
      return created;
    },

    async getMe(telegramUserId) {
      return users.get(telegramUserId) ?? null;
    },

    async acceptTerms(telegramUserId) {
      const user = requireUser(telegramUserId);
      users.set(telegramUserId, { ...user, accepted_terms_at: new Date().toISOString() });
    },

    async listCases(tab, page, limit) {
      const filtered = tab === 'black_market' || tab === 'capsules' ? [] : DEMO_CASES;
      return { items: filtered.slice((page - 1) * limit, page * limit), total: filtered.length };
    },

    async listSkus(): Promise<SkuDto[]> {
      return SKU_CATALOG.filter((s) => s.active).map((s) => ({
        sku: s.sku,
        kind: s.kind,
        title_ru: s.titleRu,
        amount_xtr: s.amountXtr,
        active: true,
        preview_url: null,
      }));
    },

    async listFlags() {
      return {
        platform: 'tma',
        min_client_version: '0.2.0',
        maintenance: false,
        game_disabled_crash: false,
      };
    },

    async openCase(args) {
      const cached = idempotency.get(args.idempotencyKey);
      if (cached) return cached;

      const user = requireUser(args.telegramUserId);
      const caseRow = DEMO_CASES.find((c) => c.id === args.caseId);
      if (!caseRow) throw new AppError('NOT_FOUND');
      const cost = Math.round(Number(caseRow.base_price) * args.count * 100) / 100;
      const balance = Number(user.balance);
      if (balance < cost) {
        throw new AppError('INSUFFICIENT_BALANCE', undefined, { required: cost, available: balance });
      }

      const rolls: OpenCaseResponse['rolls'] = [];
      const inventoryIds: string[] = [];
      const autoSold: string[] = [];
      let credits = 0;

      for (let i = 0; i < args.count; i += 1) {
        nonce += 1;
        const fair = deriveUniform(serverSeed, args.clientSeed, nonce, 0);
        const rarity = selectRarity(fair.value);
        const pool = DEMO_ITEMS.filter((item) => item.rarity === rarity);
        const candidates = pool.length ? pool : DEMO_ITEMS;
        const itemIndex = Math.floor(
          deriveUniform(serverSeed, args.clientSeed, nonce, 1).value * candidates.length,
        );
        const item = candidates[Math.min(itemIndex, candidates.length - 1)]!;
        const stRoll = deriveUniform(serverSeed, args.clientSeed, nonce, 2);
        const stattrak = item.stattrakEligible && stRoll.value < 0.1;
        const floatValue = Math.round(deriveUniform(serverSeed, args.clientSeed, nonce, 3).value * 1000) / 1000;
        const wear = wearFromFloat(floatValue);
        const price = Math.round(item.price * (stattrak ? 2 : 1) * 100) / 100;
        const rollId = randomUUID();

        rolls.push({
          roll_id: rollId,
          item_id: item.id,
          name: item.name,
          rarity,
          wear,
          float_value: floatValue,
          stattrak,
          price: formatVirtualMoney(price),
          server_seed_hash: seedHash,
          nonce,
          digest_hex: fair.digestHex,
        });

        const row: InventoryRow = {
          id: rollId,
          telegramUserId: args.telegramUserId,
          itemId: item.id,
          price,
          name: item.name,
        };
        if (args.autoSellBelow !== null && price <= Number(args.autoSellBelow)) {
          credits += price;
          autoSold.push(rollId);
        } else {
          inventory.set(rollId, row);
          inventoryIds.push(rollId);
        }
      }

      const balanceAfter = Math.round((balance - cost + credits) * 100) / 100;
      users.set(args.telegramUserId, { ...user, balance: formatVirtualMoney(balanceAfter) });
      const response: OpenCaseResponse = {
        rolls,
        balance_after: formatVirtualMoney(balanceAfter),
        inventory_item_ids: inventoryIds,
        auto_sold: autoSold,
      };
      idempotency.set(args.idempotencyKey, response);
      return response;
    },

    sellItems,

    async massSell(telegramUserId, maxPrice) {
      const ids = [...inventory.values()]
        .filter((row) => row.telegramUserId === telegramUserId && row.price <= Number(maxPrice))
        .map((row) => row.id);
      return sellItems(telegramUserId, ids);
    },

    async createStarPayment(telegramUserId, sku, amountXtr) {
      const record: StarPaymentRecord = {
        id: randomUUID(),
        telegram_user_id: telegramUserId,
        sku,
        amount_xtr: amountXtr,
        invoice_payload: randomUUID(),
        status: 'pending',
      };
      payments.set(record.invoice_payload, record);
      return record;
    },

    async getStarPayment(id, telegramUserId) {
      return [...payments.values()].find((p) => p.id === id && p.telegram_user_id === telegramUserId) ?? null;
    },

    async findPaymentByPayload(payload) {
      return payments.get(payload) ?? null;
    },

    async grantEntitlement(payload, chargeId) {
      const payment = payments.get(payload);
      if (!payment) throw new AppError('NOT_FOUND');
      if (payment.status === 'paid') return { status: 'already_paid' };
      payments.set(payload, { ...payment, status: 'paid' });
      const owned = entitlements.get(payment.telegram_user_id) ?? new Set<string>();
      owned.add(payment.sku);
      entitlements.set(payment.telegram_user_id, owned);
      return { status: 'paid', charge_id: chargeId };
    },

    async revokeEntitlement() {
      // В памяти нет привязки charge_id → платеж; продовая реализация — SQL RPC.
    },

    async listEntitlements(telegramUserId) {
      return [...(entitlements.get(telegramUserId) ?? [])];
    },
  };
}

function makeUser(telegramUserId: number): MeRecord {
  return {
    id: randomUUID(),
    telegram_user_id: telegramUserId,
    level: 1,
    xp: 0,
    balance: '10.00',
    referral_code: `CS${telegramUserId.toString(36).toUpperCase().padStart(6, '0')}`,
    agent_id: null,
    locale: 'ru',
    accepted_terms_at: null,
  };
}

export type { NewUserInput };
