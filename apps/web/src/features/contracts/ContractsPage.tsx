import { useT } from '../../app/store.js';

export function ContractsPage() {
  const t = useT();
  return (
    <>
      <p className="section-title">{t('contracts.daily')}</p>
      <div className="panel">
        <p className="panel__title display">{t('contracts.tutorial')}</p>
        <p className="panel__muted">{t('contracts.questOpenCases', { count: 20 })}</p>
        <div className="rarity-bar" style={{ background: 'var(--app-orange)', marginTop: 8 }} />
      </div>
      <p className="section-title">{t('contracts.agents')}</p>
      <div className="panel">
        <p className="panel__muted">{t('inventory.empty')}</p>
      </div>
      <p className="section-title">{t('games.howItWorks')}</p>
      <div className="panel">
        <p className="panel__muted">{t('common.howItWorks')}</p>
      </div>
      <p className="disclaimer">{t('common.disclaimer')}</p>
    </>
  );
}
