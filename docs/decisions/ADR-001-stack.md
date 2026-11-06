# ADR-001 · Стек: Vite/React SPA + Node/Railway + Supabase

- **Дата:** 2026-11-06 · **Статус:** принято
- **Связано:** [`04-architecture.md`](../04-architecture.md), [`00-ТЗ.md`](../00-ТЗ.md) §9

## Контекст
Нужно перенести Flutter-приложение (AOT Dart без исходников) в Telegram Mini App с 1:1 UI, 60fps рулеткой, ~15 000 изображений, реальным онлайном и платежами XTR. Заказчик зафиксировал Supabase (БД) и Railway (деплой).

## Рассмотренные варианты

| Вариант | Плюсы | Минусы |
|---|---|---|
| **A. Vite + React 19 + TS SPA; Node/Hono/grammY на Railway; Supabase** | Малый бандл, точный контроль DOM/canvas, зрелые TMA-хуки, долгоживущий процесс для вебхуков и раундов | Два деплоя (SPA + сервер) |
| B. Flutter Web | Переиспользование идеи оригинала | Исходников нет; бандл в МБ; CanvasKit/FPS; конфликт с `window.Telegram`; нет XTR-интеграции из коробки |
| C. Next.js / SvelteKit | SSR, файловая маршрутизация | SSR не нужен в webview, лишний рантайм и вес |
| D. Всё на Supabase Edge Functions | Один деплой, Deno/TS | 256 MB / CPU 2 с / cold starts / нет долгоживущего WS-бота / HTML только с custom domain |
| E. Vue / Svelte SPA | Легче React | Меньше готовых Telegram-библиотек и типов |

## Решение
**Вариант A, гибрид:**
- `apps/web` — Vite + React 19 + TypeScript + Tailwind CSS 4 + Zustand + TanStack Query + Motion; Canvas 2D для рулетки, порт Three.js из `coin.html` для Coinflip. Статика → Cloudflare Pages/CDN.
- `apps/bot` — Node 22 + Hono + grammY на Railway (`europe-west4-drams3a`): вебхуки Telegram, XTR, координация раундов, RNG, воркеры, админка, `/health`.
- `packages/shared` — Zod-схемы, типы, константы, provably-fair, XTR-SKU, i18n-ключи.
- `packages/db` — миграции, seed, RPC, сгенерированные типы.
- Supabase: Postgres + RLS + RPC + Realtime Broadcast + Storage + pg_cron + лёгкие Edge Functions.
- pnpm workspaces + Turborepo; Vitest / Playwright / pgTAP / k6; GitHub Actions.

## Последствия
**Плюсы:** минимальный бандл для webview; серверная авторитетность; атомарные ставки; горизонтальное масштабирование API; общие типы исключают рассинхрон контрактов; CDN для 15k картинок.
**Минусы:** два пайплайна деплоя; нужно следить за версиями пакетов; Railway ↔ Supabase требует direct-подключения и корректного пулера (`prepare:false` для 6543).
**Риски:** актуальность версий Vite/TS проверить на этапе 1 (V-07); пинг из региона замерить (V-09).

## Альтернатива при росте нагрузки
Вынести координацию раундов в отдельный Railway-сервис с `pg_advisory_lock`; Realtime оставить на Supabase Broadcast. Полный отказ от Railway в пользу Edge Functions возможен только при отказе от долгоживущего бота — не рассматривается.
