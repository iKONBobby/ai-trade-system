import path from 'node:path';
import type { FavoriteEntry, ScreenerResult } from '@trade/shared';
import { FAVORITE_TAG_LIMIT, FAVORITE_NOTE_LIMIT } from '@trade/shared';
import { JsonStore } from '../storage/json-store.js';

export class FavoriteValidationError extends Error {
  constructor(public readonly code: 'INVALID_TAGS' | 'NOTE_TOO_LONG', message: string) {
    super(message);
    this.name = 'FavoriteValidationError';
  }
}

export interface AddFavoriteInput {
  stock: ScreenerResult;
  tags?: string[];
  note?: string;
}

export interface UpdateFavoriteInput {
  tags?: string[];
  note?: string;
}

export class FavoritesService {
  private readonly store: JsonStore<FavoriteEntry[]>;

  constructor(dataDir: string) {
    this.store = new JsonStore<FavoriteEntry[]>(path.join(dataDir, 'favorites.json'), []);
  }

  async list(): Promise<FavoriteEntry[]> {
    return this.store.read();
  }

  async add(input: AddFavoriteInput): Promise<FavoriteEntry[]> {
    const tags = input.tags ?? [];
    const note = input.note ?? '';
    validateTags(tags);
    validateNote(note);
    return this.store.update((items) => {
      if (items.some((f) => f.stock.code === input.stock.code)) return items;
      return [
        ...items,
        { stock: input.stock, tags, note, addedAt: new Date().toISOString() },
      ];
    });
  }

  async update(code: string, patch: UpdateFavoriteInput): Promise<FavoriteEntry | null> {
    if (patch.tags !== undefined) validateTags(patch.tags);
    if (patch.note !== undefined) validateNote(patch.note);
    let updated: FavoriteEntry | null = null;
    await this.store.update((items) =>
      items.map((f) => {
        if (f.stock.code !== code) return f;
        const next: FavoriteEntry = {
          ...f,
          tags: patch.tags ?? f.tags,
          note: patch.note ?? f.note,
        };
        updated = next;
        return next;
      }),
    );
    return updated;
  }

  async remove(code: string): Promise<boolean> {
    let removed = false;
    await this.store.update((items) => {
      const next = items.filter((f) => f.stock.code !== code);
      removed = next.length !== items.length;
      return next;
    });
    return removed;
  }

  /** Skip duplicates by code. Returns inserted count. */
  async bulkImport(stocks: ScreenerResult[]): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;
    await this.store.update((items) => {
      const existing = new Set(items.map((f) => f.stock.code));
      const now = new Date().toISOString();
      const fresh: FavoriteEntry[] = [];
      for (const stock of stocks) {
        if (existing.has(stock.code)) {
          skipped++;
          continue;
        }
        existing.add(stock.code);
        fresh.push({ stock, tags: [], note: '', addedAt: now });
        added++;
      }
      return [...items, ...fresh];
    });
    return { added, skipped };
  }

  /** Restore overwrites the entire favorites list (used by backup restore). */
  async replaceAll(entries: FavoriteEntry[]): Promise<void> {
    for (const e of entries) {
      validateTags(e.tags);
      validateNote(e.note);
    }
    await this.store.update(() => entries);
  }
}

function validateTags(tags: string[]): void {
  if (!Array.isArray(tags)) {
    throw new FavoriteValidationError('INVALID_TAGS', 'tags must be an array');
  }
  if (tags.length > FAVORITE_TAG_LIMIT) {
    throw new FavoriteValidationError('INVALID_TAGS', `most ${FAVORITE_TAG_LIMIT} tags`);
  }
  for (const t of tags) {
    if (typeof t !== 'string' || t.length === 0 || t.length > 20) {
      throw new FavoriteValidationError('INVALID_TAGS', 'each tag must be 1-20 chars');
    }
  }
}

function validateNote(note: string): void {
  if (typeof note !== 'string') {
    throw new FavoriteValidationError('NOTE_TOO_LONG', 'note must be a string');
  }
  if (note.length > FAVORITE_NOTE_LIMIT) {
    throw new FavoriteValidationError('NOTE_TOO_LONG', `note exceeds ${FAVORITE_NOTE_LIMIT} chars`);
  }
}
