# 01 · Реверс-инжиниринг: видео, APK, живой API

> Цель файла — **зафиксировать доказанные факты**, чтобы следующим сессиям не пришлось заново разбирать исходники.
> Дата разбора: 06.11.2026. Инструменты: Python 3.13, Pillow, `imageio-ffmpeg` (ffmpeg 9.0.2), `unzip`, `pyaxmlparser`, `androguard`, curl.
> Все извлечённые данные — в [`reference/`](reference/).

---

## 1. Видео `IMG_4385.MP4`

| Параметр | Значение |
|---|---|
| Размер | 141 348 047 байт (135 MB) |
| Длительность | 00:09:59.03 |
| Видео | H.264 High, yuv420p, bt709, **576×1280** (DAR 9:20), 29.53 fps, 1882 kbps |
| Аудио | AAC LC, 44100 Hz, stereo |
| Создано | 2026-11-05T17:46:30Z |

Методика:
```bash
ffmpeg -i IMG_4385.MP4 -vf "fps=1"        -q:v 2 frames1s/s_%04d.jpg   # 599 кадров
ffmpeg -i IMG_4385.MP4 -vf "fps=1/10,scale=360:-1" frames/f_%03d.jpg   # 60 кадров
```
Из 60 кадров собраны 6 контакт-листов `reference/screenshots/sheet_01..06.jpg` (5×2, метка времени на каждом).
Из 599 кадров собраны 12 детальных листов `reference/screenshots/detail/01..12.jpg` (2×2, **полное разрешение 576×1280 на кадр**).

**Вывод:** это запись экрана телефона с последовательным проходом почти по всем разделам приложения. Демонстрируются: автооткрыватель, каталог кейсов, содержимое кейса, рулетка, продажа, чёрный рынок, чат/терминал, магазин, фильтры инвентаря, коинфлип, задания, друзья, профиль, рефералы, кастомизация, сетка игр, все мини-игры, битва кейсов, джекпот, краш.

**Артефакты записи (НЕ часть продукта):**
- 02:20 и 07:20 — системный оверлей `Husk / Enable JIT / SideStore / StikDebug` (сайдлоад/отладка iOS).
- 04:40 — чёрный экран с надписью `Cl... Case Sim`, `Keybo... starting`, `Hide`.
- 07:20 — `Starting JIT for Husk`, `Tap with three fingers to show the interface`.
- Видео снято с удалённого/модифицированного устройства; на UI это не влияет.

Полная карта экранов — [`02-ui-map.md`](02-ui-map.md).

---

## 2. APK `Симулятор Кейсов.apks`

### 2.1 Состав бандла
```
base.apk                     78 183 845 B
split_config.arm64_v8a.apk   25 866 894 B
split_config.en.apk              45 465 B
split_config.es.apk              29 081 B
split_config.ru.apk              29 081 B
split_config.xxhdpi.apk         313 635 B
```
Итого 6 файлов / 104 468 001 B в архиве.

### 2.2 Платформа
- **Flutter** (AOT): `lib/arm64-v8a/libapp.so` 12.3 MB (Dart-код), `libflutter.so` 11.7 MB, `libsqlite3.so` 1.7 MB, `libdatastore_shared_counter.so`.
- Нативная обвязка: Kotlin/AndroidX/Room/DataStore, `classes.dex` 10.6 MB.
- `AndroidManifest.xml`: package `com.cs2casesim.cs2_case_sim`, **versionName 1.1.5**, versionCode 33, MainActivity.
- Разрешения: `BILLING`, `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`, `WAKE_LOCK`, `FOREGROUND_SERVICE`, `AD_ID`, `ACCESS_ADSERVICES_*`, C2DM, `CHECK_LICENSE`.
- Активности: `MainActivity`, `WebViewActivity`, `AdActivity`, `ProxyBillingActivity`, `GamesResolutionActivity`, `GoogleApiActivity`, и др.

### 2.3 Интеграции (по `META-INF/*.properties`, `classes.dex`, строкам)
| Библиотека | Назначение |
|---|---|
| Google Play Billing (`billing.properties`, `ProxyBillingActivity`) | IAP в EUR |
| Google Mobile Ads / AdMob (`play-services-ads*`, ID `ca-app-pub-3755540664721363/2903864111`) | rewarded / interstitial |
| Play Games v2 (`play-services-games-v2`) | облачные сейвы, ранги |
| Firebase (Analytics, Messaging/FCM, `messaging_event.proto`) | аналитика и пуши |
| Play Integrity (`integrity.properties`) | анти-чит |
| AndroidX Room + sqlite | локальная БД `cs2sim.db` |
| `user-messaging-platform` | согласие на рекламу (GDPR) |

### 2.4 Ассеты `assets/flutter_assets/`
| Каталог | Кол-во | Описание |
|---|---|---|
| `assets/cases/` | **241** | PNG кейсов, капсул, сувенирных пакетов (имена URL-encoded) |
| `assets/sounds/` | **62** | CS:GO UI-звуки, пары `.wav` + `.vsnd` |
| `assets/images/` | **42** | `ranks/case_opener_1..9.png`, `ranks/high_roller_1..9.png`, `ranks/supply_drop_1..9.png`, `not_yet_ranked.png`, иконки денег/звёзд/контейнеров |
| `assets/bundled_images/Skins/` | 17 | Kilowatt Case (AK-47 Inheritance, AWP Chrome Cannon, … Zeus x27 Olympus) |
| `assets/bundled_images/Knives/` | 13 | ★ Kukri Knife + 12 расцветок |
| `assets/fonts/` | 6 | `Orbitron-Variable.ttf`, `Rajdhani-{Light,Regular,Medium,SemiBold,Bold}.ttf` |
| `assets/page/coin.html` | 1 | **Three.js 3D-монетка** для Coinflip (canvas, ~250 KB) |
| `flutter_assets/` root | — | `AssetManifest.bin`, `FontManifest.json`, `NOTICES.Z`, `shaders/*`, `MaterialIcons-Regular.otf` |

`reference/asset-manifest.txt` — полный список 389 путей.

**Звуки (важные):** `csgo_ui_crate_open.wav`, `csgo_ui_crate_item_scroll.wav`, `csgo_ui_crate_display.wav`, `item_drop{1..5}_{common,uncommon,rare,mythical,legendary}.wav`, `coin_pickup_01.wav`, `xp_levelup.wav`, `menu_accept.wav`, `buttonclick.wav`, `cash_pop.wav`, `defuse_{beep,boom,snip}.wav`, `achievement_earned.wav`, `store_item_purchased.wav`, `weapon_cant_buy.wav`.

### 2.5 Строки `libapp.so`
Извлечено 120 778 уникальных строк (ASCII + UTF-16LE + UTF-8 с кириллицей). Из них:
- **3 844** i18n-ключа (`games.*`, `cases.*`, `shop.*`, `appShell.*`, `stats.*`, `quests.*`, `battle.*`, `inventory.*`, `daily.*`, `upgrader.*`, …) → `reference/i18n-keys.txt`
- **953** чистых русских строки → `reference/ru-strings.txt`
- URL, SKU, имена предметов, ключи `SharedPreferences`/БД.

Примеры ключей, из которых восстановлены механики:
`cases.autoOpener.*`, `cases.massOpen.*`, `cases.vault.*`, `cases.terminal.*`, `cases.supplyDrop.*`, `cases.blackMarket.*`, `games.battle.{classic,fast,shared,reverse,clutch,terminal}`, `shop.iaps.{...}`, `stats.labels.*`, `quests.pool.*`, `appShell.friends.*`, `appShell.cloud.*`.

Ключи локального состояния: `game_state.json`, `cs2sim.db`, `cloud_restore_backup.db`, `*_history_json`, `daily_challenges_json`, `friendNicknamesJson`, `last_gold_image_url`, `coinflip_best_item_image_url`.

### 2.6 Каталог кейсов (241)
Примеры: `CS20 Case`, `CSGO Weapon Case 1..3`, `Kilowatt Case`, `Fever Case`, `Gallery Case`, `Revolution Case`, `Recoil Case`, `Dreams & Nightmares Case`, `Chroma Case 1..3`, `Operation Bravo Case`, `Spectrum Case`, `Glove Case`, `Austin 2025 … Souvenir Package`, `Antwerp 2022 … Sticker Capsule`, `Budapest 2025 …`, `10 Year Birthday Sticker Capsule`, `Warhammer 40,000 …`, `5_emerald`.
Полный список — `reference/case-names.txt`.

### 2.7 Локализация
`split_config.ru.apk` / `.en` / `.es` содержат нативные строки; основная локализация Flutter лежит в `libapp.so`. В APK найдены переводы на десятки языков (включая монгольский, киргизский, казахский) — это стандартные `intl`-паттерны дат Flutter, а не продуктовые экраны. Продуктовые строки: RU (основной), EN, ES.

---

## 3. Живой бэкенд оригинала

### 3.1 Хосты
| Хост | ПО | Назначение |
|---|---|---|
| `https://cs2-case-api.fly.dev` | FastAPI (Python), `{"detail":"Not Found"}` на `/` | API, аналитика, админка |
| `https://cs2-case-images.fly.dev` | nginx/1.31.8 | CDN изображений + лендинг |

### 3.2 `/openapi.json`
71 667 B, **92 эндпоинта**, `info.title = "FastAPI"`, `info.version = "0.1.0"`. Копия: `reference/original-openapi.json`.

Группы:
- **Аналитика:** `/api/analytics/{heartbeat,ad-watch,ad-signal,purchase,quest-claim,event-spin,auto-opener-claim,save-load-failed}`, `/api/analytics`, `/api/analytics/{totals,daily,sales-period,case-rtp}`, `/api/admin/{funnel,churn-pushes,top-spenders,revenue-backfill,…}`.
- **Платежи/права:** `/api/iap/verify`, `/api/entitlements/verify`, `/api/admin/fake-purchases`.
- **Облако:** `/api/cloud/{restore-status,restore-claim}`, `/api/account/delete`, `/api/integrity/report`.
- **Цены:** `/api/prices`, `/api/admin/refresh-prices`.
- **Социалка:** `/api/friends/{status,request,respond,cancel,remove,gift/send,gift/open,stars/claim,regenerate,profile,profile/view}`, `/api/referral/{status,redeem,claim}`, `/api/inactivity-gift/claim`, `/api/supply-drop/claim`.
- **Игры:** `/api/battle/event`, `/api/game/event`, `/api/cooldown`, `/api/feedback`.
- **Рассылки:** `/internal/broadcast/*`, `/api/admin/broadcast/*`.
- **Флаги/служебное:** `/api/flags`, `/api/time`, `/api/stats/public`, `/health`, `/api/admin/flags`, `/api/notifications/prefs`, `/api/fcm-token`.

> В ТЗ этот API используется **только как справочник по функциональности**. Никаких рантайм-запросов к нему из нового продукта.

### 3.3 `/api/prices` (снимок)
```json
{
  "_lastUpdated": "2026-11-05",
  "_source": "Skinport API",
  "_totalItems": 14945,
  "stattrakMultiplier": 2.0,
  "prices": {
    "★ StatTrak™ Huntsman Knife | Bright Water": {"FN":80.45,"FT":63.29,"MW":72.99,"WW":62.91,"BS":81.3},
    "Sticker | XANTARES (Gold) | Copenhagen 2024": {"price":7.19},
    "MAC-10 | Arabesque Mosaic": {"BS":0.24,"FT":0.39,"MW":0.87,"WW":0.28,"FN":3.28},
    "Kilowatt Case": {"price":0.11}
  }
}
```
- 14 945 предметов; 377 записей с `Case` / `Capsule` / `Package` в названии.
- Скины с износом: 5 ключей `FN/MW/FT/WW/BS`; стикеры/пакеты: один `price`.
- Копия: `reference/prices.json` (949 KB). **Это и есть D-04.**

### 3.4 `/api/flags?platform=android` (полный список)
```
account_delete_cooldown_hours=4
auto_opener_cap_knife_value=true
auto_opener_interval_minutes=5
auto_opener_sell_percent=65
boost_bundle_duration_minutes=4473
boost_bundle_enabled=true
bundle_visible=true
cloud_restore_limit=3
cloud_restore_window_days=30
cloud_save_disabled=false
dev_seed_enabled=false
forced_update_min_android=10105
forced_update_min_ios=0
game_disabled_blackjack / casebattle / cashclicker / coinflip / crash / defuse / dice /
  hilo / jackpot / mines / pachinko / plinko / ridethebus / roulette / rushb /
  scratch / towers / tradedown / tradeup / upgrader = false   (22 игры)
game_disabled_plinko_min_enabled_code=0
loading_ad_interval_minutes=1
loading_ad_max_per_day=30
min_required_version=v1.1.5
play_integrity_interval_days=3
pro_agent_legacy_cutoff_ts=1788177340
pro_store_for_new_installs=true
referral_max_paid_referees=20
referral_reward_l10=3000
referral_reward_l3=500
referral_reward_l5=1500
referral_signup_bonus=1000
settings_rating_button=false
```
Копия: `reference/flags.json`.

### 3.5 Прочее
- `/api/time` → `{"now_ms":1793931663737}` — серверное время.
- `/api/stats/public` → `{"total":364045,"new_24h":397}` — 364 тыс. установок/аккаунтов.
- CDN-пути из строк: `/Skins/` (953 упоминания), `/Stickers/` (104), `/Knives/` (82), `/Gloves/` (7), `/Agents/` (3), `/other/` (4). Пример: `https://cs2-case-images.fly.dev/Skins/The Chop Shop Collection/Dual Berettas  Duelist.png`.
- Лендинг CDN: «Case Simulator — A free case-opening simulator for Android, made by **Quick Use Apps**», «over 200 cases and capsules», «Black Market», «float and wear», «real market prices that update every day», «20 games like Crash, Mines, Roulette and Plinko», «season pass», «18+», «virtual items only … no real-money gambling … nothing can be cashed out, traded or withdrawn», «unofficial fan-made app, not affiliated with any game developer or publisher».

---

## 4. Восстановленная карта функционала

| Домен | Подтверждено |
|---|---|
| Кейсы | 241 кейс/капсула; 3 вкладки (Кейсы / Чёрный рынок / Капсулы); секции Cases/Capsules/Souvenir; цены; блокировки по уровню; free-кейсы |
| Открытие | рулетка, `ОТКРЫТЬ КОНТЕЙНЕР`, «ключ + контейнер», 1/2/3/5/6 кейсов, автооткрытие/автовыбор, quick/mass open (200→1000), auto-sell, tap-to-skip |
| Дроп | редкости, wear/float, StatTrak™, возможные ножи/перчатки, 3D-вид, звуки по редкости |
| Экономика | виртуальные `$`, цены Skinport, продажа, массовая продажа по порогу, хранилище с выплатой, снабжение |
| Игры | 22 флага + `event`/`pool` → см. таблицу в `00-ТЗ.md` FR-14 |
| Битвы | classic / fast / shared / reverse / clutch / terminal; 1v1, 1v1v1; лобби, фильтры, replay, watch |
| Социалка | друзья, заявки, никнеймы, онлайн, подарки, звёзды друга, реферальный код, награды L3/L5/L10, чат |
| Профиль | агенты (9), фоны, рамки, эффекты, витрина (3 слота), премиум-паки, статистика, ранги 3×9 |
| Магазин | 17 IAP-SKU, бандл, дейли-оффер, 7-дневный стрик, еженедельное предложение, оформление |
| Прогрессия | уровни 1…26+, XP-полоса, 5 треков улучшений, контракты агентов, 4 ежедневных задания, сезон |
| Онлайн | серверное время, фича-флаги, цены, кулдауны, облачный сейв, пуши, аналитика, broadcast, integrity |

---

## 5. Что НЕ удалось восстановить однозначно

| # | Пробел | Как закрываем |
|---|---|---|
| 1 | Точные веса дропа по предметам внутри кейса (таблицы в Dart AOT) | Официальные вероятности CS2, зафиксированы в [`08-game-logic.md`](08-game-logic.md); правка админом |
| 2 | XP-кривая, пороги уровней, формула «МАКС. СТАВКА» | Вопрос Q-05; interim-таблица в `08-game-logic.md` |
| 3 | RTP каждой мини-игры | Q-04; interim-значения + серверный замер |
| 4 | Полный прайс IAP в EUR | Видны €3.99 / €4.99 / €6.99; для XTR вводим собственный прайс (Q-06) |
| 5 | ~15 000 PNG скинов (в APK только 30) | Выгрузка CDN / генерация из `prices.json` на этапе 2 |
| 6 | Точные level-gates для всех 22 игр | По кадрам: 2,3,4,5,9,11,≈12,≈14,16,≈18,≈19,≈21,≈22,≈23,≈25,26; финализация Q-05 |
| 7 | Серверная логика оригинала (API только аналитический) | Проектируем свою авторитетную логику |

---

## 6. Проверенные внешние источники

| Источник | Что подтверждено |
|---|---|
| `core.telegram.org/bots/webapps` | HMAC-валидация `initData`: `secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)`, `data_check_string` через `\n`, проверка `auth_date`; `initDataUnsafe` не доверять; `ready/expand/openInvoice/MainButton/BackButton/HapticFeedback/CloudStorage/themeParams`; Bot API ≥6.1, `isVersionAtLeast()` |
| `core.telegram.org/bots/payments-stars` | Цифровые товары только `XTR`, `provider_token` пустой, `answerPrecheckoutQuery` ≤10 с, выдача только после `successful_payment`, хранить `telegram_payment_charge_id`, `refundStarPayment`, тест в test-окружении, `/terms` `/support` `/paysupport` |
| `telegram.org/tos/bot-developers` §6.2 | Запрет других валют/провайдеров/крипты для цифровых товаров; ответственность за споры; Stars ≠ собственность разработчика |
| `supabase.com/docs` | JWT Signing Keys (ES256), RLS, RPC/`FOR UPDATE`, Realtime Broadcast vs Postgres Changes, pg_cron, лимиты Edge Functions (256 MB / CPU 2 с), Supavisor 6543 `prepare:false`, Pro-план |
| `docs.railway.com` | Railpack/Dockerfile, `0.0.0.0:$PORT`, `/health`, приватная сеть недоступна в build, GitHub autodeploy, регион `europe-west4-drams3a` |

> Пункты, требующие дополнительной проверки на дату релиза: точная актуальная версия Bot API (в доках встречаются 10.1…10.3), min/max сумма XTR-инвойса, точная комиссия/вывод через Fragment, CSP/`frame-ancestors` для конкретных клиентов Telegram, совместимость свежих версий Vite/TS с тулингом, статус Nixpacks.

---

## 7. Команды для воспроизведения

```bash
# 1) Состав бандла
unzip -l "Симулятор Кейсов.apks"

# 2) Распаковка
mkdir -p /tmp/apk && unzip -o "Симулятор Кейсов.apks" -d /tmp/apk
unzip -o /tmp/apk/base.apk -d /tmp/apk/base
unzip -o /tmp/apk/split_config.arm64_v8a.apk -d /tmp/apk/arm64

# 3) Манифест (Python / pyaxmlparser)
python -c "from pyaxmlparser import APK; a=APK('/tmp/apk/base.apk'); print(a.package,a.version_name,a.permissions)"

# 4) Строки libapp.so (Python: ASCII + UTF-16LE + UTF-8 c кириллицей)
python strs.py /tmp/apk/arm64/lib/arm64-v8a/libapp.so libapp_strings.txt

# 5) Видео
ffmpeg -i IMG_4385.MP4 -vf "fps=1" -q:v 2 frames1s/s_%04d.jpg

# 6) API-снимки
curl -s https://cs2-case-api.fly.dev/openapi.json -o reference/original-openapi.json
curl -s https://cs2-case-api.fly.dev/api/prices -o reference/prices.json
curl -s "https://cs2-case-api.fly.dev/api/flags?platform=android" -o reference/flags.json
```

---

*Факты зафиксированы. При обнаружении расхождений — правка сюда + строка в `13-changelog.md`.*
