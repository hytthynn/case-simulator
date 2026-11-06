# `docs/reference/` — неизменяемые снимки исходных данных

> ⚠️ **Не перезаписывать.** Это эталоны, извлечённые 06.11.2026 из видео, APK и живого API оригинала.
> При обнаружении ошибки — добавить новый файл с суффиксом `-v2` и запись в [`../13-changelog.md`](../13-changelog.md).
> Методика и доказательства: [`../01-reverse-engineering.md`](../01-reverse-engineering.md).

## Данные

| Файл | Размер | Содержание |
|---|---|---|
| `prices.json` | 949 KB | **Снимок цен 05.11.2026** (D-04): 14 945 предметов, `_source: Skinport API`, `stattrakMultiplier: 2.0`. Ключи скинов — `{FN,MW,FT,WW,BS}`, стикеров/пакетов — `{price}` |
| `flags.json` | 1.4 KB | `/api/flags?platform=android`: ~50 флагов, 22 `game_disabled_*`, кулдауны, реферальные награды, `min_required_version: v1.1.5` |
| `original-openapi.json` | 70 KB | `/openapi.json` бэкенда `cs2-case-api.fly.dev` (FastAPI, 92 эндпоинта) — справочник по онлайн-функциональности |
| `case-names.txt` | 5.5 KB | **241** название кейсов/капсул/сувенирных пакетов (URL-decoded) |
| `i18n-keys.txt` | 111 KB | **3 844** ключа локализации из `libapp.so` — карта функционала |
| `ru-strings.txt` | 36 KB | **953** чистые русские строки UI (источник точных формулировок) |
| `asset-manifest.txt` | 25 KB | 389 путей `assets/flutter_assets/*` из `base.apk` |

## Эталонные кадры

| Папка | Файлы | Описание |
|---|---|---|
| `screenshots/` | `sheet_01.jpg … sheet_06.jpg` | 6 обзорных контакт-листов: 10 кадров на лист, шаг 10 с, покрывают 00:00–09:50 |
| `screenshots/detail/` | `01_cases.jpg … 12_end.jpg` | 12 детальных листов 2×2, **каждый кадр 576×1280 без масштабирования** — для чтения мелкого текста и сверки дизайна |

Сопоставление таймкодов и экранов: [`../02-ui-map.md`](../02-ui-map.md).
Визуальная приёмка: [`../11-testing-qa.md`](../11-testing-qa.md) §4.

## Исходные файлы (в корне рабочей папки, в git не коммитятся)

- `IMG_4385.MP4` — 09:59, 576×1280, 29.53 fps.
- `Симулятор Кейсов.apks` — `base.apk` + 5 split-APK, Flutter 1.1.5 (33).

## Как использовать при разработке

1. `prices.json` → `packages/db/supabase/seed.sql` → таблицы `price_snapshots`, `items`, `cases`.
2. `case-names.txt` + `asset-manifest.txt` → выгрузка изображений → Supabase Storage `catalog/`.
3. `i18n-keys.txt` / `ru-strings.txt` → `packages/shared/src/i18n-keys` и RU-словарь.
4. `flags.json` → начальные значения `admin_flags`.
5. `original-openapi.json` → сверка состава онлайн-сервисов (не как рантайм-зависимость).
6. `screenshots/` → Playwright visual regression.

---

*D-04: цены фиксированы. Любое обновление — новый `snapshot_id` + ADR + changelog.*
