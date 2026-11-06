import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '@case-sim/shared';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface ValidatedInitData {
  telegramUserId: number;
  queryId: string;
  authDate: number;
  user: TelegramUser;
  startParam: string | null;
}

/**
 * Каноническая валидация initData (docs/07-security.md §2, ADR-002).
 * ВАЖНО: initData приходит ТОЛЬКО в заголовке `Authorization: tma …`,
 * никогда в URL/логах/аналитике. initDataUnsafe на сервере не используется.
 */
export function validateInitData(
  raw: string,
  botToken: string,
  ttlSeconds: number,
  nowMs: number = Date.now(),
): ValidatedInitData {
  if (!raw || !botToken) throw new AppError('INVALID_INIT_DATA');

  const params = new URLSearchParams(raw);
  const receivedHash = params.get('hash') ?? '';
  // Third-party Ed25519 signature (Bot API 8.0+) в нашем флоу не участвует.
  params.delete('hash');
  params.delete('signature');

  if (!receivedHash) throw new AppError('INVALID_INIT_DATA');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(receivedHash, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError('INVALID_INIT_DATA');
  }

  const authDate = Number(params.get('auth_date') ?? 0);
  if (!Number.isFinite(authDate) || Math.abs(nowMs / 1000 - authDate) > ttlSeconds) {
    throw new AppError('TOKEN_EXPIRED');
  }

  let user: TelegramUser;
  try {
    user = JSON.parse(params.get('user') ?? '') as TelegramUser;
  } catch {
    throw new AppError('INVALID_INIT_DATA');
  }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new AppError('INVALID_INIT_DATA');
  }

  return {
    telegramUserId: user.id,
    queryId: params.get('query_id') ?? '',
    authDate,
    user,
    startParam: params.get('start_param'),
  };
}

/** Подпись для unit-тестов и локальной отладки (НЕ для продакшена). */
export function signInitData(
  params: Record<string, string>,
  botToken: string,
): string {
  const entries = Object.entries(params)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const result = new URLSearchParams({ ...params, hash });
  return result.toString();
}
