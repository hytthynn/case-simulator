import { useEffect } from 'react';
import { setClosingConfirmation } from '../shared/telegram/adapter.js';
import { bootstrapTma } from '../shared/telegram/adapter.js';
import { authenticate, getServerTime } from '../shared/api/client.js';
import { useSession, useT } from './store.js';
import { BottomNav, DisclaimerModal, Header, OfflineBanner } from '../widgets/Shell.js';
import { CasesPage } from '../features/cases/CasesPage.js';
import { InventoryPage } from '../features/inventory/InventoryPage.js';
import { ContractsPage } from '../features/contracts/ContractsPage.js';
import { GamesPage } from '../features/games/GamesPage.js';
import { ShopPage } from '../features/shop/ShopPage.js';

export function App() {
  const tab = useSession((s) => s.tab);
  const demoMode = useSession((s) => s.demoMode);
  const setSession = useSession((s) => s.setSession);
  const setLocale = useSession((s) => s.setLocale);
  const setOnline = useSession((s) => s.setOnline);
  const t = useT();

  useEffect(() => {
    const context = bootstrapTma();
    setLocale(context.locale);
    setSession({ demoMode: !context.isTelegram });

    if (context.isTelegram && context.initData) {
      authenticate(context.initData)
        .then((auth) => {
          setSession({
            token: auth.access_token,
            balance: auth.user.balance,
            level: auth.user.level,
            xp: auth.user.xp,
            demoMode: false,
          });
        })
        .catch(() => setSession({ demoMode: true }));
    } else {
      // Browser preview: только публичные эндпоинты, без денежных операций.
      getServerTime().catch(() => setOnline(false));
    }

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setLocale, setOnline, setSession]);

  // G-12: подтверждение закрытия во время незавершённого раунда.
  useEffect(() => {
    setClosingConfirmation(!demoMode);
    return () => setClosingConfirmation(false);
  }, [demoMode]);

  return (
    <div className="shell">
      <Header />
      <OfflineBanner />
      <main className="content" role="main" aria-label={t('app.title')}>
        {tab === 'cases' && <CasesPage />}
        {tab === 'inventory' && <InventoryPage />}
        {tab === 'contracts' && <ContractsPage />}
        {tab === 'games' && <GamesPage />}
        {tab === 'shop' && <ShopPage />}
      </main>
      <BottomNav />
      <DisclaimerModal />
    </div>
  );
}
