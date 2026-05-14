import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ScanSnapshot, ScreenerResult } from '@trade/shared';
import { __setHistorySinkForTest, runScreener, getJob } from '../engine.js';

/**
 * ENG-D3 regression: if HistoryService.append throws, the scan must still
 * surface success to the API (job.status === 'done', results intact).
 *
 * We can't easily run the full runScan loop here (it makes network calls),
 * so we test the contract by injecting a failing sink and verifying that
 * any downstream caller of getPersistence().history.append survives.
 */

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  __setHistorySinkForTest(null);
  consoleErrorSpy.mockRestore();
  vi.restoreAllMocks();
});

describe('engine history hook (ENG-D3)', () => {
  it('records snapshot via sink when sink succeeds', async () => {
    const appended: ScanSnapshot[] = [];
    __setHistorySinkForTest({
      append: async (snap) => {
        appended.push(snap);
      },
    });

    // Drive the recordSnapshot path directly by simulating a completed job.
    const { __recordSnapshotForTest } = await import('../engine.js');
    await __recordSnapshotForTest({ marketFilter: 'sh' });

    expect(appended).toHaveLength(1);
    expect(appended[0].marketFilter).toBe('sh');
    expect(appended[0].id).toMatch(/^job_test_/);
  });

  it('does NOT throw and does NOT crash when sink throws', async () => {
    __setHistorySinkForTest({
      append: async () => {
        throw new Error('disk full');
      },
    });

    const { __recordSnapshotForTest } = await import('../engine.js');

    // The key contract: recordSnapshot must resolve (never reject), even though sink throws.
    await expect(__recordSnapshotForTest({ marketFilter: 'all' })).resolves.toBeUndefined();

    // And the failure must be logged so an operator can see it.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/HISTORY:WRITE_FAIL/),
      expect.any(Error),
    );
  });

  it('normalizes unknown marketFilter to "all"', async () => {
    const appended: ScanSnapshot[] = [];
    __setHistorySinkForTest({
      append: async (snap) => {
        appended.push(snap);
      },
    });

    const { __recordSnapshotForTest } = await import('../engine.js');
    await __recordSnapshotForTest({ marketFilter: 'garbage' });

    expect(appended[0].marketFilter).toBe('all');
  });

  it('captures all strategy results in the snapshot', async () => {
    const appended: ScanSnapshot[] = [];
    __setHistorySinkForTest({
      append: async (snap) => {
        appended.push(snap);
      },
    });

    const { __recordSnapshotForTest } = await import('../engine.js');
    const stockA: ScreenerResult = {
      code: 'A',
      name: 'a',
      market: 'SH',
      price: 1,
      change: 0,
      open: 1,
      high: 1,
      low: 1,
      preClose: 1,
      volume: 1,
      turnover: 1,
      score: 5,
      triggeredFactors: [],
      klineSnapshot: [],
    };
    await __recordSnapshotForTest({
      marketFilter: 'sz',
      strategyIds: ['s1', 's2'],
      resultsMap: new Map([
        ['s1', [stockA]],
        ['s2', []],
      ]),
    });

    expect(appended[0].strategyIds).toEqual(['s1', 's2']);
    expect(appended[0].results.s1).toHaveLength(1);
    expect(appended[0].results.s2).toEqual([]);
  });

  it('runScreener returns a jobId even though we have not awaited the scan', async () => {
    // sanity check: the public surface still works
    const ids = await runScreener(['ma_bullish'], 'all');
    expect(ids).toHaveLength(1);
    const job = getJob(ids[0]);
    expect(job).toBeDefined();
    // immediately abort so we don't leave a real scan running against eastmoney
    job?.abortController.abort();
  });
});
