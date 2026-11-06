# ADR-002 · Авторизация: initData → ES256 JWT → RLS

- **Дата:** 2026-11-06 · **Статус:** принято
- **Связано:** [`07-security.md`](../07-security.md), [`05-database.md`](../05-database.md), [`06-api.md`](../06-api.md)

## Контекст
Mini App получает `Telegram.WebApp.initData` — подписанную строку с `user`, `auth_date`, `query_id`, `hash`. `initDataUnsafe` доступен в браузере и легко подделывается. Нужно: (1) доказать, что запрос от Telegram, (2) дать Supabase RLS идентификатор пользователя, (3) не светить service-ключи.

## Рассмотренные варианты
| Вариант | Вердикт |
|---|---|
| Доверять `initDataUnsafe.user.id` | ❌ подделывается в DevTools |
| Передавать `initData` на клиент в supabase-js | ❌ утечка в логи/URL, нет RLS-контекста |
| `signInWithIdToken` с сырым `initData` | ❌ метод для OIDC-провайдеров, не принимает initData |
| Telegram Login OIDC `id_token` | ⚠️ рабочий, но избыточен внутри Mini App |
| **Собственный ES256 JWT через Supabase JWT Signing Keys** | ✅ рекомендованный путь |
| HS256 на legacy `JWT_SECRET` | ❌ «No longer recommended» |

## Решение
```
WebApp.initData → Authorization: tma <initData> (только заголовок!)
  → HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN) = secret_key
  → data_check_string = sorted(key=value).join("\n"), без hash
  → computed = hex(HMAC_SHA256(secret_key, data_check_string))
  → timingSafeEqual(computed, hash)
  → auth_date TTL ≤ 3600 с + anti-replay по query_id
  → ES256 JWT (Signing Keys): { sub, role:"authenticated", exp,
      app_metadata: { telegram_user_id } }
  → клиент: Authorization: Bearer <JWT> + apikey: sb_publishable_...
  → RLS: (select auth.jwt()->'app_metadata'->>'telegram_user_id')::bigint
          = telegram_user_id
```

## Ключевые правила
- `app_metadata`, **не** `user_metadata` (последний меняется пользователем).
- `initData` никогда не попадает в URL, логи, Sentry, аналитику.
- `BOT_TOKEN`, приватный JWK, `sb_secret_...` — только Railway/Supabase Secrets.
- Клиенту — только `sb_publishable_...`; `service_role` обходит RLS и на клиенте недопустим.
- `revoke all from anon, authenticated` + точечные `grant select`; запись только через `SECURITY DEFINER` RPC.
- JWKS кэшируется 10–20 мин; ротация ключей по регламенту [`10-ops-deploy.md`](../10-ops-deploy.md).
- pgTAP-тест: пользователь A не видит строки B; `anon` не видит ничего.

## Последствия
**Плюсы:** подмена пользователя невозможна; RLS работает нативно; короткоживущие токены; аудируемость.
**Минусы:** нужна корректная настройка Signing Keys и ротации; clock-skew требует NTP; при утере JWK — недоступность auth (бэкап ключа в secrets + процедура ротации).

## Проверка
`07-security.md` §10, тесты EC/SEC в `11-testing-qa.md`, BUG-008 (CSP) остаётся открытым.
