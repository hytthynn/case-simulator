import { describe, expect, it } from 'vitest';
import { AppError } from '@case-sim/shared';
import { signInitData, validateInitData } from '../src/auth/init-data.js';
import { createJwtSigner } from '../src/auth/jwt.js';

const TOKEN = '123456:AA-TEST-TOKEN';
const NOW = 1_800_000_000_000;

function params(overrides: Record<string, string> = {}) {
  return {
    auth_date: String(Math.floor(NOW / 1000)),
    query_id: 'AAH-q1',
    user: JSON.stringify({ id: 424242, first_name: 'Тест', language_code: 'ru' }),
    ...overrides,
  };
}

describe('initData HMAC (ADR-002)', () => {
  it('принимает корректно подписанные данные', () => {
    const initData = signInitData(params(), TOKEN);
    const result = validateInitData(initData, TOKEN, 3600, NOW);
    expect(result.telegramUserId).toBe(424242);
    expect(result.queryId).toBe('AAH-q1');
    expect(result.user.language_code).toBe('ru');
  });

  it('отвергает подмену любого поля', () => {
    const signed = signInitData(params(), TOKEN);
    const tampered = new URLSearchParams(signed);
    tampered.set('user', JSON.stringify({ id: 999999 }));
    expect(() => validateInitData(tampered.toString(), TOKEN, 3600, NOW)).toThrow(AppError);
  });

  it('отвергает неверный токен и отсутствие hash', () => {
    const signed = signInitData(params(), TOKEN);
    expect(() => validateInitData(signed, 'other-token', 3600, NOW)).toThrow(/Telegram/);
    expect(() => validateInitData('auth_date=1', TOKEN, 3600, NOW)).toThrow(AppError);
  });

  it('проверяет TTL auth_date', () => {
    const signed = signInitData(params({ auth_date: String(Math.floor(NOW / 1000) - 7200) }), TOKEN);
    try {
      validateInitData(signed, TOKEN, 3600, NOW);
      throw new Error('должен был упасть');
    } catch (err) {
      expect((err as AppError).code).toBe('TOKEN_EXPIRED');
    }
  });

  it('отвергает некорректный user.id', () => {
    const signed = signInitData(params({ user: JSON.stringify({ id: -1 }) }), TOKEN);
    expect(() => validateInitData(signed, TOKEN, 3600, NOW)).toThrow(AppError);
  });
});

describe('ES256 JWT', () => {
  it('выпускает и проверяет токен с app_metadata.telegram_user_id', async () => {
    const signer = await createJwtSigner('', 3600);
    const tokens = await signer.issue(424242, 'user-uuid', NOW);
    expect(tokens.access_token.split('.')).toHaveLength(3);
    expect(await signer.verify(tokens.access_token)).toEqual({
      telegramUserId: 424242,
      subject: 'user-uuid',
    });
    expect(signer.publicJwk.kty).toBe('EC');
    expect(signer.publicJwk).not.toHaveProperty('d');
  });

  it('отвергает поддельный и просроченный токен', async () => {
    const signer = await createJwtSigner('', 1);
    const { access_token } = await signer.issue(1, 'sub', NOW);
    await expect(signer.verify(access_token + 'x')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    // jose проверяет exp по системным часам, поэтому берём реальное прошлое.
    const expired = await signer.issue(1, 'sub', Date.now() - 10_000);
    await expect(signer.verify(expired.access_token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
