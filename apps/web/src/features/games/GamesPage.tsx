import { useQuery } from '@tanstack/react-query';
import { useSession, useT } from '../../app/store.js';
import { fetchGames } from '../../shared/api/client.js';
import { LoadingScreen } from '../../widgets/Shell.js';

export function GamesPage() {
  const t = useT();
  const activeGame = useSession((s) => s.activeGame);
  const level = useSession((s) => s.level);
  const openGame = useSession((s) => s.openGame);
  const games = useQuery({ queryKey: ['games'], queryFn: fetchGames });

  if (activeGame) {
    const game = games.data?.items.find((g) => g.key === activeGame);
    return <LoadingScreen title={game?.ru ?? activeGame.toUpperCase()} />;
  }

  return (
    <>
      <p className="section-title">{t('games.title')} · {games.data?.items.length ?? 0}</p>
      <div className="game-grid">
        {(games.data?.items ?? []).map((game) => {
          const locked = game.level > level || game.disabled;
          return (
            <button
              key={game.key}
              className={`game-card ${locked ? 'game-card--locked' : ''}`}
              disabled={locked}
              onClick={() => openGame(game.key)}
            >
              <span className="game-card__title">{game.ru}</span>
              <span className="game-card__level">
                {game.disabled ? t('common.off') : t('games.locked', { level: game.level })}
              </span>
              {game.rtp > 0 && (
                <span className="game-card__rtp">{t('common.rtp', { value: Math.round(game.rtp * 100) })}</span>
              )}
            </button>
          );
        })}
      </div>
      {games.isLoading && <p className="panel__muted">{t('common.loading')}</p>}
      <div className="panel" style={{ marginTop: 12 }}>
        <p className="panel__title display">{t('games.howItWorks')}</p>
        <p className="panel__muted">{t('common.howItWorks')}</p>
      </div>
    </>
  );
}
