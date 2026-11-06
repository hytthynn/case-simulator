import type { Locale } from '@case-sim/shared';

/**
 * Типизированный адаптер window.Telegram.WebApp.
 * INTERIM (этап 1): обёртка вместо @telegram-apps/sdk — см. BUG-011 и ADR-006.
 * Все вызовы защищены проверкой версии WebApp.isVersionAtLeast() (NFR-12, R-10).
 * initDataUnsafe используется ТОЛЬКО для имени/аватара/языка в UI.
 */
export interface TmaUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface TelegramWebApp {
  version: string;
  platform: string;
  initData: string;
  initDataUnsafe: { user?: TmaUser; start_param?: string };
  colorScheme: 'dark' | 'light';
  isVersionAtLeast?(version: string): boolean;
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  MainButton?: { setText(text: string): void; show(): void; hide(): void; onClick(cb: () => void): void };
  openInvoice?(url: string, callback?: (status: string) => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

/** Graceful degradation: неизвестный метод/версия не ломает приложение. */
export function isVersionAtLeast(min: string): boolean {
  const webApp = getWebApp();
  if (!webApp) return false;
  if (typeof webApp.isVersionAtLeast === 'function') return webApp.isVersionAtLeast(min);
  const parse = (v: string) => v.split('.').map((p) => Number(p) || 0);
  const a = parse(webApp.version);
  const b = parse(min);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
  }
  return true;
}

export interface TmaContext {
  isTelegram: boolean;
  initData: string;
  user: TmaUser | null;
  locale: Locale;
  platform: string;
  colorScheme: 'dark' | 'light';
  startParam: string | null;
}

export function bootstrapTma(): TmaContext {
  const webApp = getWebApp();
  if (!webApp) {
    return {
      isTelegram: false,
      initData: '',
      user: null,
      locale: 'ru',
      platform: 'browser',
      colorScheme: 'dark',
      startParam: null,
    };
  }

  webApp.ready();
  webApp.expand();
  if (isVersionAtLeast('6.1')) {
    webApp.setHeaderColor?.('#0B0C0E');
    webApp.setBackgroundColor?.('#0B0C0E');
  }
  if (isVersionAtLeast('7.10')) webApp.setBottomBarColor?.('#101216');

  const language = webApp.initDataUnsafe.user?.language_code ?? 'ru';
  return {
    isTelegram: true,
    initData: webApp.initData,
    user: webApp.initDataUnsafe.user ?? null,
    locale: language.startsWith('es') ? 'es' : language.startsWith('en') ? 'en' : 'ru',
    platform: webApp.platform,
    colorScheme: webApp.colorScheme,
    startParam: webApp.initDataUnsafe.start_param ?? null,
  };
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  getWebApp()?.HapticFeedback?.impactOccurred(style);
}

export function hapticNotification(type: 'error' | 'success' | 'warning'): void {
  getWebApp()?.HapticFeedback?.notificationOccurred(type);
}

export function setBackButton(visible: boolean, onClick: () => void): void {
  const button = getWebApp()?.BackButton;
  if (!button) return;
  if (visible) {
    button.onClick(onClick);
    button.show();
  } else {
    button.offClick(onClick);
    button.hide();
  }
}

export function setClosingConfirmation(enabled: boolean): void {
  const webApp = getWebApp();
  if (!webApp) return;
  if (enabled) webApp.enableClosingConfirmation?.();
  else webApp.disableClosingConfirmation?.();
}
