/**
 * Каркас локализации (NFR-14). RU — 100 % для шелла этапа 1; EN/ES — каркас.
 * Полный словарь на 3 844 ключа из reference/i18n-keys.txt собирается на этапе 3
 * из reference/ru-strings.txt; в JSX запрещены строки «в лоб» — только t('key').
 */
export type Locale = 'ru' | 'en' | 'es';

export const RU = {
  'app.title': 'СИМУЛЯТОР КЕЙСОВ',
  'tabs.cases': 'Кейсы',
  'tabs.inventory': 'Инвентарь',
  'tabs.contracts': 'Контракты',
  'tabs.games': 'Игры',
  'tabs.shop': 'Магазин',
  'cases.tabs.cases': 'КЕЙСЫ',
  'cases.tabs.blackMarket': 'ЧЁРНЫЙ РЫНОК',
  'cases.tabs.capsules': 'КАПСУЛЫ',
  'cases.contains.title': 'СОДЕРЖИТ ОДНО ИЗ СЛЕДУЮЩЕГО:',
  'cases.open.button': 'ОТКРЫТЬ КОНТЕЙНЕР',
  'cases.open.useKey': 'Использовать ключ + контейнер: {price}',
  'cases.opening.interruptedOpening': 'Открытие прервано, результат сохранён',
  'cases.search.placeholder': 'Поиск кейса',
  'cases.lockedLevel': 'Доступно с уровня {level}',
  'inventory.search': 'Поиск среди {count} предметов',
  'inventory.empty': 'Здесь пока пусто',
  'inventory.sell': 'ПРОДАТЬ {price}',
  'inventory.massSell': 'МАССОВАЯ ПРОДАЖА',
  'inventory.filter.price': 'Цена',
  'inventory.filter.rarity': 'Редкость',
  'inventory.filter.float': 'Флоат',
  'inventory.filter.az': 'A–Z',
  'inventory.filter.type': 'Тип',
  'inventory.filter.grid': '▦',
  'inventory.demo': 'Инвентарь и продажа доступны после авторизации в Telegram.',
  'inventory.levelLine': 'Уровень {level} · {xp} XP · код {code}',
  'contracts.daily': 'ЕЖЕДНЕВНЫЕ ЗАДАНИЯ',
  'contracts.agents': 'КОНТРАКТЫ АГЕНТОВ',
  'games.title': 'ИГРЫ',
  'games.locked': 'Откроется на уровне {level}',
  'games.howItWorks': 'Как это работает',
  'shop.tabs.boosts': 'БУСТЫ',
  'shop.tabs.cosmetics': 'ОФОРМЛЕНИЕ',
  'shop.buy': 'КУПИТЬ ★{amount}',
  'shop.disclaimer': 'Бусты не влияют на шансы выпадения и исход раунда',
  'common.noInternet.title': 'Нет соединения',
  'common.noInternet.body': 'Денежные операции недоступны оффлайн. Состояние восстановится при подключении.',
  'common.loading': 'Загрузка…',
  'common.retry': 'ПОВТОРИТЬ',
  'common.free': 'БЕСПЛАТНО',
  'common.ready': 'ГОТОВО',
  'common.save': 'СОХРАНИТЬ',
  'common.error': 'Что-то пошло не так',
  'common.disclaimer':
    'Симулятор. Реальные деньги не используются. Виртуальные предметы не выводятся, не обмениваются и не имеют денежной стоимости. Не является азартной игрой.',
  'common.ageGate': '18+',
  'common.accept': 'ПРИНЯТЬ',
  'common.back': 'Назад',
  'common.off': 'ОТКЛЮЧЕНО',
  'common.rtp': 'RTP {value} %',
  'common.demoOnly': 'Доступно только внутри Telegram Mini App (Q-01/Q-02).',
  'common.howItWorks':
    'Результат любого раунда фиксируется сервером до анимации. До раунда публикуется sha256(server_seed), ' +
    'после ротации сид раскрывается — игрок может проверить честность.',
  'contracts.tutorial': 'Обучающий контракт',
  'contracts.questOpenCases': 'Откройте {count} кейсов',
  'shop.freeSpin': 'ЕЖЕДНЕВНЫЙ СПИН',
  'shop.preview': 'ПРОСМОТР',
  'shop.owned': 'Куплено',
  'shop.buyUnavailable': 'Покупка доступна в Telegram (XTR).',
  'profile.level': 'УР. {level}',
  'header.balance': '$ {balance}',
} as const;

export type TranslationKey = keyof typeof RU;

/** Каркас для EN/ES: отсутствующие ключи деградируют на RU без падения UI. */
export const EN: Partial<Record<TranslationKey, string>> = {
  'tabs.cases': 'Cases',
  'tabs.inventory': 'Inventory',
  'tabs.contracts': 'Contracts',
  'tabs.games': 'Games',
  'tabs.shop': 'Shop',
  'common.noInternet.title': 'No connection',
  'common.loading': 'Loading…',
  'common.error': 'Something went wrong',
};

export const ES: Partial<Record<TranslationKey, string>> = {
  'tabs.cases': 'Cajas',
  'tabs.inventory': 'Inventario',
  'tabs.contracts': 'Contratos',
  'tabs.games': 'Juegos',
  'tabs.shop': 'Tienda',
  'common.loading': 'Cargando…',
};

const DICTIONARIES: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  ru: RU,
  en: EN,
  es: ES,
};

export function translate(
  locale: Locale,
  key: TranslationKey,
  params: Record<string, string | number> = {},
): string {
  const template = DICTIONARIES[locale]?.[key] ?? RU[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function formatNumber(locale: Locale, value: number, options: Intl.NumberFormatOptions = {}): string {
  const tag = locale === 'ru' ? 'ru-RU' : locale === 'es' ? 'es-ES' : 'en-US';
  return new Intl.NumberFormat(tag, options).format(value);
}
