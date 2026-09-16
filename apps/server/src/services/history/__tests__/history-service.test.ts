import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ScanSnapshot, ScreenerResult } from '@trade/shared';
import { MAX_HISTORY_ENTRIES } from '@trade/shared';
import { HistoryService } from '../history-service.js';

let tmpDir: string;
let service: HistoryService;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'history-'));
  service = new HistoryService(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeStock(code: string, score: number): ScreenerResult {
  return {
    code,
    name: `stock-${code}`,
    market: 'SH',
    price: 10,
    change: 1,
    open: 10,
    high: 10.5,
    low: 9.8,
    preClose: 9.9,
    volume: 100000,
    turnover: 1.2,
    score,
    triggeredFactors: [],
    klineSnapshot: [9, 9.5, 10],
  };
}

function makeSnapshot(id: string, timestamp: string, results: Record<string, ScreenerResult[]> = {}): ScanSnapshot {
  return {
    id,
    date: timestamp.slice(0, 10),
    timestamp,
    strategyIds: Object.keys(results),
    marketFilter: 'all',
    durationMs: 1000,
    results,
  };
}

describe('HistoryService.append', () => {
  it('writes shard file and updates index', async () => {
    const snap = makeSnapshot('job_1', '2026-05-11T10:00:00.000Z', {
      ma_bullish: [makeStock('600519', 8)],
    });
    await service.append(snap);

    const shard = JSON.parse(await fs.readFile(path.join(tmpDir, 'history', 'job_1.json'), 'utf8'));
    expect(shard.id).toBe('job_1');

    const index = JSON.parse(await fs.readFile(path.join(tmpDir, 'history', 'index.json'), 'utf8'));
    expect(index).toHaveLength(1);
    expect(index[0].totalResults).toBe(1);
  });

  it('stores AI review status in the history index', async () => {
    const snap = {
      ...makeSnapshot('reviewed', '2026-05-11T10:00:00.000Z', { s1: [makeStock('600519', 80)] }),
      aiReviewStatus: 'done' as const,
      aiReviewedAt: '2026-05-11T10:02:00.000Z',
    };
    await service.append(snap);

    const groups = await service.list('all');
    expect(groups[0].snapshots[0]).toMatchObject({
      aiReviewStatus: 'done',
      aiReviewedAt: '2026-05-11T10:02:00.000Z',
    });
  });

  it('keeps newest at head when multiple snapshots appended', async () => {
    await service.append(makeSnapshot('a', '2026-05-10T10:00:00.000Z'));
    await service.append(makeSnapshot('b', '2026-05-11T10:00:00.000Z'));
    await service.append(makeSnapshot('c', '2026-05-09T10:00:00.000Z'));

    const groups = await service.list('all');
    expect(groups.map((g) => g.date)).toEqual(['2026-05-11', '2026-05-10', '2026-05-09']);
  });

  it('rolls over: keeps newest MAX_HISTORY_ENTRIES and deletes orphan shards', async () => {
    // 366 oldest + 1 newest = 367. After append: 365 newest kept.
    const total = MAX_HISTORY_ENTRIES + 2;
    for (let i = 0; i < total; i++) {
      const ts = new Date(2026, 0, 1, 0, i).toISOString(); // 2026-01-01T00:00:00, 00:01, ...
      await service.append(makeSnapshot(`job_${String(i).padStart(4, '0')}`, ts));
    }
    const index = JSON.parse(await fs.readFile(path.join(tmpDir, 'history', 'index.json'), 'utf8'));
    expect(index).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(index[0].id).toBe(`job_${String(total - 1).padStart(4, '0')}`);

    // shard files for dropped IDs should be gone (best-effort, allow some lag)
    await new Promise((r) => setTimeout(r, 50));
    const files = await fs.readdir(path.join(tmpDir, 'history'));
    expect(files.filter((f) => f.endsWith('.json') && f !== 'index.json')).toHaveLength(MAX_HISTORY_ENTRIES);
  });

  it('overwrites by id if same id appended twice', async () => {
    await service.append(makeSnapshot('job_x', '2026-05-11T10:00:00.000Z', { s1: [makeStock('a', 5)] }));
    await service.append(makeSnapshot('job_x', '2026-05-11T10:00:00.000Z', { s1: [makeStock('a', 9)] }));
    const idx = JSON.parse(await fs.readFile(path.join(tmpDir, 'history', 'index.json'), 'utf8'));
    expect(idx).toHaveLength(1);
    const snap = await service.get('job_x');
    expect(snap?.results.s1[0].score).toBe(9);
  });
});

describe('HistoryService.get', () => {
  it('returns null when shard does not exist', async () => {
    expect(await service.get('missing')).toBeNull();
  });

  it('returns null when index references a shard whose file is gone (half-corruption)', async () => {
    await service.append(makeSnapshot('job_a', '2026-05-11T10:00:00.000Z'));
    await fs.unlink(path.join(tmpDir, 'history', 'job_a.json'));
    expect(await service.get('job_a')).toBeNull();
  });

  it('infers reviewed state for legacy snapshots containing AI results', async () => {
    const stock = makeStock('600519', 82);
    stock.aiReview = { score: 88, confidence: 75, thesis: '趋势较稳', risks: ['回撤风险'] };
    stock.quantScore = 80;
    await service.append(makeSnapshot('legacy_reviewed', '2026-05-11T10:00:00.000Z', { s1: [stock] }));

    const snapshot = await service.get('legacy_reviewed');

    expect(snapshot?.aiReviewStatus).toBe('done');
  });
});

describe('HistoryService.list (range filtering)', () => {
  it('today filter excludes earlier days', async () => {
    const today = new Date().toISOString();
    const yesterday = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    await service.append(makeSnapshot('today', today));
    await service.append(makeSnapshot('yesterday', yesterday));
    const groups = await service.list('today');
    const ids = groups.flatMap((g) => g.snapshots.map((s) => s.id));
    expect(ids).toContain('today');
    expect(ids).not.toContain('yesterday');
  });

  it('7d filter excludes >7d old', async () => {
    const recent = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
    const stale = new Date(Date.now() - 10 * 86400 * 1000).toISOString();
    await service.append(makeSnapshot('recent', recent));
    await service.append(makeSnapshot('stale', stale));
    const groups = await service.list('7d');
    const ids = groups.flatMap((g) => g.snapshots.map((s) => s.id));
    expect(ids).toContain('recent');
    expect(ids).not.toContain('stale');
  });

  it('all returns everything', async () => {
    await service.append(makeSnapshot('a', '2025-01-01T00:00:00.000Z'));
    await service.append(makeSnapshot('b', new Date().toISOString()));
    const groups = await service.list('all');
    const ids = groups.flatMap((g) => g.snapshots.map((s) => s.id));
    expect(ids).toEqual(expect.arrayContaining(['a', 'b']));
  });
});

describe('HistoryService.diff', () => {
  it('computes newcomers / dropouts / retained with score delta', async () => {
    await service.append(
      makeSnapshot('from', '2026-05-10T10:00:00.000Z', {
        s1: [makeStock('A', 5), makeStock('B', 8)],
      }),
    );
    await service.append(
      makeSnapshot('to', '2026-05-11T10:00:00.000Z', {
        s1: [makeStock('B', 9), makeStock('C', 7)],
      }),
    );
    const diff = await service.diff('from', 'to', 's1');
    expect(diff?.newcomers.map((s) => s.code)).toEqual(['C']);
    expect(diff?.dropouts.map((s) => s.code)).toEqual(['A']);
    expect(diff?.retained.map((r) => ({ code: r.stock.code, delta: r.scoreDelta }))).toEqual([
      { code: 'B', delta: 1 },
    ]);
  });

  it('returns null when either snapshot is missing', async () => {
    await service.append(makeSnapshot('only-one', '2026-05-11T10:00:00.000Z'));
    expect(await service.diff('only-one', 'missing', 's1')).toBeNull();
    expect(await service.diff('missing', 'only-one', 's1')).toBeNull();
  });

  it('fromId == toId yields all retained, no newcomers, no dropouts', async () => {
    await service.append(
      makeSnapshot('same', '2026-05-11T10:00:00.000Z', {
        s1: [makeStock('A', 7)],
      }),
    );
    const diff = await service.diff('same', 'same', 's1');
    expect(diff?.newcomers).toEqual([]);
    expect(diff?.dropouts).toEqual([]);
    expect(diff?.retained.map((r) => r.scoreDelta)).toEqual([0]);
  });

  it('handles strategyId not present in either snapshot', async () => {
    await service.append(makeSnapshot('a', '2026-05-10T10:00:00.000Z', { s1: [makeStock('A', 5)] }));
    await service.append(makeSnapshot('b', '2026-05-11T10:00:00.000Z', { s1: [makeStock('B', 7)] }));
    const diff = await service.diff('a', 'b', 's_missing');
    expect(diff?.newcomers).toEqual([]);
    expect(diff?.dropouts).toEqual([]);
    expect(diff?.retained).toEqual([]);
  });
});

describe('HistoryService.sweepOrphans', () => {
  it('removes shard files not referenced in index', async () => {
    await service.append(makeSnapshot('keep', '2026-05-11T10:00:00.000Z'));
    await fs.writeFile(path.join(tmpDir, 'history', 'orphan_xyz.json'), '{}', 'utf8');
    const removed = await service.sweepOrphans();
    expect(removed).toBe(1);
    const files = await fs.readdir(path.join(tmpDir, 'history'));
    expect(files.sort()).toEqual(['index.json', 'keep.json']);
  });

  it('returns 0 when no orphans', async () => {
    await service.append(makeSnapshot('a', '2026-05-11T10:00:00.000Z'));
    expect(await service.sweepOrphans()).toBe(0);
  });

  it('handles missing history dir gracefully', async () => {
    expect(await service.sweepOrphans()).toBe(0);
  });
});
