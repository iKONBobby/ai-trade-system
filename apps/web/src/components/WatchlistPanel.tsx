'use client';

import type { ScreenerResult } from '@trade/shared';

const MAX_FAVORITES = 50;

export function loadFavorites(): ScreenerResult[] {
  try {
    const raw = localStorage.getItem('screener_favorites');
    return raw ? (JSON.parse(raw) as ScreenerResult[]) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(favorites: ScreenerResult[]): void {
  localStorage.setItem('screener_favorites', JSON.stringify(favorites));
}

export default function WatchlistPanel({
  favorites,
  onRemove,
  onClick,
}: {
  favorites: ScreenerResult[];
  onRemove: (code: string) => void;
  onClick: (code: string) => void;
}) {
  if (favorites.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-400/30 bg-amber-400/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          我的候选池
          <span className="ml-2 text-xs font-normal text-[var(--color-text-secondary)]">
            {favorites.length}/{MAX_FAVORITES}
          </span>
        </h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {favorites.map((fav) => (
          <button
            key={fav.code}
            onClick={() => onClick(fav.code)}
            className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1.5 text-sm transition-colors hover:border-[var(--color-primary)]"
          >
            <span className="max-w-[80px] truncate font-medium">{fav.name}</span>
            <span className="text-xs text-[var(--color-text-secondary)]">{fav.code}</span>
            <span className={fav.change >= 0 ? 'text-xs text-red-500' : 'text-xs text-green-500'}>
              {fav.change >= 0 ? '+' : ''}{fav.change.toFixed(1)}%
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onRemove(fav.code);
              }}
              className="ml-1 text-xs text-gray-400 hover:text-red-400"
            >
              ✕
            </span>
          </button>
        ))}
      </div>
      {favorites.length >= MAX_FAVORITES && (
        <p className="mt-2 text-xs text-amber-500">候选池已满（50只上限），请先移除部分再添加</p>
      )}
    </div>
  );
}
