import { useState } from 'react';
import type { CaseDto } from '@case-sim/shared';

const CDN = (import.meta.env.VITE_CDN_BASE_URL as string | undefined) ?? '';

/**
 * image_url в БД уже начинается с `catalog/…`, поэтому VITE_CDN_BASE_URL — это
 * ORIGIN без пути. Отсекаем случайно указанный `/catalog`, иначе получится
 * `/catalog/catalog/cases/…` и все картинки будут 404.
 */
export function composeAssetUrl(cdnBase: string, path: string): string {
  const base = cdnBase.trim().replace(/\/+$/, '').replace(/\/catalog$/, '');
  if (!base) return '';
  return `${base}/${path.replace(/^\/+/, '')}`;
}

export function caseImageUrl(path: string): string {
  return composeAssetUrl(CDN, path);
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
