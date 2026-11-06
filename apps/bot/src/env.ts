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
  TELEGRAM_USE_TEST_ENV: z
    .enum(['true', 'false'])
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

export function isProductionReady(env: Env): boolean {
  return Boolean(
    env.TELEGRAM_BOT_TOKEN &&
      env.TELEGRAM_WEBHOOK_SECRET &&
      env.SUPABASE_URL &&
      env.SUPABASE_SECRET_KEY &&
      env.SUPABASE_JWT_JWK,
  );
}
