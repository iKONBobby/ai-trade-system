'use client';

import { useState, useMemo } from 'react';
import type { FavoriteEntry } from '@trade/shared';

const MAX_FAVORITES = 50;

export default function WatchlistPanel({
  favorites,
  onRemove,
  onClick,
  onEdit,
}: {
  favorites: FavoriteEntry[];
  onRemove: (code: string) => void;
  onClick: (code: string) => void;
  onEdit?: (code: string) => void;
}) {
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const f of favorites) for (const t of f.tags) set.add(t);
    return Array.from(set).sort();
  }, [favorites]);

  const filtered = useMemo(() => {
    if (!tagFilter) return favorites;
    return favorites.filter((f) => f.tags.includes(tagFilter));
  }, [favorites, tagFilter]);

  if (favorites.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-400/30 bg-amber-400/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          我的候选池
          <span className="ml-2 text-xs font-normal text-[var(--color-text-secondary)]">
            {filtered.length}/{favorites.length} ({MAX_FAVORITES} 上限)
          </span>
        </h2>
      </div>

      {allTags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setTagFilter(null)}
            className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
              tagFilter === null
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-border)] text-[var(--color-text-secondary)]'
            }`}
          >
            全部
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                tagFilter === tag
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'border border-[var(--color-border)] text-[var(--color-text-secondary)]'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {filtered.map((fav) => (
          <div
            key={fav.stock.code}
            className="group flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1.5 text-sm transition-colors hover:border-[var(--color-primary)]"
          >
            <button onClick={() => onClick(fav.stock.code)} className="flex items-center gap-2">
              <span className="max-w-[80px] truncate font-medium">{fav.stock.name}</span>
              <span className="text-xs text-[var(--color-text-secondary)]">{fav.stock.code}</span>
              <span className={fav.stock.change >= 0 ? 'text-xs text-red-500' : 'text-xs text-green-500'}>
                {fav.stock.change >= 0 ? '+' : ''}{fav.stock.change.toFixed(1)}%
              </span>
            </button>
            {fav.tags.length > 0 && (
              <span className="flex gap-1">
                {fav.tags.map((t) => (
                  <span key={t} className="rounded-full bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-[10px] text-[var(--color-primary)]">
                    {t}
                  </span>
                ))}
              </span>
            )}
            {onEdit && (
              <button
                onClick={() => onEdit(fav.stock.code)}
                className="text-xs text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--color-primary)]"
                title="编辑标签/备注"
              >
                ✎
              </button>
            )}
            <button
              onClick={() => onRemove(fav.stock.code)}
              className="text-xs text-gray-400 hover:text-red-400"
              title="移除"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {favorites.length >= MAX_FAVORITES && (
        <p className="mt-2 text-xs text-amber-500">候选池已满（50 只上限），请先移除部分再添加</p>
      )}
    </div>
  );
}
