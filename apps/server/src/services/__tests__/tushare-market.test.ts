import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __setTushareCacheDirForTest,
  fetchTushareDaily,
  prepareTushareMarketHistory,
} from '../tushare-market.js';

const originalFetch = globalThis.fetch;
const originalToken = process.env.TUSHARE_TOKEN;
const originalRate = process.env.TUSHARE_CALLS_PER_MINUTE;
let tempDir: string;

function ok(data: { fields: string[]; items: unknown[][] }): Response {
  return new Response(JSON.stringify({ code: 0, msg: '', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'tushare-market-'));
  __setTushareCacheDirForTest(tempDir);
  process.env.TUSHARE_TOKEN = 'test-token';
  process.env.TUSHARE_CALLS_PER_MINUTE = '100000';
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.TUSHARE_TOKEN;
  else process.env.TUSHARE_TOKEN = originalToken;
  if (originalRate === undefined) delete process.env.TUSHARE_CALLS_PER_MINUTE;
  else process.env.TUSHARE_CALLS_PER_MINUTE = originalRate;
  __setTushareCacheDirForTest(null);
  await rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('Tushare daily source', () => {
  it('maps newest-first API rows to ascending K-lines and reuses disk cache', async () => {
    const spy = vi.fn(async () => ok({
      fields: ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'vol'],
      items: [
        ['600519.SH', '20260908', 10.2, 10.8, 10.1, 10.6, 200],
        ['600519.SH', '20260907', 10, 10.4, 9.8, 10.2, 100],
      ],
    }));
    globalThis.fetch = spy as unknown as typeof fetch;

    const first = await fetchTushareDaily('600519', 2);
    const second = await fetchTushareDaily('600519', 2);

    expect(first?.map((bar) => bar.date)).toEqual(['2026-09-07', '2026-09-08']);
    expect(first?.[1]).toMatchObject({ close: 10.6, volume: 200 });
    expect(second).toEqual(first);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not call the network when no token is configured', async () => {
    delete process.env.TUSHARE_TOKEN;
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    await expect(fetchTushareDaily('000001', 60)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('downloads scanner history by trade_date and groups it by stock', async () => {
    const spy = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { api_name: string; params: Record<string, string> };
      if (body.api_name === 'trade_cal') {
        return ok({ fields: ['cal_date', 'is_open'], items: [['20260907', 1], ['20260908', 1]] });
      }
      return ok({
        fields: ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'vol'],
        items: [
          ['600519.SH', body.params.trade_date, 10, 11, 9, 10.5, 100],
          ['000001.SZ', body.params.trade_date, 8, 9, 7, 8.5, 80],
        ],
      });
    });
    globalThis.fetch = spy as unknown as typeof fetch;

    const histories = await prepareTushareMarketHistory(2);

    expect(histories?.get('600519')).toHaveLength(2);
    expect(histories?.get('000001')?.[0].close).toBe(8.5);
    expect(spy).toHaveBeenCalledTimes(3); // one calendar + two whole-market days
  });
});
