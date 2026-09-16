import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  ScanSnapshot,
  ScanSnapshotMeta,
  HistoryRange,
  HistoryDateGroup,
  SnapshotDiff,
  SnapshotDiffRetainedEntry,
  ScreenerResult,
} from '@trade/shared';
import { MAX_HISTORY_ENTRIES } from '@trade/shared';
import { JsonStore } from '../storage/json-store.js';

export class HistoryService {
  private readonly indexStore: JsonStore<ScanSnapshotMeta[]>;
  private readonly historyDir: string;

  constructor(private readonly dataDir: string) {
    this.historyDir = path.join(dataDir, 'history');
    this.indexStore = new JsonStore<ScanSnapshotMeta[]>(
      path.join(this.historyDir, 'index.json'),
      [],
    );
  }

  /** Append a new snapshot: writes shard, updates index, rolls over old entries. */
  async append(snapshot: ScanSnapshot): Promise<void> {
    await fs.mkdir(this.historyDir, { recursive: true });
    await this.writeShard(snapshot);

    await this.indexStore.update((idx) => {
      const meta = toMeta(snapshot);
      const next = [meta, ...idx.filter((m) => m.id !== meta.id)];
      next.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      if (next.length > MAX_HISTORY_ENTRIES) {
        const dropped = next.slice(MAX_HISTORY_ENTRIES);
        // best-effort shard delete; orphans are reaped by sweep()
        for (const m of dropped) {
          void this.deleteShard(m.id).catch((err) => {
            console.error(`[HISTORY] failed to delete shard ${m.id}:`, err);
          });
        }
        return next.slice(0, MAX_HISTORY_ENTRIES);
      }
      return next;
    });
  }

  async get(id: string): Promise<ScanSnapshot | null> {
    try {
      const buf = await fs.readFile(this.shardPath(id), 'utf8');
      const snapshot = JSON.parse(buf) as ScanSnapshot;
      if (!snapshot.aiReviewStatus) {
        const reviewed = Object.values(snapshot.results).some((results) =>
          results.some((result) => result.aiReview),
        );
        snapshot.aiReviewStatus = reviewed ? 'done' : 'not_requested';
      }
      return snapshot;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async list(range: HistoryRange): Promise<HistoryDateGroup[]> {
    const idx = await this.indexStore.read();
    const filtered = filterByRange(idx, range);
    return groupByDate(filtered);
  }

  async diff(fromId: string, toId: string, strategyId: string): Promise<SnapshotDiff | null> {
    const [from, to] = await Promise.all([this.get(fromId), this.get(toId)]);
    if (!from || !to) return null;

    const fromResults = from.results[strategyId] ?? [];
    const toResults = to.results[strategyId] ?? [];
    const fromMap = new Map(fromResults.map((r) => [r.code, r]));
    const toMap = new Map(toResults.map((r) => [r.code, r]));

    const newcomers: ScreenerResult[] = [];
    const dropouts: ScreenerResult[] = [];
    const retained: SnapshotDiffRetainedEntry[] = [];

    for (const [code, toStock] of toMap) {
      const fromStock = fromMap.get(code);
      if (fromStock) {
        retained.push({ stock: toStock, scoreDelta: toStock.score - fromStock.score });
      } else {
        newcomers.push(toStock);
      }
    }
    for (const [code, fromStock] of fromMap) {
      if (!toMap.has(code)) dropouts.push(fromStock);
    }

    return { fromId, toId, strategyId, newcomers, dropouts, retained };
  }

  /** Startup sweep: delete shard files not referenced in index. */
  async sweepOrphans(): Promise<number> {
    await fs.mkdir(this.historyDir, { recursive: true });
    let files: string[];
    try {
      files = await fs.readdir(this.historyDir);
    } catch {
      return 0;
    }
    const idx = await this.indexStore.read();
    const known = new Set(idx.map((m) => `${m.id}.json`));
    known.add('index.json');
    let removed = 0;
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      if (known.has(f)) continue;
      try {
        await fs.unlink(path.join(this.historyDir, f));
        removed++;
      } catch {
        // swallow; next sweep will retry
      }
    }
    return removed;
  }

  // ── internals ──────────────────────────────────────

  private shardPath(id: string): string {
    return path.join(this.historyDir, `${id}.json`);
  }

  private async writeShard(snapshot: ScanSnapshot): Promise<void> {
    const target = this.shardPath(snapshot.id);
    const tmp = `${target}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
    await fs.rename(tmp, target);
  }

  private async deleteShard(id: string): Promise<void> {
    try {
      await fs.unlink(this.shardPath(id));
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return;
      throw err;
    }
  }
}

function toMeta(snapshot: ScanSnapshot): ScanSnapshotMeta {
  const total = Object.values(snapshot.results).reduce((sum, arr) => sum + arr.length, 0);
  const inferredReviewed = Object.values(snapshot.results).some((results) =>
    results.some((result) => result.aiReview),
  );
  return {
    id: snapshot.id,
    date: snapshot.date,
    timestamp: snapshot.timestamp,
    strategyIds: snapshot.strategyIds,
    marketFilter: snapshot.marketFilter,
    totalResults: total,
    aiReviewStatus: snapshot.aiReviewStatus ?? (inferredReviewed ? 'done' : 'not_requested'),
    aiReviewedAt: snapshot.aiReviewedAt,
  };
}

function filterByRange(idx: ScanSnapshotMeta[], range: HistoryRange): ScanSnapshotMeta[] {
  if (range === 'all') return idx;
  const now = new Date();
  const cutoff = new Date(now);
  if (range === 'today') {
    cutoff.setHours(0, 0, 0, 0);
  } else if (range === '7d') {
    cutoff.setDate(cutoff.getDate() - 7);
  } else if (range === '30d') {
    cutoff.setDate(cutoff.getDate() - 30);
  }
  const cutoffIso = cutoff.toISOString();
  return idx.filter((m) => m.timestamp >= cutoffIso);
}

function groupByDate(idx: ScanSnapshotMeta[]): HistoryDateGroup[] {
  const byDate = new Map<string, ScanSnapshotMeta[]>();
  for (const m of idx) {
    const arr = byDate.get(m.date);
    if (arr) arr.push(m);
    else byDate.set(m.date, [m]);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, snapshots]) => ({ date, snapshots }));
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
