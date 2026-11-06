import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
  type JWK,
} from 'jose';
import { AppError } from '@case-sim/shared';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export interface JwtSigner {
  readonly publicJwk: JWK;
  issue(telegramUserId: number, subject: string, nowMs?: number): Promise<TokenPair>;
  verify(token: string): Promise<{ telegramUserId: number; subject: string }>;
}

function stripPrivate(jwk: JWK): JWK {
  const { kty, crv, x, y, kid, alg, use } = jwk;
  return { kty, crv, x, y, kid, alg, use } as JWK;
}

/**
 * ES256 через Supabase JWT Signing Keys (ADR-002).
 * Если приватный JWK не задан (dev без Q-01), генерируется эфемерная пара —
 * приложение поднимается локально, но токены несовместимы с Supabase RLS.
 */
export async function createJwtSigner(jwkJson: string, ttlSeconds = 3600): Promise<JwtSigner> {
  let privateJwk: JWK;
  let publicJwk: JWK;

  if (jwkJson.trim()) {
    privateJwk = JSON.parse(jwkJson) as JWK;
    if (privateJwk.kty !== 'EC' || !privateJwk.d) {
      throw new Error('SUPABASE_JWT_JWK должен содержать приватный EC/ES256 ключ');
    }
    publicJwk = stripPrivate(privateJwk);
  } else {
    // jose v6 по умолчанию создаёт non-extractable CryptoKey; для JWKS нужен JWK.
    const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
    privateJwk = (await exportJWK(privateKey)) as JWK;
    publicJwk = (await exportJWK(publicKey)) as JWK;
  }

  const kid = privateJwk.kid ?? 'case-sim-dev';
  const privateKey = await importJWK({ ...privateJwk, kid, alg: 'ES256' }, 'ES256');
  const publicKey = await importJWK({ ...publicJwk, kid, alg: 'ES256' }, 'ES256');

  const sign = async (
    telegramUserId: number,
    subject: string,
    type: 'access' | 'refresh',
    ttl: number,
    nowMs: number,
  ): Promise<string> => {
    const issuedAt = Math.floor(nowMs / 1000);
    return new SignJWT({
      role: 'authenticated',
      app_metadata: { telegram_user_id: telegramUserId },
      token_type: type,
    })
      .setProtectedHeader({ alg: 'ES256', kid, typ: 'JWT' })
      .setSubject(subject)
      .setIssuer('case-sim')
      .setAudience('authenticated')
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ttl)
      .sign(privateKey);
  };

  return {
    publicJwk: { ...publicJwk, kid, alg: 'ES256', use: 'sig' },
    async issue(telegramUserId, subject, nowMs = Date.now()) {
      return {
        access_token: await sign(telegramUserId, subject, 'access', ttlSeconds, nowMs),
        refresh_token: await sign(telegramUserId, subject, 'refresh', 30 * 24 * 3600, nowMs),
      };
    },
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, publicKey, {
          algorithms: ['ES256'],
          issuer: 'case-sim',
          audience: 'authenticated',
        });
        const meta = payload.app_metadata as { telegram_user_id?: unknown } | undefined;
        const id = Number(meta?.telegram_user_id);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('bad claim');
        return { telegramUserId: id, subject: String(payload.sub ?? '') };
      } catch {
        throw new AppError('UNAUTHORIZED');
      }
    },
  };
}
