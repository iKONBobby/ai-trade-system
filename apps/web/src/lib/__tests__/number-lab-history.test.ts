import { describe, expect, it } from 'vitest';
import { clearNumberRuns, formatStoredNumberRunForClipboard, loadNumberRuns, priorPicksForKind, storeNumberRun } from '../number-lab-history';
import type { AgentRun } from '../number-agent';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function run(kind: 'ssq' | 'dlt', generatedAt: string): AgentRun {
  const front = kind === 'ssq' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
  const back = kind === 'ssq' ? [7] : [6, 7];
  return {
    config: kind === 'ssq'
      ? { kind, name: '双色球', frontLabel: '红球', backLabel: '蓝球', frontMax: 33, frontCount: 6, backMax: 16, backCount: 1 }
      : { kind, name: '大乐透', frontLabel: '前区', backLabel: '后区', frontMax: 35, frontCount: 5, backMax: 12, backCount: 2 },
    mode: 'factor', generatedAt, attempted: 1, rejected: 0,
    rejectionBreakdown: { history: 0, latest: 0, structure: 0, crowding: 0, batch: 0 },
    contextSummary: '', traces: [],
    picks: [{ id: generatedAt, front, back, shape: { odd: 3, even: 3, low: 6, high: 0, span: 5, sum: 21, adjacentPairs: 5, thirds: [6, 0, 0] }, crowdingScore: 10, reason: '', inspirationTrace: '' }],
  };
}

describe('number lab cross-batch history', () => {
  it('reports unavailable or full storage instead of claiming success', () => {
    const value = run('ssq', '2026-09-16T01:00:00.000Z');
    expect(() => storeNumberRun(value, null)).toThrow();
    const storage = memoryStorage();
    storage.setItem = () => { throw new Error('quota'); };
    expect(() => storeNumberRun(value, storage)).toThrow('quota');
  });

  it('retains run details and uses all retained picks for deduplication', () => {
    const storage = memoryStorage();
    const value = run('ssq', '2026-09-16T01:00:00.000Z');
    value.picks = Array.from({ length: 10 }, () => value.picks[0]);
    for (let i = 0; i < 25; i++) storeNumberRun(value, storage);
    const loaded = loadNumberRuns(storage);
    expect(loaded[0].details).toEqual(value);
    expect(priorPicksForKind(loaded, 'ssq')).toHaveLength(250);
  });

  it('persists runs and returns only same-kind prior picks', () => {
    const storage = memoryStorage();
    storeNumberRun(run('ssq', '2026-09-16T01:00:00.000Z'), storage);
    storeNumberRun(run('dlt', '2026-09-16T02:00:00.000Z'), storage);
    const loaded = loadNumberRuns(storage);
    expect(loaded).toHaveLength(2);
    expect(priorPicksForKind(loaded, 'ssq')).toHaveLength(1);
    expect(formatStoredNumberRunForClipboard(loaded[1])).toBe('双色球｜因子实验｜1组\n01. 01 02 03 04 05 06 + 07');
    clearNumberRuns(storage);
    expect(loadNumberRuns(storage)).toEqual([]);
  });
});
