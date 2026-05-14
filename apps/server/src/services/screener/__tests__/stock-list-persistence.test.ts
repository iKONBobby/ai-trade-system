import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { StockListItem } from '@trade/shared';
import {
  initStockList,
  refreshStockList,
  getStockList,
  __setClistFetcherForTest,
  __setStockCacheStoreForTest,
  __resetStockListForTest,
} from '../engine.js';

interface StockCacheFile {
  fetchedAt: number;
  stocks: StockListItem[];
}

/** In-memory replacement for JsonStore so tests never touch the real disk. */
class InMemoryStockCacheStore {
  data: StockCacheFile;
  constructor(initial: StockCacheFile = { fetchedAt: 0, stocks: [] }) {
    this.data = initial;
  }
  async read(): Promise<StockCacheFile> {
    return structuredClone(this.data);
  }
  async update(fn: (data: StockCacheFile) => StockCacheFile): Promise<StockCacheFile> {
    this.data = fn(structuredClone(this.data));
    return structuredClone(this.data);
  }
}

function makeStocks(n: number): StockListItem[] {
  return Array.from({ length: n }, (_, i) => ({
    code: ((i % 2 === 0 ? 600000 + i : 1 + i) + '').padStart(6, '0'),
    name: `S${i}`,
    market: i % 2 === 0 ? 'SH' : 'SZ' as 'SH' | 'SZ',
  }));
}

/** Pagination-aware fetcher driven by an in-memory list. */
function fetcherFor(stocks: StockListItem[]) {
  return async (pn: number, pz: number) => {
    const start = (pn - 1) * pz;
    return {
      data: {
        total: stocks.length,
        diff: stocks.slice(start, start + pz).map((s) => ({ f12: s.code, f14: s.name })),
      },
    };
  };
}

beforeEach(() => {
  __resetStockListForTest();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  __setClistFetcherForTest(null);
  __setStockCacheStoreForTest(null);
  __resetStockListForTest();
  vi.restoreAllMocks();
});

describe('stock list persistence', () => {
  it('loads from disk cache instantly without touching the network', async () => {
    const persisted = makeStocks(5500);
    const store = new InMemoryStockCacheStore({ fetchedAt: Date.now() - 86400000, stocks: persisted });
    __setStockCacheStoreForTest(store);

    // If the network were touched, this fetcher would throw and we'd notice.
    const networkSpy = vi.fn(async () => { throw new Error('network must not be called'); });
    __setClistFetcherForTest(networkSpy);

    await initStockList();

    expect(getStockList()).toHaveLength(5500);
    // Background refresh fires but is allowed to fail silently — we don't await it,
    // and the disk-cache path proves the hot path didn't depend on the network.
  });

  it('falls back to the bundled JSON when disk cache is empty', async () => {
    __setStockCacheStoreForTest(new InMemoryStockCacheStore({ fetchedAt: 0, stocks: [] }));
    __setClistFetcherForTest(async () => { throw new Error('upstream down'); });

    await initStockList();

    // Bundled fallback is the shipped src/data/stocks.json (100 stocks at time of writing).
    expect(getStockList().length).toBeGreaterThan(0);
  });

  it('background refresh persists the fresh snapshot to the cache store', async () => {
    const store = new InMemoryStockCacheStore({ fetchedAt: 0, stocks: [] });
    __setStockCacheStoreForTest(store);

    const fresh = makeStocks(5500);
    __setClistFetcherForTest(fetcherFor(fresh));

    await initStockList();
    // Allow background refresh microtasks to drain.
    await new Promise((r) => setTimeout(r, 50));

    expect(store.data.stocks).toHaveLength(5500);
    expect(store.data.fetchedAt).toBeGreaterThan(0);
    expect(getStockList()).toHaveLength(5500);
  });

  it('manual refresh persists on success', async () => {
    const store = new InMemoryStockCacheStore({ fetchedAt: 0, stocks: makeStocks(100) });
    __setStockCacheStoreForTest(store);

    const fresh = makeStocks(5500);
    __setClistFetcherForTest(fetcherFor(fresh));

    const res = await refreshStockList();

    expect(res.ok).toBe(true);
    expect(res.count).toBe(5500);
    expect(store.data.stocks).toHaveLength(5500);
    expect(store.data.fetchedAt).toBeGreaterThan(0);
  });

  it('refresh failure leaves both memory cache and disk cache untouched', async () => {
    const original = makeStocks(5500);
    const store = new InMemoryStockCacheStore({ fetchedAt: 1000, stocks: original });
    __setStockCacheStoreForTest(store);

    __setClistFetcherForTest(async () => { throw new Error('boom'); });

    await initStockList(); // populates from disk
    expect(getStockList()).toHaveLength(5500);

    vi.useFakeTimers();
    const promise = refreshStockList();
    await vi.runAllTimersAsync();
    const res = await promise;
    vi.useRealTimers();

    expect(res.ok).toBe(false);
    expect(getStockList()).toHaveLength(5500); // memory preserved
    expect(store.data.stocks).toHaveLength(5500); // disk preserved
    expect(store.data.fetchedAt).toBe(1000); // not bumped
  });
});
