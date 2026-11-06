import { z } from 'zod';

/**
 * Секреты — только из переменных окружения Railway/Supabase Secrets.
 * Пустые значения допустимы в dev: приложение поднимается с in-memory адаптером,
 * но НЕ считается готовым к продовому деплою (Q-01/Q-02).
 */
const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_BOT_USERNAME: z.string().default(''),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(''),
  TELEGRAM_WEBHOOK_URL: z.string().default(''),
  // CI может передать пустую строку вместо незаданной переменной — не падаем.
  TELEGRAM_USE_TEST_ENV: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SUPABASE_URL: z.string().default(''),
  SUPABASE_SECRET_KEY: z.string().default(''),
  SUPABASE_PUBLISHABLE_KEY: z.string().default(''),
  /** Приватный ES256 JWK (Supabase JWT Signing Keys) в виде JSON-строки. */
  SUPABASE_JWT_JWK: z.string().default(''),
  INIT_DATA_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  LOG_LEVEL: z.string().default('info'),
  VERSION: z.string().default('0.2.0'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}

/** Плейсхолдеры из .env.example нельзя считать настроенными значениями. */
export function isPlaceholder(value: string): boolean {
  const v = value.trim();
  return v === '' || /<[^>]+>|\.\.\.|example\.com|your[-_]?domain|project-ref/i.test(v);
}

function usable(value: string): boolean {
  return !isPlaceholder(value);
}

/** Выбор адаптера БД: Supabase только при реальных (не плейсхолдерных) ключах. */
export function hasSupabaseConfig(env: Env): boolean {
  return usable(env.SUPABASE_URL) && usable(env.SUPABASE_SECRET_KEY) && env.SUPABASE_URL.startsWith('https://');
}

/** /health не должен лгать: проверяем не только непустоту, но и форму значений. */
export function isProductionReady(env: Env): boolean {
  if (
    ![
      env.TELEGRAM_BOT_TOKEN,
      env.TELEGRAM_WEBHOOK_SECRET,
      env.TELEGRAM_WEBHOOK_URL,
      env.SUPABASE_URL,
      env.SUPABASE_SECRET_KEY,
      env.SUPABASE_JWT_JWK,
    ].every(usable)
  ) {
    return false;
  }
  if (!env.TELEGRAM_WEBHOOK_URL.startsWith('https://')) return false;
  if (!env.TELEGRAM_WEBHOOK_URL.endsWith('/telegram/webhook')) return false;
  if (!hasSupabaseConfig(env)) return false;
  try {
    const jwk = JSON.parse(env.SUPABASE_JWT_JWK) as { kty?: string; d?: string; kid?: string };
    return jwk.kty === 'EC' && Boolean(jwk.d) && Boolean(jwk.kid);
  } catch {
    return false;
  }
}
