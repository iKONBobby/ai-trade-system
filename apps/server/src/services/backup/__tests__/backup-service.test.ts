import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ScreenerResult, ScanSnapshot } from '@trade/shared';
import { HistoryService } from '../../history/history-service.js';
import { FavoritesService } from '../../favorites/favorites-service.js';
import { BackupService, BackupValidationError } from '../backup-service.js';

let tmpDir: string;
let history: HistoryService;
let favorites: FavoritesService;
let backup: BackupService;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-'));
  history = new HistoryService(tmpDir);
  favorites = new FavoritesService(tmpDir);
  backup = new BackupService(history, favorites);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeStock(code: string): ScreenerResult {
  return {
    code,
    name: code,
    market: 'SH',
    price: 1,
    change: 0,
    open: 1,
    high: 1,
    low: 1,
    preClose: 1,
    volume: 100,
    turnover: 1,
    score: 5,
    triggeredFactors: [],
    klineSnapshot: [],
  };
}

function makeSnapshot(id: string, ts: string): ScanSnapshot {
  return {
    id,
    date: ts.slice(0, 10),
    timestamp: ts,
    strategyIds: ['s1'],
    marketFilter: 'all',
    durationMs: 100,
    results: { s1: [makeStock('A')] },
  };
}

describe('BackupService.export', () => {
  it('returns version 1 bundle with all history and favorites', async () => {
    await history.append(makeSnapshot('h1', '2026-05-11T10:00:00.000Z'));
    await favorites.add({ stock: makeStock('600519') });

    const bundle = await backup.export();
    expect(bundle.version).toBe(1);
    expect(bundle.history).toHaveLength(1);
    expect(bundle.favorites).toHaveLength(1);
    expect(bundle.exportedAt).toBeTruthy();
  });

  it('exports empty bundle when no data', async () => {
    const bundle = await backup.export();
    expect(bundle.history).toEqual([]);
    expect(bundle.favorites).toEqual([]);
  });
});

describe('BackupService.import — roundtrip', () => {
  it('export → wipe → import restores state', async () => {
    await history.append(makeSnapshot('h1', '2026-05-11T10:00:00.000Z'));
    await favorites.add({ stock: makeStock('600519'), tags: ['长线'] });
    const bundle = await backup.export();

    await fs.rm(path.join(tmpDir, 'history'), { recursive: true, force: true });
    await fs.rm(path.join(tmpDir, 'favorites.json'), { force: true });

    const result = await backup.import(bundle);
    expect(result).toEqual({ historyCount: 1, favoritesCount: 1 });

    const restoredFavs = await favorites.list();
    expect(restoredFavs[0].stock.code).toBe('600519');
    expect(restoredFavs[0].tags).toEqual(['长线']);

    const restoredSnap = await history.get('h1');
    expect(restoredSnap?.id).toBe('h1');
  });
});

describe('BackupService.import — validation', () => {
  it('rejects non-object bundle', async () => {
    await expect(backup.import('not a bundle')).rejects.toThrow(BackupValidationError);
  });

  it('rejects wrong version', async () => {
    await expect(backup.import({ version: 2, history: [], favorites: [] })).rejects.toThrow(
      /VERSION_MISMATCH|version/i,
    );
  });

  it('rejects when history is not an array', async () => {
    await expect(
      backup.import({ version: 1, history: 'oops', favorites: [] }),
    ).rejects.toThrow(BackupValidationError);
  });

  it('rejects when favorites is not an array', async () => {
    await expect(
      backup.import({ version: 1, history: [], favorites: null }),
    ).rejects.toThrow(BackupValidationError);
  });

  it('rejects history entry missing required fields', async () => {
    await expect(
      backup.import({
        version: 1,
        history: [{ id: 'x' }],
        favorites: [],
      }),
    ).rejects.toThrow(BackupValidationError);
  });

  it('rejects favorite entry missing stock', async () => {
    await expect(
      backup.import({
        version: 1,
        history: [],
        favorites: [{ tags: [], note: '' }],
      }),
    ).rejects.toThrow(BackupValidationError);
  });
});
