'use client';

import { useEffect, useState } from 'react';
import type { FavoriteEntry } from '@trade/shared';
import { FAVORITE_TAG_LIMIT, FAVORITE_NOTE_LIMIT } from '@trade/shared';

export default function FavoriteEditDialog({
  favorite,
  onClose,
  onSave,
}: {
  favorite: FavoriteEntry;
  onClose: () => void;
  onSave: (patch: { tags: string[]; note: string }) => Promise<void>;
}) {
  const [tags, setTags] = useState<string[]>(favorite.tags);
  const [tagDraft, setTagDraft] = useState('');
  const [note, setNote] = useState(favorite.note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    if (tags.length >= FAVORITE_TAG_LIMIT) {
      setError(`最多 ${FAVORITE_TAG_LIMIT} 个标签`);
      return;
    }
    if (t.length > 20) {
      setError('标签最多 20 字');
      return;
    }
    if (tags.includes(t)) {
      setTagDraft('');
      return;
    }
    setTags([...tags, t]);
    setTagDraft('');
    setError('');
  };

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const handleSave = async () => {
    if (note.length > FAVORITE_NOTE_LIMIT) {
      setError(`备注最多 ${FAVORITE_NOTE_LIMIT} 字`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ tags, note });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">
              {favorite.stock.name}
              <span className="ml-2 text-xs font-normal text-[var(--color-text-secondary)]">{favorite.stock.code}</span>
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-red-400">✕</button>
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">
            标签 ({tags.length}/{FAVORITE_TAG_LIMIT})
          </label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs text-[var(--color-primary)]">
                {t}
                <button onClick={() => removeTag(t)} className="text-[var(--color-primary)]/60 hover:text-red-400">✕</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="如：长线 / 短线 / 观察"
              maxLength={20}
              className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm"
            />
            <button
              onClick={addTag}
              disabled={!tagDraft.trim() || tags.length >= FAVORITE_TAG_LIMIT}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-50"
            >
              添加
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            备注
            <span className={note.length > FAVORITE_NOTE_LIMIT ? 'text-red-400' : ''}>
              {note.length}/{FAVORITE_NOTE_LIMIT}
            </span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="为什么收藏？什么情况下卖？"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-red-400/30 bg-red-400/5 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
