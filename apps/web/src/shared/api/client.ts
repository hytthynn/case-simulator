import type {
  AuthResponse,
  CaseDto,
  OpenCaseRequest,
  OpenCaseResponse,
  SkuDto,
} from '@case-sim/shared';

const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
/** В dev Vite проксирует /v1 на http://127.0.0.1:3000 (vite.config.ts). */
export const API_BASE = configuredBase ? `${configuredBase.replace(/\/$/, '')}/v1` : '/v1';

export interface GameDto {
  key: string;
  ru: string;
  level: number;
  rtp: number;
  disabled: boolean;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('OFFLINE_REQUIRED', 'Нет соединения с сервером', 0);
  }
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      String(payload.code ?? 'INTERNAL'),
      String(payload.message ?? 'Ошибка сервера'),
      response.status,
      (payload.details as Record<string, unknown>) ?? {},
    );
  }
  return payload as T;
}

/** initData передаётся ТОЛЬКО в заголовке, никогда в URL/логах. */
export function authenticate(initData: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/telegram', {
    method: 'POST',
    headers: { Authorization: `tma ${initData}` },
  });
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export function getMe(token: string) {
  return request<{ balance: string; level: number; xp: number; referral_code: string; entitlements: string[] }>(
    '/me',
    { headers: authHeader(token) },
  );
}

export function fetchCases(tab: string, page = 1, limit = 60): Promise<Paginated<CaseDto>> {
  return request<Paginated<CaseDto>>(`/catalog/cases?tab=${encodeURIComponent(tab)}&page=${page}&limit=${limit}`);
}

export function fetchGames(): Promise<{ items: GameDto[] }> {
  return request<{ items: GameDto[] }>('/games');
}

export function fetchSkus(): Promise<{ items: SkuDto[] }> {
  return request<{ items: SkuDto[] }>('/catalog/skus');
}

export function openCase(token: string, body: OpenCaseRequest): Promise<OpenCaseResponse> {
  return request<OpenCaseResponse>('/cases/open', {
    method: 'POST',
    headers: { ...authHeader(token), 'Idempotency-Key': body.idempotency_key },
    body: JSON.stringify(body),
  });
}

export function acceptTerms(token: string): Promise<{ accepted: boolean }> {
  return request('/me/accept-terms', { method: 'POST', headers: authHeader(token) });
}

export function createInvoice(token: string, sku: string, idempotencyKey: string) {
  return request<{ invoice_url: string; currency: 'XTR'; amount_xtr: number }>('/payments/invoice', {
    method: 'POST',
    headers: { ...authHeader(token), 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ sku, idempotency_key: idempotencyKey }),
  });
}

export function getServerTime(): Promise<{ now_ms: number }> {
  return request('/time');
}
