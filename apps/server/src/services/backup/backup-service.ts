import type { BackupBundle, ScanSnapshot, FavoriteEntry } from '@trade/shared';
import type { HistoryService } from '../history/history-service.js';
import type { FavoritesService } from '../favorites/favorites-service.js';

export class BackupValidationError extends Error {
  constructor(public readonly code: 'VERSION_MISMATCH' | 'INVALID_BUNDLE', message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

export class BackupService {
  constructor(
    private readonly history: HistoryService,
    private readonly favorites: FavoritesService,
  ) {}

  async export(): Promise<BackupBundle> {
    const groups = await this.history.list('all');
    const ids = groups.flatMap((g) => g.snapshots.map((s) => s.id));
    const snapshots = await Promise.all(ids.map((id) => this.history.get(id)));
    const history = snapshots.filter((s): s is ScanSnapshot => s !== null);
    const favorites = await this.favorites.list();
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      history,
      favorites,
    };
  }

  async import(bundle: unknown): Promise<{ historyCount: number; favoritesCount: number }> {
    const validated = validateBundle(bundle);
    // overwrite favorites
    await this.favorites.replaceAll(validated.favorites);
    // append each history snapshot (idempotent by id; index dedups)
    for (const snap of validated.history) {
      await this.history.append(snap);
    }
    return {
      historyCount: validated.history.length,
      favoritesCount: validated.favorites.length,
    };
  }
}

function validateBundle(raw: unknown): BackupBundle {
  if (!raw || typeof raw !== 'object') {
    throw new BackupValidationError('INVALID_BUNDLE', 'bundle must be an object');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new BackupValidationError('VERSION_MISMATCH', `expected version 1, got ${String(obj.version)}`);
  }
  if (!Array.isArray(obj.history)) {
    throw new BackupValidationError('INVALID_BUNDLE', 'history must be an array');
  }
  if (!Array.isArray(obj.favorites)) {
    throw new BackupValidationError('INVALID_BUNDLE', 'favorites must be an array');
  }
  for (const s of obj.history as unknown[]) {
    if (!s || typeof s !== 'object') {
      throw new BackupValidationError('INVALID_BUNDLE', 'history entry must be object');
    }
    const sn = s as Record<string, unknown>;
    if (typeof sn.id !== 'string' || typeof sn.date !== 'string' || typeof sn.timestamp !== 'string') {
      throw new BackupValidationError('INVALID_BUNDLE', 'history entry missing id/date/timestamp');
    }
    if (!sn.results || typeof sn.results !== 'object') {
      throw new BackupValidationError('INVALID_BUNDLE', 'history entry missing results');
    }
  }
  for (const f of obj.favorites as unknown[]) {
    if (!f || typeof f !== 'object') {
      throw new BackupValidationError('INVALID_BUNDLE', 'favorite entry must be object');
    }
    const fn = f as Record<string, unknown>;
    if (!fn.stock || typeof fn.stock !== 'object') {
      throw new BackupValidationError('INVALID_BUNDLE', 'favorite entry missing stock');
    }
  }
  return {
    version: 1,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    history: obj.history as ScanSnapshot[],
    favorites: obj.favorites as FavoriteEntry[],
  };
}
