import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RARITY_COLORS, type CaseDto, type OpenCaseResponse, type Rarity } from '@case-sim/shared';
import { useSession, useT } from '../../app/store.js';
import { fetchCases, openCase, type ApiError } from '../../shared/api/client.js';
import { hapticImpact, hapticNotification } from '../../shared/telegram/adapter.js';
import { CaseTabBar } from '../../widgets/Shell.js';
import { CaseCard } from './CaseCard.js';

export function CasesPage() {
  const caseTab = useSession((s) => s.caseTab);
  const token = useSession((s) => s.token);
  const demoMode = useSession((s) => s.demoMode);
  const setSession = useSession((s) => s.setSession);
  const t = useT();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CaseDto | null>(null);
  const [result, setResult] = useState<OpenCaseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cases = useQuery({
    queryKey: ['cases', caseTab],
    queryFn: () => fetchCases(caseTab),
  });

  const filtered = (cases.data?.items ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  async function handleOpen(item: CaseDto) {
    if (demoMode || !token) {
      setError(t('common.demoOnly'));
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    hapticImpact('medium');
    try {
      const response = await openCase(token, {
        case_id: item.id,
        count: 1,
        idempotency_key: crypto.randomUUID(),
        options: { auto_select: false, auto_sell_below: null },
      });
      setResult(response);
      setSession({ balance: response.balance_after });
      hapticNotification('success');
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? t('common.error'));
      hapticNotification('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <CaseTabBar />
      <input
        className="input"
        style={{ marginBottom: 10 }}
        placeholder={t('cases.search.placeholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label={t('cases.search.placeholder')}
      />
      <p className="section-title">{t('app.title')} · {cases.data?.total ?? 0}</p>
      {cases.isLoading && <p className="panel__muted">{t('common.loading')}</p>}
      {cases.isError && <p className="panel__muted">{t('common.error')}</p>}
      <div className="case-grid">
        {filtered.map((item) => (
          <CaseCard key={item.id} item={item} onOpen={setSelected} />
        ))}
      </div>
      {!cases.isLoading && filtered.length === 0 && (
        <div className="panel" style={{ marginTop: 10 }}>
          <p className="panel__muted">{t('inventory.empty')}</p>
        </div>
      )}

      {selected && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2 className="modal__title display">{selected.name}</h2>
            <p className="panel__muted">{t('cases.contains.title')}</p>
            <p className="panel__muted">
              {t('cases.open.useKey', { price: `$${(Number(selected.base_price) + Number(selected.key_price)).toFixed(2)}` })}
            </p>
            {error && <p className="offline-banner">{error}</p>}
            {result?.rolls[0] && (
              <div className="panel" style={{ marginTop: 10 }}>
                <p className="panel__title">{result.rolls[0].name}</p>
                <div
                  className="rarity-bar"
                  style={{ background: RARITY_COLORS[result.rolls[0].rarity as Rarity] }}
                />
                <p className="panel__muted">
                  {result.rolls[0].wear ?? '—'} · {result.rolls[0].float_value?.toFixed(3) ?? '—'} ·
                  {' '}{result.rolls[0].stattrak ? 'StatTrak™ ' : ''}$ {result.rolls[0].price}
                </p>
              </div>
            )}
            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={() => { setSelected(null); setResult(null); setError(null); }}>
                ‹
              </button>
              <button className="btn" disabled={busy} onClick={() => handleOpen(selected)}>
                {busy ? t('common.loading') : t('cases.open.button')}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="disclaimer">{t('common.disclaimer')}</p>
    </>
  );
}
