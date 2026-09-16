import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetHithinkStateForTest,
  fetchHithinkDaily,
  fetchHithinkRealtime,
  fetchHithinkRealtimeBatch,
  hasHithinkApiKey,
} from '../hithink-market.js';

const originalFetch = globalThis.fetch;
const originalKey = process.env.HITHINK_FINANCE_API_KEY;
const originalBaseUrl = process.env.HITHINK_FINANCE_BASE_URL;

function ok<T>(data: T): Response {
  return new Response(JSON.stringify({ code: 0, message: 'success', request_id: 'req-test', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  process.env.HITHINK_FINANCE_API_KEY = 'test-key';
  process.env.HITHINK_FINANCE_BASE_URL = 'https://example.test';
  __resetHithinkStateForTest();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.HITHINK_FINANCE_API_KEY;
  else process.env.HITHINK_FINANCE_API_KEY = originalKey;
  if (originalBaseUrl === undefined) delete process.env.HITHINK_FINANCE_BASE_URL;
  else process.env.HITHINK_FINANCE_BASE_URL = originalBaseUrl;
  __resetHithinkStateForTest();
  vi.restoreAllMocks();
});

describe('HiThink market provider', () => {
  it('is disabled cleanly when no API key is configured', async () => {
    delete process.env.HITHINK_FINANCE_API_KEY;
    expect(hasHithinkApiKey()).toBe(false);
    await expect(fetchHithinkDaily('600519', 60)).resolves.toBeNull();
  });

  it('maps official snapshot fields without confusing turnover amount with turnover rate', async () => {
    const spy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toContain('/api/a-share/prices/snapshot?');
      expect(String(input)).toContain('thscodes=600519.SH%2C000001.SZ');
      expect(new Headers(init?.headers).get('X-api-key')).toBe('test-key');
      return ok({
        timestamp: 1_789_000_000_000,
        total: 2,
        item: [
          {
            thscode: '600519.SH', ticker: '600519', volume: 1_200_000, turnover: 2_300_000_000,
            last_price: 1500, price_change_ratio_pct: 1.2, open_price: 1480,
            high_price: 1510, low_price: 1475, prev_price: 1482.22,
          },
          {
            thscode: '000001.SZ', ticker: '000001', volume: 900_000, turnover: 100_000_000,
            last_price: 12, price_change_ratio_pct: -0.5, open_price: 12.1,
            high_price: 12.2, low_price: 11.9, prev_price: 12.06,
          },
        ],
      });
    });
    globalThis.fetch = spy as unknown as typeof fetch;

    const quotes = await fetchHithinkRealtimeBatch(['600519', '000001']);

    expect(quotes.get('600519')).toMatchObject({
      source: 'hithink',
      price: 1500,
      volume: 12_000,
      turnover: 0,
      turnoverAvailable: false,
      turnoverAmount: 2_300_000_000,
      quoteTimestamp: 1_789_000_000_000,
    });
  });

  it('adds the stock name for a single-stock request', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/prices/snapshot')) {
        return ok({
          timestamp: null,
          item: [{
            ticker: '600519', last_price: 1500, price_change_ratio_pct: 1,
            open_price: 1490, high_price: 1510, low_price: 1480, prev_price: 1485,
            volume: 100_000, turnover: 150_000_000,
          }],
        });
      }
      return ok({ item: [{ ticker: '600519', name: '贵州茅台' }] });
    }) as unknown as typeof fetch;

    const quote = await fetchHithinkRealtime('600519');
    expect(quote.name).toBe('贵州茅台');
  });

  it('maps historical timestamps in the Shanghai timezone', async () => {
    // 2024-05-20 00:00:00 Asia/Shanghai.
    const dateMs = Date.UTC(2024, 4, 19, 16);
    globalThis.fetch = vi.fn(async () => ok({
      timestamp: dateMs,
      item: [{
        date_ms: dateMs,
        open_price: 10,
        high_price: 11,
        low_price: 9,
        close_price: 10.5,
        volume: 1000,
      }],
    })) as unknown as typeof fetch;

    const klines = await fetchHithinkDaily('600519', 1);
    expect(klines).toEqual([{ date: '2024-05-20', open: 10, high: 11, low: 9, close: 10.5, volume: 1000 }]);
  });

  it('rejects historical rows with null prices instead of converting them to zero', async () => {
    globalThis.fetch = vi.fn(async () => ok({
      item: [{
        date_ms: Date.UTC(2024, 4, 19, 16),
        open_price: null,
        high_price: 11,
        low_price: 9,
        close_price: 10.5,
        volume: 1000,
      }],
    })) as unknown as typeof fetch;

    await expect(fetchHithinkDaily('600519', 1)).resolves.toBeNull();
  });
});
