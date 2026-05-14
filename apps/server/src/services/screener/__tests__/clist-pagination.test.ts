import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { StockListItem } from '@trade/shared';
import { __setClistFetcherForTest, __setStockCacheStoreForTest, refreshStockList, getStockList } from '../engine.js';

interface ClistDiff { f12: string; f14: string }
interface ClistJson { data?: { total?: number; diff?: ClistDiff[] } }
interface StockCacheFile { fetchedAt: number; stocks: StockListItem[] }

class NoopStockCacheStore {
  data: StockCacheFile = { fetchedAt: 0, stocks: [] };
  async read() { return structuredClone(this.data); }
  async update(fn: (d: StockCacheFile) => StockCacheFile) { this.data = fn(structuredClone(this.data)); return structuredClone(this.data); }
}

beforeEach(() => {
  __setStockCacheStoreForTest(new NoopStockCacheStore());
});

function makeStock(i: number): ClistDiff {
  const code = (i % 2 === 0 ? 600000 + i : 1 + i).toString().padStart(6, '0');
  return { f12: code, f14: `股票${i}` };
}

function pagedFetcher(totalStocks: number, opts: { reportTotal?: boolean } = {}) {
  const reportTotal = opts.reportTotal ?? true;
  const all: ClistDiff[] = Array.from({ length: totalStocks }, (_, i) => makeStock(i));
  const calls: Array<{ pn: number; pz: number }> = [];
  const fetcher = async (pn: number, pz: number): Promise<ClistJson> => {
    calls.push({ pn, pz });
    const start = (pn - 1) * pz;
    return {
      data: {
        ...(reportTotal ? { total: totalStocks } : {}),
        diff: all.slice(start, start + pz),
      },
    };
  };
  return { fetcher, calls };
}

afterEach(() => {
  __setClistFetcherForTest(null);
  __setStockCacheStoreForTest(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('EastMoney clist pagination', () => {
  it('paginates until accumulated count reaches reported total', async () => {
    const { fetcher, calls } = pagedFetcher(5500);
    __setClistFetcherForTest(fetcher);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await refreshStockList();

    expect(res.ok).toBe(true);
    expect(res.count).toBe(5500);
    expect(getStockList()).toHaveLength(5500);
    expect(calls).toHaveLength(55); // 5500 / 100
    expect(calls[0]).toEqual({ pn: 1, pz: 100 });
    expect(calls[54]).toEqual({ pn: 55, pz: 100 });
  });

  it('stops on short page when server omits total', async () => {
    const { fetcher, calls } = pagedFetcher(4050, { reportTotal: false });
    __setClistFetcherForTest(fetcher);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await refreshStockList();

    expect(res.ok).toBe(true);
    expect(res.count).toBe(4050);
    // 40 full pages + 1 short page = 41 calls
    expect(calls).toHaveLength(41);
  });

  it('refuses to cache when upstream serves degraded count (the original bug)', async () => {
    // Simulate the production failure: API claims total=5529 but only returns
    // page 1's 100 stocks; subsequent pages come back empty.
    __setClistFetcherForTest(async (pn) => {
      if (pn > 1) return { data: { total: 5529, diff: [] } };
      return { data: { total: 5529, diff: Array.from({ length: 100 }, (_, i) => makeStock(i)) } };
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.useFakeTimers();

    const promise = refreshStockList();
    await vi.runAllTimersAsync(); // advance through the 2s + 4s retry backoffs
    const res = await promise;

    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/unreachable/);
  });

  it('classifies market by code prefix (6xxxxx → SH, else SZ)', async () => {
    const { fetcher } = pagedFetcher(4500);
    __setClistFetcherForTest(fetcher);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await refreshStockList();
    const list = getStockList();
    expect(list.filter((s) => s.code.startsWith('6')).every((s) => s.market === 'SH')).toBe(true);
    expect(list.filter((s) => !s.code.startsWith('6')).every((s) => s.market === 'SZ')).toBe(true);
  });
});
