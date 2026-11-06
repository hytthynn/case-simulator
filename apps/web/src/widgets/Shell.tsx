import { useEffect } from 'react';
import {
  DISCLAIMER_RU,
  TABS,
  type CaseTabKey,
  type TabKey,
} from '@case-sim/shared';
import { useSession, useT } from '../app/store.js';
import { setBackButton } from '../shared/telegram/adapter.js';

const TAB_KEYS: Record<TabKey, Parameters<ReturnType<typeof useT>>[0]> = {
  cases: 'tabs.cases',
  inventory: 'tabs.inventory',
  contracts: 'tabs.contracts',
  games: 'tabs.games',
  shop: 'tabs.shop',
};

function TabIcon({ tab }: { tab: TabKey }) {
  const common = {
    className: 'bottom-nav__icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (tab) {
    case 'cases':
      return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="1" /><path d="M3 11h18M9 7V4h6v3" /></svg>;
    case 'inventory':
      return <svg {...common}><path d="M3 8h18v12H3zM8 8V5h8v3M3 13h18" /></svg>;
    case 'contracts':
      return <svg {...common}><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7" /></svg>;
    case 'games':
      return <svg {...common}><path d="M7 9h10a5 5 0 0 1 5 5l-1 3a3 3 0 0 1-5 1l-2-2h-4l-2 2a3 3 0 0 1-5-1l-1-3a5 5 0 0 1 5-5z" /><path d="M7 12v3M5.5 13.5h3" /></svg>;
    case 'shop':
      return <svg {...common}><path d="M4 8h16l-1 12H5L4 8zM8 8V6a4 4 0 0 1 8 0v2" /></svg>;
  }
}

export function Header() {
  const balance = useSession((s) => s.balance);
  const level = useSession((s) => s.level);
  const demoMode = useSession((s) => s.demoMode);
  const activeGame = useSession((s) => s.activeGame);
  const openGame = useSession((s) => s.openGame);
  const t = useT();

  useEffect(() => {
    setBackButton(Boolean(activeGame), () => openGame(null));
  }, [activeGame, openGame]);

  return (
    <header className="header">
      {activeGame && (
        <button className="header__back" aria-label={t('common.back')} onClick={() => openGame(null)}>
          ‹
        </button>
      )}
      <div className="header__avatar" aria-hidden="true">◈</div>
      <span className="header__level">{t('profile.level', { level })}</span>
      <span className="header__spacer" />
      <span className="header__balance" aria-live="polite">
        {demoMode ? '$ —' : t('header.balance', { balance })}
      </span>
    </header>
  );
}

export function BottomNav() {
  const tab = useSession((s) => s.tab);
  const setTab = useSession((s) => s.setTab);
  const t = useT();
  return (
    <nav className="bottom-nav" aria-label={t('app.title')}>
      {TABS.map((key) => (
        <button
          key={key}
          className={`bottom-nav__item ${tab === key ? 'bottom-nav__item--active' : ''}`}
          aria-current={tab === key ? 'page' : undefined}
          onClick={() => setTab(key)}
        >
          <TabIcon tab={key} />
          <span>{t(TAB_KEYS[key])}</span>
          {key === 'contracts' && <span className="bottom-nav__dot" aria-hidden="true" />}
        </button>
      ))}
    </nav>
  );
}

const CASE_TAB_KEYS: Record<CaseTabKey, Parameters<ReturnType<typeof useT>>[0]> = {
  cases: 'cases.tabs.cases',
  black_market: 'cases.tabs.blackMarket',
  capsules: 'cases.tabs.capsules',
};

export function CaseTabBar() {
  const caseTab = useSession((s) => s.caseTab);
  const setCaseTab = useSession((s) => s.setCaseTab);
  const t = useT();
  return (
    <div className="tabbar" role="tablist">
      {(Object.keys(CASE_TAB_KEYS) as CaseTabKey[]).map((key) => (
        <button
          key={key}
          role="tab"
          aria-selected={caseTab === key}
          className={`tabbar__item ${caseTab === key ? 'tabbar__item--active' : ''}`}
          onClick={() => setCaseTab(key)}
        >
          {t(CASE_TAB_KEYS[key])}
        </button>
      ))}
    </div>
  );
}

export function OfflineBanner() {
  const online = useSession((s) => s.online);
  const demoMode = useSession((s) => s.demoMode);
  const t = useT();
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <strong>{t('common.noInternet.title')}</strong>
      <div>{t('common.noInternet.body')}</div>
      {demoMode && <div>{t('common.error')}</div>}
    </div>
  );
}

export function DisclaimerModal() {
  const accepted = useSession((s) => s.disclaimerAccepted);
  const accept = useSession((s) => s.acceptDisclaimer);
  const t = useT();
  if (accepted) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t('common.ageGate')}>
      <div className="modal">
        <h2 className="modal__title display">
          <span className="age-badge">{t('common.ageGate')}</span> {t('app.title')}
        </h2>
        <p className="modal__body">{t('common.disclaimer')}</p>
        <p className="modal__body">{DISCLAIMER_RU}</p>
        <div className="modal__actions">
          <button className="btn btn--block" onClick={accept}>{t('common.accept')}</button>
        </div>
      </div>
    </div>
  );
}

export function LoadingScreen({ title }: { title: string }) {
  const t = useT();
  return (
    <div className="loading-screen" role="status">
      <div className="loading-screen__icon" aria-hidden="true">◈</div>
      <div className="loading-screen__title display">{title}</div>
      <div className="loading-screen__line" aria-hidden="true" />
      <div className="panel__muted">{t('common.loading')}</div>
    </div>
  );
}
