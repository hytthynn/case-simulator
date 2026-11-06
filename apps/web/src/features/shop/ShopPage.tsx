import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession, useT } from '../../app/store.js';
import { createInvoice, fetchSkus } from '../../shared/api/client.js';

export function ShopPage() {
  const t = useT();
  const token = useSession((s) => s.token);
  const demoMode = useSession((s) => s.demoMode);
  const [tab, setTab] = useState<'boosts' | 'cosmetics'>('boosts');
  const [error, setError] = useState<string | null>(null);
  const skus = useQuery({ queryKey: ['skus'], queryFn: fetchSkus });

  const visible = (skus.data?.items ?? []).filter((s) =>
    tab === 'boosts' ? s.kind !== 'cosmetic' : s.kind === 'cosmetic',
  );

  async function buy(sku: string) {
    if (demoMode || !token) {
      setError(t('shop.buyUnavailable'));
      return;
    }
    try {
      const key = crypto.randomUUID();
      const invoice = await createInvoice(token, sku, key);
      // WebApp.openInvoice вызывается только внутри Telegram (Bot API ≥ 6.1).
      const webApp = window.Telegram?.WebApp;
      if (webApp && typeof webApp.openInvoice === 'function') {
        webApp.openInvoice(invoice.invoice_url);
      } else {
        setError(t('shop.buyUnavailable'));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <div className="tabbar" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'boosts'}
          className={`tabbar__item ${tab === 'boosts' ? 'tabbar__item--active' : ''}`}
          onClick={() => setTab('boosts')}
        >
          {t('shop.tabs.boosts')}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'cosmetics'}
          className={`tabbar__item ${tab === 'cosmetics' ? 'tabbar__item--active' : ''}`}
          onClick={() => setTab('cosmetics')}
        >
          {t('shop.tabs.cosmetics')}
        </button>
      </div>

      <div className="panel">
        <p className="panel__title display">{t('shop.freeSpin')}</p>
        <p className="panel__muted">{t('shop.disclaimer')}</p>
        <button className="btn btn--block" style={{ marginTop: 10 }} disabled>
          {t('common.free')}
        </button>
      </div>

      {error && <p className="offline-banner">{error}</p>}
      {skus.isLoading && <p className="panel__muted">{t('common.loading')}</p>}

      {visible.map((sku) => (
        <div className="panel" key={sku.sku}>
          <p className="panel__title display">{sku.title_ru}</p>
          <p className="panel__muted">{sku.sku}</p>
          <button className="btn btn--gold btn--block" style={{ marginTop: 8 }} onClick={() => buy(sku.sku)}>
            {t('shop.buy', { amount: sku.amount_xtr })}
          </button>
        </div>
      ))}

      <p className="disclaimer">{t('shop.disclaimer')} {t('common.disclaimer')}</p>
    </>
  );
}
