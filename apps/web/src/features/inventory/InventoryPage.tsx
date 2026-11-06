import { useQuery } from '@tanstack/react-query';
import { useSession, useT } from '../../app/store.js';
import { getMe, authHeader } from '../../shared/api/client.js';

export function InventoryPage() {
  const token = useSession((s) => s.token);
  const demoMode = useSession((s) => s.demoMode);
  const t = useT();

  const inventory = useQuery({
    queryKey: ['inventory', token],
    enabled: Boolean(token),
    queryFn: async () => {
      const response = await fetch(`/v1/me/inventory`, { headers: authHeader(token!) });
      if (!response.ok) throw new Error('inventory unavailable');
      return (await response.json()) as { items: unknown[]; total: number };
    },
  });

  const me = useQuery({
    queryKey: ['me', token],
    enabled: Boolean(token),
    queryFn: () => getMe(token!),
  });

  return (
    <>
      <p className="section-title">{t('tabs.inventory')}</p>
      <input className="input" placeholder={t('inventory.search', { count: inventory.data?.total ?? 0 })} readOnly />
      <div className="tabbar" style={{ marginTop: 10 }}>
        {([
          'inventory.filter.price', 'inventory.filter.rarity', 'inventory.filter.float',
          'inventory.filter.az', 'inventory.filter.type', 'inventory.filter.grid',
        ] as const).map((key) => (
          <span className="chip" key={key} style={{ display: 'inline-flex', alignItems: 'center' }}>{t(key)}</span>
        ))}
      </div>
      <div className="panel">
        <p className="panel__title display">{t('inventory.massSell')}</p>
        <p className="panel__muted">{t('inventory.empty')}</p>
        <button className="btn btn--block" disabled style={{ marginTop: 10 }}>
          {t('inventory.sell', { price: '$0.00' })}
        </button>
      </div>
      {demoMode && <p className="panel__muted">{t('inventory.demo')}</p>}
      {me.data && (
        <p className="panel__muted">
          {t('inventory.levelLine', { level: me.data.level, xp: me.data.xp, code: me.data.referral_code })}
        </p>
      )}
      <p className="disclaimer">{t('common.disclaimer')}</p>
    </>
  );
}
