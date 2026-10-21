import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../market.js', () => ({ fetchRealtimeFromSource: vi.fn(), fetchRealtimeBatchFromSource: vi.fn(), fetchKLine: vi.fn() }));
vi.mock('../../tushare-market.js', () => ({ prepareTushareMarketHistory: vi.fn(async () => null) }));
import { fetchRealtimeFromSource, fetchRealtimeBatchFromSource, fetchKLine } from '../../market.js';
import { getStockList, runScreener, getJob, cancelJob, __resetStockListForTest, __setHistorySinkForTest } from '../engine.js';

beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks();
  __resetStockListForTest(); __setHistorySinkForTest({ append: async () => {} });
  vi.mocked(fetchRealtimeBatchFromSource).mockResolvedValue(new Map());
  for (let n = 0; n < 120; n++) getStockList().push({ code: String(600000 + n), name: 'test', market: 'SH' });
});
afterEach(() => { __resetStockListForTest(); __setHistorySinkForTest(null); vi.useRealTimers(); });

it('bounds missing-quote fallback to 50 calls and four workers while accounting for all stocks', async () => {
  let active = 0, peak = 0;
  vi.mocked(fetchRealtimeFromSource).mockImplementation(async () => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 10)); active--;
    throw new Error('upstream offline');
  });
  const [id] = await runScreener([]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetchRealtimeFromSource).toHaveBeenCalledTimes(50);
  expect(peak).toBe(4);
  expect(fetchKLine).not.toHaveBeenCalled();
  expect(getJob(id)).toMatchObject({ status: 'done', progress: { total: 120, scanned: 120, failed: 120 } });
  expect(fetchRealtimeBatchFromSource).toHaveBeenCalledWith(expect.any(Array), 'auto', expect.objectContaining({ rateLimit: true, retries: 0 }));
});

it('stops scheduling workers when a scan is cancelled', async () => {
  vi.mocked(fetchRealtimeFromSource).mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, 100)); throw new Error('offline');
  });
  const [id] = await runScreener([]);
  await vi.advanceTimersByTimeAsync(1);
  cancelJob(id);
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetchRealtimeFromSource).toHaveBeenCalledTimes(4);
  expect(getJob(id)?.status).toBe('cancelled');
});
