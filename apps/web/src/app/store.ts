import { create } from 'zustand';
import { translate, type Locale, type TranslationKey, type CaseTabKey, type TabKey } from '@case-sim/shared';

interface SessionState {
  locale: Locale;
  tab: TabKey;
  caseTab: CaseTabKey;
  token: string | null;
  balance: string;
  level: number;
  xp: number;
  demoMode: boolean;
  online: boolean;
  disclaimerAccepted: boolean;
  activeGame: string | null;
}

interface SessionActions {
  setLocale(locale: Locale): void;
  setTab(tab: TabKey): void;
  setCaseTab(tab: CaseTabKey): void;
  setSession(next: Partial<Pick<SessionState, 'token' | 'balance' | 'level' | 'xp' | 'demoMode'>>): void;
  setOnline(online: boolean): void;
  acceptDisclaimer(): void;
  openGame(key: string | null): void;
  reset(): void;
}

const initial: SessionState = {
  locale: 'ru',
  tab: 'cases',
  caseTab: 'cases',
  token: null,
  balance: '0.00',
  level: 1,
  xp: 0,
  demoMode: false,
  online: true,
  disclaimerAccepted: false,
  activeGame: null,
};

export const useSession = create<SessionState & SessionActions>((set) => ({
  ...initial,
  setLocale: (locale) => set({ locale }),
  setTab: (tab) => set({ tab, activeGame: null }),
  setCaseTab: (caseTab) => set({ caseTab }),
  setSession: (next) => set(next),
  setOnline: (online) => set({ online }),
  acceptDisclaimer: () => set({ disclaimerAccepted: true }),
  openGame: (activeGame) => set({ activeGame }),
  reset: () => set(initial),
}));

/** Все строки в JSX идут через t(); хардкод запрещён (NFR-14). */
export function useT(): (key: TranslationKey, params?: Record<string, string | number>) => string {
  const locale = useSession((s) => s.locale);
  return (key, params = {}) => translate(locale, key, params);
}
