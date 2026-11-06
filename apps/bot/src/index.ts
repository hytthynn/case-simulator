import { serve } from '@hono/node-server';
import { createJwtSigner } from './auth/jwt.js';
import { createApp } from './app.js';
import { isProductionReady, loadEnv } from './env.js';
import { createMemoryDb } from './lib/memory-db.js';
import { createSupabaseDb } from './lib/supabase-db.js';
import { createTelegramPort } from './telegram/port.js';

const env = loadEnv();
const jwt = await createJwtSigner(env.SUPABASE_JWT_JWK);
const db =
  env.SUPABASE_URL && env.SUPABASE_SECRET_KEY
    ? createSupabaseDb(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY)
    : createMemoryDb();
const telegram = createTelegramPort(env);
const app = createApp({ env, db, telegram, jwt });

const server = serve(
  { fetch: app.fetch, hostname: '0.0.0.0', port: env.PORT },
  (info) => {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'server_started',
        port: info.port,
        version: env.VERSION,
        mode: env.SUPABASE_URL && env.SUPABASE_SECRET_KEY ? 'supabase' : 'memory-dev',
        production_ready: isProductionReady(env),
      }),
    );
    if (!isProductionReady(env)) {
      console.warn(
        '[case-sim] Q-01/Q-02 не закрыты: нет BOT_TOKEN / webhook secret / Supabase / JWK. ' +
          'Сервис работает в dev-режиме на in-memory БД, деплой и XTR-платежи недоступны.',
      );
    }
  },
);

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
