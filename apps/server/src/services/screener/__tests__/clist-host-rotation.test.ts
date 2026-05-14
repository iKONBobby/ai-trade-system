import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { StockListItem } from '@trade/shared';
import { __setClistFetcherForTest, __setStockCacheStoreForTest, refreshStockList } from '../engine.js';

interface StockCacheFile { fetchedAt: number; stocks: StockListItem[] }
class NoopStockCacheStore {
  data: StockCacheFile = { fetchedAt: 0, stocks: [] };
  async read() { return structuredClone(this.data); }
  async update(fn: (d: StockCacheFile) => StockCacheFile) { this.data = fn(structuredClone(this.data)); return structuredClone(this.data); }
}

// These tests target defaultClistFetch via the real global fetch. We stub fetch
// to simulate per-host outcomes (502 / network error / 200) and assert that the
// rotation tries multiple hosts and recovers when at least one is healthy.

interface FetchCall { url: string; }

function installFetchStub(handler: (url: string) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const stub = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url });
    return await handler(url);
  });
  vi.stubGlobal('fetch', stub);
  return { calls };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function hostOf(url: string): string {
  return new URL(url).hostname;
}

beforeEach(() => {
  // Ensure defaultClistFetch (not a test stub) is in play.
  __setClistFetcherForTest(null);
  // Use an in-memory cache store so refreshStockList() never touches the real disk.
  __setStockCacheStoreForTest(new NoopStockCacheStore());
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  __setStockCacheStoreForTest(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EastMoney host rotation', () => {
  it('falls through 502s and network errors until a healthy host responds', async () => {
    // Apex always 502, all but one shard throw, one shard returns full payload.
    const healthy = '82.push2.eastmoney.com';
    const totalStocks = 4500;
    const stocks = Array.from({ length: totalStocks }, (_, i) => ({
      f12: ((i % 2 === 0 ? 600000 + i : 1 + i) + '').padStart(6, '0'),
      f14: `S${i}`,
    }));

    const { calls } = installFetchStub((url) => {
      const host = hostOf(url);
      if (host === 'push2.eastmoney.com') return new Response('bad gateway', { status: 502 });
      if (host !== healthy) throw new TypeError('fetch failed');
      const pn = Number(new URL(url).searchParams.get('pn'));
      const pz = Number(new URL(url).searchParams.get('pz'));
      const start = (pn - 1) * pz;
      return jsonResponse({ data: { total: totalStocks, diff: stocks.slice(start, start + pz) } });
    });

    const res = await refreshStockList();

    expect(res.ok).toBe(true);
    expect(res.count).toBe(totalStocks);
    // We should have hit several hosts on page 1, then stuck with the healthy one.
    const page1Hosts = new Set(
      calls.filter((c) => new URL(c.url).searchParams.get('pn') === '1').map((c) => hostOf(c.url)),
    );
    expect(page1Hosts.size).toBeGreaterThan(1);
    expect(page1Hosts.has(healthy)).toBe(true);

    // After lock-in, subsequent pages should hit the healthy host first (and succeed in one try).
    const page2Calls = calls.filter((c) => new URL(c.url).searchParams.get('pn') === '2');
    expect(page2Calls.length).toBeGreaterThan(0);
    expect(hostOf(page2Calls[0].url)).toBe(healthy);
  });

  it('reports failure cleanly when every host is down', async () => {
    installFetchStub(() => new Response('bad gateway', { status: 502 }));
    vi.useFakeTimers();

    const promise = refreshStockList();
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/unreachable/);
    vi.useRealTimers();
  });

  it('sends User-Agent and Referer headers (some shards 403 without them)', async () => {
    const totalStocks = 4200;
    const stocks = Array.from({ length: totalStocks }, (_, i) => ({
      f12: ((600000 + i) + '').padStart(6, '0'),
      f14: `S${i}`,
    }));
    const seenHeaders: Headers[] = [];
    const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seenHeaders.push(new Headers(init?.headers));
      const url = typeof input === 'string' ? input : input.toString();
      const pn = Number(new URL(url).searchParams.get('pn'));
      const pz = Number(new URL(url).searchParams.get('pz'));
      const start = (pn - 1) * pz;
      return jsonResponse({ data: { total: totalStocks, diff: stocks.slice(start, start + pz) } });
    });
    vi.stubGlobal('fetch', stub);

    const res = await refreshStockList();
    expect(res.ok).toBe(true);

    expect(seenHeaders.length).toBeGreaterThan(0);
    const h = seenHeaders[0];
    expect(h.get('user-agent')).toMatch(/Mozilla/);
    expect(h.get('referer')).toMatch(/eastmoney/);
  });
});
