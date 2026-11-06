import { useState } from 'react';
import type { CaseDto } from '@case-sim/shared';

const CDN = (import.meta.env.VITE_CDN_BASE_URL as string | undefined) ?? '';

export function caseImageUrl(path: string): string {
  if (!CDN) return '';
  return `${CDN.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export function CaseCard({ item, onOpen }: { item: CaseDto; onOpen: (item: CaseDto) => void }) {
  const [broken, setBroken] = useState(false);
  const url = caseImageUrl(item.image_url);
  return (
    <button className="case-card" onClick={() => onOpen(item)} aria-label={item.name}>
      <span className="case-card__price">$ {item.base_price}</span>
      {url && !broken ? (
        <img
          className="case-card__img"
          src={url}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="case-card__img case-card__img--placeholder" aria-hidden="true">◈</span>
      )}
      <span className="case-card__name">{item.name}</span>
      {item.min_level > 1 && <span className="case-card__badge">🔒 LVL {item.min_level}</span>}
    </button>
  );
}
