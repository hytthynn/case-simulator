/**
 * Каталог XTR-SKU, docs/09-monetization.md §2. Цены — INTERIM [Q-06].
 * D-01: продажа игровой валюты ЗАПРЕЩЕНА; ни один SKU не влияет на вероятности.
 */
export interface SkuDefinition {
  sku: string;
  kind: 'cosmetic' | 'convenience' | 'bundle';
  titleRu: string;
  amountXtr: number;
  /** Краткое описание эффекта; бусты — только удобство/косметика. */
  effect: string;
  active: boolean;
}

/** Запрещённые паттерны — защита от случайного добавления «купить $». */
export const FORBIDDEN_SKU_PATTERNS = [
  /^buy\.cash/i,
  /currency/i,
  /guaranteed/i,
  /odds|chance|drop.?boost/i,
  /withdraw|p2p|transfer/i,
] as const;

const cosmetic: SkuDefinition[] = [
  { sku: 'pack.arcade', titleRu: 'Аркадный профиль', amountXtr: 250 },
  { sku: 'pack.blood', titleRu: 'Кровавый профиль', amountXtr: 250 },
  { sku: 'pack.deepSpace', titleRu: 'Космический профиль', amountXtr: 250 },
  { sku: 'pack.neon', titleRu: 'Неоновый набор', amountXtr: 250 },
  { sku: 'pack.smoke', titleRu: 'Дымный набор', amountXtr: 250 },
  { sku: 'pack.void', titleRu: 'Профиль Void', amountXtr: 250 },
  { sku: 'agent.1', titleRu: 'Агент 01', amountXtr: 100 },
  { sku: 'agent.2', titleRu: 'Агент 02', amountXtr: 100 },
  { sku: 'agent.3', titleRu: 'Агент 03', amountXtr: 100 },
  { sku: 'border.neon', titleRu: 'Рамка Neon', amountXtr: 80 },
  { sku: 'fx.aurora', titleRu: 'Эффект Aurora', amountXtr: 120 },
  { sku: 'fx.laser', titleRu: 'Эффект Laser', amountXtr: 120 },
  { sku: 'showcase.slot', titleRu: '+1 слот витрины', amountXtr: 60 },
].map((s) => ({ ...s, kind: 'cosmetic', effect: 'Оформление профиля', active: true }));

const convenience: SkuDefinition[] = [
  ['boost.noAds', 'Без пауз навсегда', 300, 'Убирает обязательные загрузочные паузы (A-02)'],
  ['boost.quickOpen', 'Быстрое открытие', 150, 'Ускоряет анимацию открытия'],
  ['boost.multiOpen', 'Мульти-открытие', 200, 'Открытие 4/5/6 кейсов за раз'],
  ['boost.massOpen', 'Массовое открытие', 250, 'До 200 кейсов за раз'],
  ['boost.massOpenOverdrive', 'Массовое открытие 1000', 400, 'Поднимает лимит с 200 до 1000'],
  ['boost.autoOpenerPro', 'Автооткрыватель Pro', 350, 'Дополнительные слоты'],
  ['boost.autoOpenerOverdrive', 'Автооткрыватель Overdrive', 300, 'Ускоренный интервал'],
  ['boost.xp', '+50 % опыта', 200, 'Множитель XP, НЕ влияет на шансы'],
  ['boost.maxBet', 'Макс. ставка +$20 000', 350, 'Потолок ставки во всех играх'],
  ['boost.caseDiscount', '−35 % на обычные кейсы', 300, 'Скидка на цену открытия'],
  ['boost.vaultSlot', 'Слот хранилища', 150, '+1 хранилище'],
  ['boost.betterSupplyDrop', 'Улучшенное снабжение', 250, '+150 кейсов к поставке'],
  ['boost.stickerRemover', 'Снятие наклейки', 80, 'Снятие наклейки с предмета'],
  ['boost.bountyHunter', 'Bounty Hunter', 250, 'Бонусные кейсы'],
  ['boost.highRoller', 'High Roller', 350, 'Повышенный потолок ставки'],
  ['boost.eventWheel', 'Дополнительные спины', 150, 'Ежедневное колесо'],
  ['unlock.games', 'Все игры сразу', 500, 'Снимает level-gates'],
  ['unlock.cases', 'Премиум-кейсы сразу', 500, 'Снимает level-gates'],
].map(([sku, titleRu, amountXtr, effect]) => ({
  sku: sku as string,
  titleRu: titleRu as string,
  amountXtr: amountXtr as number,
  effect: effect as string,
  kind: 'convenience' as const,
  active: true,
}));

export const SKU_CATALOG: readonly SkuDefinition[] = [
  ...cosmetic,
  ...convenience,
  {
    sku: 'bundle.ultimate',
    kind: 'bundle',
    titleRu: 'Ultimate Bundle',
    amountXtr: 2500,
    effect: 'Все бусты и косметические паки со скидкой',
    active: true,
  },
];

export function getSku(sku: string): SkuDefinition | undefined {
  return SKU_CATALOG.find((s) => s.sku === sku && s.active);
}

/** Инвариант D-01: каталог не содержит запрещённых SKU. */
export function assertSkuCatalogIsCompliant(catalog: readonly SkuDefinition[] = SKU_CATALOG): void {
  for (const sku of catalog) {
    if (FORBIDDEN_SKU_PATTERNS.some((pattern) => pattern.test(sku.sku))) {
      throw new Error(`Запрещённый SKU (D-01): ${sku.sku}`);
    }
    if (!Number.isInteger(sku.amountXtr) || sku.amountXtr <= 0) {
      throw new Error(`Некорректная цена XTR: ${sku.sku}`);
    }
  }
  const seen = new Set<string>();
  for (const sku of catalog) {
    if (seen.has(sku.sku)) throw new Error(`Дублирующийся SKU: ${sku.sku}`);
    seen.add(sku.sku);
  }
}
