import type { CaseDto, OpenCaseResponse, SkuDto } from '@case-sim/shared';

export interface MeRecord {
  id: string;
  telegram_user_id: number;
  level: number;
  xp: number;
  balance: string;
  referral_code: string;
  agent_id: string | null;
  locale: string;
  accepted_terms_at: string | null;
}

export interface NewUserInput {
  telegramUserId: number;
  username: string | null;
  firstName: string | null;
  photoUrl: string | null;
  languageCode: string;
}

export interface StarPaymentRecord {
  id: string;
  telegram_user_id: number;
  sku: string;
  amount_xtr: number;
  invoice_payload: string;
  status: 'pending' | 'paid' | 'refunded' | 'failed';
}

export interface DbPort {
  health(): Promise<boolean>;
  consumeQueryId(queryId: string, telegramUserId: number): Promise<boolean>;
  ensureUser(input: NewUserInput): Promise<MeRecord>;
  getMe(telegramUserId: number): Promise<MeRecord | null>;
  acceptTerms(telegramUserId: number): Promise<void>;
  listCases(tab: string, page: number, limit: number): Promise<{ items: CaseDto[]; total: number }>;
  listSkus(): Promise<SkuDto[]>;
  listFlags(): Promise<Record<string, unknown>>;
  openCase(args: {
    telegramUserId: number;
    caseId: string;
    count: number;
    clientSeed: string;
    idempotencyKey: string;
    autoSellBelow: string | null;
  }): Promise<OpenCaseResponse>;
  sellItems(telegramUserId: number, itemIds: string[], idempotencyKey: string): Promise<{ count: number; total: string }>;
  massSell(telegramUserId: number, maxPrice: string, idempotencyKey: string): Promise<{ count: number; total: string }>;
  createStarPayment(telegramUserId: number, sku: string, amountXtr: number, idempotencyKey: string): Promise<StarPaymentRecord>;
  getStarPayment(id: string, telegramUserId: number): Promise<StarPaymentRecord | null>;
  findPaymentByPayload(payload: string): Promise<StarPaymentRecord | null>;
  grantEntitlement(payload: string, chargeId: string, raw: unknown): Promise<unknown>;
  revokeEntitlement(chargeId: string): Promise<void>;
  listEntitlements(telegramUserId: number): Promise<string[]>;
}
