# 09 · Монетизация: Telegram Stars (XTR)

> **Решение D-01:** гибрид — **косметика + отдельные бусты удобства**. Прямая продажа игровой валюты `$` **запрещена**. Бусты **не влияют** на вероятности дропа и исход раунда.
> Правила Telegram (проверено по официальной документации): цифровые товары/услуги — **только** `XTR`, `provider_token` пустой, выдача **только** после `successful_payment`.

---

## 1. Юридические и платформенные ограничения

| Правило | Источник |
|---|---|
| Цифровые товары — исключительно `currency: "XTR"` | `core.telegram.org/bots/payments-stars` |
| `provider_token` можно оставить пустым | там же |
| Один `LabeledPrice`, `amount` — целое число звёзд | Bot API |
| `pre_checkout_query` → `answerPreCheckoutQuery` **≤ 10 с** | там же |
| Выдавать товар только после `successful_payment` | там же |
| Хранить `telegram_payment_charge_id` (поля `charge_id` нет) | Bot API |
| Возврат — `refundStarPayment(user_id, telegram_payment_charge_id)` | Bot API |
| `refunded_payment` приходит как поле `Message` | Bot API 7.7+ |
| Сверка — `getStarTransactions`, `getMyStarBalance` | Bot API |
| `shipping_query` в Stars-флоу не участвует | — |
| Обязательны `/terms`, `/support`, `/paysupport`, оферта и согласие до покупки | Live checklist |
| Другие валюты/провайдеры/крипта → TPA недоступна в мобильных сторах | TOS §6.2 |
| Звёзды не являются собственностью разработчика; вознаграждение через Fragment | TOS §6.2.4 |

**Тестирование:** отдельный бот в test-окружении Telegram (`https://api.telegram.org/bot<token>/test/METHOD_NAME`). Выделенного «Stars sandbox» в доках нет — уточнить на этапе 1.

> Требует проверки на дату релиза: min/max сумма разового XTR-инвойса, точная комиссия и сроки вывода, таблица Star Pricing (зависит от VAT/региона).

---

## 2. Каталог SKU (D-01)

Цены в XTR — **interim, подлежат подтверждению Q-06**. Оригинальные EUR-цены (€3.99 / €4.99 / €6.99) не переносятся напрямую.

### Косметика (`kind: cosmetic`)
| SKU | Что даёт | XTR |
|---|---|---|
| `pack.arcade` | фон + рамка + карточка «Аркадный профиль», эффект | 250 |
| `pack.blood` | «Кровавый профиль»: агент, фон, рамка | 250 |
| `pack.deepSpace` | «Космический профиль» | 250 |
| `pack.neon` | неоновый набор | 250 |
| `pack.smoke` | дымный набор | 250 |
| `pack.void` | «Профиль Void» | 250 |
| `agent.<id>` | один из 9 агентов | 100 |
| `border.<id>` | отдельная рамка | 80 |
| `fx.<id>` | эффект `Aurora / Laser / Plinko / Rain / Smoke / Warp` | 120 |
| `showcase.slot` | +1 слот витрины | 60 |

### Удобство (`kind: convenience`) — **не влияет на шансы**
| SKU | Эффект (из строк оригинала) | XTR |
|---|---|---|
| `boost.noAds` | «Без рекламы навсегда», убирает обязательные паузы/загрузочные рекламные вставки (A-02) | 300 |
| `boost.quickOpen` | «Открывай кейсы вдвое быстрее» | 150 |
| `boost.multiOpen` | «Открывайте 4, 5 или 6 кейсов за раз» | 200 |
| `boost.massOpen` | массовое открытие 200 кейсов | 250 |
| `boost.massOpenOverdrive` | «Поднимает массовое открытие с 200 до 1000 кейсов за раз» | 400 |
| `boost.autoOpenerPro` | автооткрыватель Pro, +слоты | 350 |
| `boost.autoOpenerOverdrive` | ускоренный автооткрыватель | 300 |
| `boost.xp` | «+50 % опыта за каждое действие» / `+5 %` за уровень | 200 |
| `boost.maxBet` | «+$20 000 к максимальной ставке во всех мини-играх» | 350 |
| `boost.caseDiscount` | «35 % скидка на каждый обычный кейс, навсегда» | 300 |
| `boost.vaultSlot` | «Каждый уровень добавляет ещё одно хранилище» | 150 |
| `boost.betterSupplyDrop` | «+150 кейсов к каждой поставке», «мгновенный сбор» | 250 |
| `boost.stickerRemover` | снятие наклейки | 80 |
| `boost.bountyHunter` | «35 % на каждый обычный кейс» / бонусные кейсы | 250 |
| `boost.highRoller` | High Roller-потолок | 350 |
| `boost.eventWheel` | дополнительные спины/event wheel | 150 |
| `unlock.games` | «Открывай все игры сразу», без level-gate | 500 |
| `unlock.cases` | «Открывай премиум-кейсы без требований к уровню» | 500 |

### Комплект
| SKU | Состав | XTR |
|---|---|---|
| `bundle.ultimate` | все бусты + все косметические паки, `savePercent` | 2500 |

### ❌ Запрещённые SKU
`buy.cash.*`, «купить $», «купить кейс за реальные деньги», «гарантированный нож», «повысить шанс дропа», «вывести скины», P2P-переводы, подписки на валюту.

---

## 3. Платёжный флоу (детально)

```
[ Mini App ]  КУПИТЬ ★N
      │ POST /v1/payments/invoice {sku, idempotency_key}
      ▼
[ Railway ]   Проверка: JWT, accepted_terms_at != null, SKU активен, rate limit
              INSERT star_payments(status='pending', invoice_payload=uuid)
      │ bot.api.createInvoiceLink({
      │   title, description, payload: invoice_payload,
      │   provider_token: "", currency: "XTR",
      │   prices: [{ label, amount: amount_xtr }], photo_url
      │ })
      ▼
[ Mini App ]  WebApp.openInvoice(url, cb)  → событие invoiceClosed
      ▼
[ Telegram ]  Пользователь подтверждает оплату звёздами
      │ webhook: pre_checkout_query
      ▼
[ Railway ]   Проверить: пользователь не забанен, SKU активен, pending-заказ существует
              answerPreCheckoutQuery(id, ok=true) ← СТРОГО ≤ 10 с
      │ webhook: successful_payment
      ▼
[ Railway ]   BEGIN
                UPDATE star_payments SET status='paid',
                  telegram_payment_charge_id=…  -- UNIQUE → дубль не пройдёт
                INSERT entitlements(sku, source='stars', charge_id)
                INSERT audit_log, payment_events
              COMMIT
              → Realtime user:<id> «entitlement_granted»
              → бот: «Покупка получена»
      ▼
[ Mini App ]  Оформление/буст доступны; «Восстановить покупки» при расхождении
```

**Возврат:**
```
webhook: Message.refunded_payment
 → entitlement.revoked_at = now()
 → star_payments.status = 'refunded'
 → если буст был израсходован → пометка в audit_log, без «отката» уже завершённых раундов
→ бот: уведомление; при споре — refundStarPayment()
```

**Восстановление покупок:** `POST /payments/restore` сверяет `getStarTransactions` с `star_payments`; недостающие entitlement выдаются идемпотентно.

---

## 4. Идемпотентность и консистентность

| Ситуация | Защита |
|---|---|
| Дубль webhook `successful_payment` | `UNIQUE(telegram_payment_charge_id)` + `ON CONFLICT DO NOTHING` |
| `successful_payment` без нашего pending-заказа | лог + алерт, товар **не** выдаётся |
| `pre_checkout_query` без ответа > 10 с | транзакция отменяется Telegram; `star_payments` → `failed` по таймауту |
| Оплата, но приложение закрыто | entitlement в БД; при следующем `/me` подтягивается |
| Чарджбэк после выдачи | `refunded_payment` → отзыв + аудит |
| Несколько инвойсов подряд | rate limit 5/мин, `invoice_payload` уникален |

---

## 5. UI магазина (1:1 по видео)

- Вкладки `БУСТЫ` / `ОФОРМЛЕНИЕ`, подпись «После каждой покупки вы …».
- Карточки: превью, заголовок, `ПРЕМИУМ` бейдж, `КУПИТЬ ★N`, `ПРОСМОТР`, `КУПИТЬ`/`БЕСПЛАТНО`.
- `ЕЖЕДНЕВНЫЙ СПИН` — бесплатно 1 раз/день (не XTR).
- `dailyStreak` — 7 дней → джекпот; `ЕЖЕДНЕВНОЕ ПРЕДЛОЖЕНИЕ`, `weeklyOffer`.
- `bundle.ultimate` — бандл с `savePercent` и `shop.bundleUpsell.warning`.
- Состояния: `purchasePending`, `purchaseComplete`, `purchaseFailed.storeError`, `shop.verify`, `tryRestore`, `owned`.
- **Обязательно перед первой покупкой:** модалка оферты + 18+ + «Симулятор, не реальные деньги».
- Никаких цен в €/$ внутри Telegram — только `★ N` / `N XTR`.

---

## 6. Команды бота (обязательные)

| Команда | Ответ |
|---|---|
| `/start [payload]` | deep link в Mini App + краткое описание |
| `/terms` | оферта, 18+, дисклеймер, правила возврата |
| `/support` | контакт поддержки, SLA |
| `/paysupport` | разбор платежей, возвраты, ссылка на историю покупок |
| `/help` | как играть, как проверить честность раунда |

@BotFather: Main Mini App, описание, команды, 2FA на аккаунте владельца. Provider token **не нужен**.

---

## 7. Метрики монетизации

- Конверсия в первую покупку, ARPDAU (XTR), средний чек, доля `bundle.ultimate`.
- `pending → paid` воронка, доля отменённых `pre_checkout_query`, время ответа (p95 < 2 с).
- Доля возвратов, сумма возвратов, причины.
- RTP/экономика **не** зависят от покупок (D-01): отдельный дашборд сверяет, что платящие и неплатящие игроки имеют одинаковое распределение дропа.

---

## 8. Чек-лист перед live

- [ ] Тест-бот в test-окружении, все SKU прокуплены и возвращены
- [ ] `answerPreCheckoutQuery` < 10 с под нагрузкой
- [ ] Дубль webhook не дублирует entitlement
- [ ] `refunded_payment` отзывает товар
- [ ] `/terms`, `/support`, `/paysupport` отвечают; оферта открывается из Mini App
- [ ] Согласие с офертой фиксируется **до** инвойса
- [ ] В каталоге нет SKU с игровой валютой
- [ ] Нет внешних платёжных ссылок/крипты/фиата
- [ ] `telegram_payment_charge_id` сохранён для каждой покупки
- [ ] 2FA включена на аккаунте владельца бота
- [ ] Бэкапы `star_payments` и `entitlements` проверены

---

*Изменение прайса или состава SKU — новый ADR + `13-changelog.md` + Q-06.*
