import { describe, expect, it } from 'vitest';
import { hasSupabaseConfig, isProductionReady, loadEnv } from '../src/env.js';

const base = {
  TELEGRAM_BOT_TOKEN: '123456789:AA-abcdefghijklmnopqrstuvwxyz123456789',
  TELEGRAM_WEBHOOK_SECRET: '0123456789abcdef0123456789abcdef',
  TELEGRAM_WEBHOOK_URL: 'https://api.casesim.dev/telegram/webhook',
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_realvalue',
  SUPABASE_JWT_JWK: '{"kty":"EC","crv":"P-256","d":"aaa","x":"bbb","y":"ccc","kid":"key-1"}',
};

const make = (overrides: Record<string, string> = {}) => loadEnv({ ...base, ...overrides } as NodeJS.ProcessEnv);

describe('конфигурация окружения', () => {
  it('корректная конфигурация готова к продовому деплою', () => {
    const env = make();
    expect(hasSupabaseConfig(env)).toBe(true);
    expect(isProductionReady(env)).toBe(true);
  });

  it('плейсхолдеры из .env.example НЕ считаются настроенными', () => {
    const env = make({
      SUPABASE_URL: 'https://<project-ref>.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_...',
    });
    expect(hasSupabaseConfig(env)).toBe(false);
    expect(isProductionReady(env)).toBe(false);
  });

  it('пустой токен, не-HTTPS и неверный путь вебхука блокируют production_ready', () => {
    expect(isProductionReady(make({ TELEGRAM_BOT_TOKEN: '' }))).toBe(false);
    expect(isProductionReady(make({ TELEGRAM_WEBHOOK_URL: 'http://api.example.com/telegram/webhook' }))).toBe(false);
    expect(isProductionReady(make({ TELEGRAM_WEBHOOK_URL: 'https://api.example.com/webhook' }))).toBe(false);
  });

  it('JWK без kid или с битым JSON не проходит проверку', () => {
    expect(isProductionReady(make({ SUPABASE_JWT_JWK: 'not-json' }))).toBe(false);
    expect(isProductionReady(make({ SUPABASE_JWT_JWK: '{"kty":"EC","d":"aaa"}' }))).toBe(false);
  });

  it('CI может передать пустой TELEGRAM_USE_TEST_ENV без падения', () => {
    expect(make({ TELEGRAM_USE_TEST_ENV: '' }).TELEGRAM_USE_TEST_ENV).toBe(false);
    expect(make({ TELEGRAM_USE_TEST_ENV: 'true' }).TELEGRAM_USE_TEST_ENV).toBe(true);
  });
});
