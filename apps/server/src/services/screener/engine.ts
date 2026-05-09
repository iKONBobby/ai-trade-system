import type { ScreenerResult, Strategy, TriggeredFactor, StockListItem } from '@trade/shared';
import type { ScanningJob } from './types.js';
import { getStrategy } from './strategies.js';
import { getFactor } from './factors.js';
import { fetchRealtime, fetchKLine } from '../market.js';

// ── Stock list cache ──────────────────────────────────────────────

let stockListCache: StockListItem[] = [];
let stockListLoaded = false;

async function fetchStockListFromEastMoney(): Promise<StockListItem[]> {
  const url = 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5000&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14';
  const resp = await fetch(url);
  const json = await resp.json() as {
    data?: { diff?: Array<{ f12: string; f14: string }> };
  };
  const items = json.data?.diff ?? [];
  return items
    .filter((item) => /^\d{6}$/.test(item.f12))
    .map((item) => ({
      code: item.f12,
      name: item.f14,
      market: (item.f12.startsWith('6') ? 'SH' : 'SZ') as 'SH' | 'SZ',
    }));
}

export async function initStockList(): Promise<void> {
  if (stockListLoaded) return;
  try {
    stockListCache = await fetchStockListFromEastMoney();
    stockListLoaded = true;
    console.log(`[SCREENER] Stock list loaded: ${stockListCache.length} stocks`);
  } catch {
    // Fallback: try bundled JSON
    try {
      const { default: bundled } = await import('../../data/stocks.json', { with: { type: 'json' } });
      stockListCache = bundled as StockListItem[];
      stockListLoaded = true;
      console.log(`[SCREENER] Stock list loaded from fallback: ${stockListCache.length} stocks`);
    } catch {
      console.error('[SCREENER] Failed to load stock list');
      stockListCache = [];
      stockListLoaded = true;
    }
  }

  // Hourly refresh
  setInterval(async () => {
    try {
      stockListCache = await fetchStockListFromEastMoney();
      console.log(`[SCREENER] Stock list refreshed: ${stockListCache.length} stocks`);
    } catch {
      // Keep previous cache on refresh failure
    }
  }, 3600000);
}

export function getStockList(): StockListItem[] {
  return stockListCache;
}

// ── Pre-filter ────────────────────────────────────────────────────

const ST_PATTERN = /^(\*?ST|N|C)/;

function prefilterStock(market: { name: string; price: number; change: number; turnover: number; volume: number }): boolean {
  if (ST_PATTERN.test(market.name)) return false; // ST / *ST / 新股
  if (market.change >= 9.8 || market.change <= -9.8) return false; // 涨跌停
  if (market.turnover < 0.5) return false; // 换手率太低
  return true;
}

// ── Scoring ───────────────────────────────────────────────────────

interface FactorCondition {
  factorId: string;
  operator: string;
  value: string | number;
  weight: number;
}

function evaluateCondition(condition: FactorCondition, klines: { close: number; high: number; low: number; open: number; volume: number; date: string }[], market: { price: number; high: number; low: number; preClose: number }): { passed: boolean; actualValue: number | string | null } {
  const factor = getFactor(condition.factorId);
  if (!factor) return { passed: false, actualValue: null };

  const result = factor.compute(klines as any, market as any);

  if (result === null) return { passed: false, actualValue: null };

  const { operator, value: configValue } = condition;

  if (typeof result === 'boolean') {
    if (factor.labels) {
      const label = factor.labels[String(result) as 'true' | 'false'];
      if (operator === 'eq') return { passed: label === configValue, actualValue: label };
      if (operator === 'neq') return { passed: label !== configValue, actualValue: label };
    }
    const numResult = result ? 1 : 0;
    const numVal = Number(configValue);
    return { passed: compare(numResult, operator, isNaN(numVal) ? 0 : numVal), actualValue: numResult };
  }

  return { passed: compare(result, operator, Number(configValue)), actualValue: result };
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case 'eq': return a === b;
    case 'neq': return a !== b;
    case 'gt': return a > b;
    case 'lt': return a < b;
    case 'gte': return a >= b;
    case 'lte': return a <= b;
    default: return false;
  }
}

function scoreStock(klines: any[], market: any, strategy: Strategy): { score: number; triggered: TriggeredFactor[] } {
  let totalScore = 0;
  const triggered: TriggeredFactor[] = [];

  for (const cond of strategy.factors) {
    const { passed, actualValue } = evaluateCondition(cond, klines, market);
    const factor = getFactor(cond.factorId);

    let displayName = factor?.name ?? cond.factorId;
    if (actualValue !== null && actualValue !== undefined && typeof actualValue !== 'boolean') {
      displayName = `${displayName}(${typeof actualValue === 'number' ? actualValue.toFixed(1) : actualValue})`;
    }

    triggered.push({
      id: cond.factorId,
      name: displayName,
      passed,
      weight: cond.weight,
    });

    if (passed) totalScore += cond.weight;
  }

  return { score: totalScore, triggered };
}

// ── Job management ────────────────────────────────────────────────

const jobs = new Map<string, ScanningJob>();
let jobCleanupInterval: ReturnType<typeof setInterval> | null = null;

function startJobCleanup() {
  if (jobCleanupInterval) return;
  jobCleanupInterval = setInterval(() => {
    const now = Date.now();
    const ttl = 10 * 60 * 1000;
    for (const [id, job] of jobs) {
      if (now - job.startedAt > ttl) {
        job.abortController.abort();
        jobs.delete(id);
      }
    }
  }, 60000);
}

// ── Public API ────────────────────────────────────────────────────

export function getJob(jobId: string): ScanningJob | undefined {
  return jobs.get(jobId);
}

export function cancelJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'running') return false;
  job.abortController.abort();
  job.status = 'cancelled';
  return true;
}

export async function runScreener(strategyIds: string[], marketFilter?: string): Promise<string[]> {
  startJobCleanup();

  const effectiveIds = strategyIds.length > 0 ? strategyIds : ['ma_bullish'];

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job: ScanningJob = {
    id: jobId,
    strategyIds: effectiveIds,
    status: 'running',
    progress: { scanned: 0, total: 0 },
    results: new Map(),
    startedAt: Date.now(),
    abortController: new AbortController(),
  };
  jobs.set(jobId, job);

  // Run async
  runScan(job, marketFilter).catch((err) => {
    if (job.status !== 'cancelled') {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[SCREENER:ERROR] job=${jobId}`, err);
    }
  });

  return [jobId];
}

async function runScan(job: ScanningJob, marketFilter?: string): Promise<void> {
  const signal = job.abortController.signal;
  console.log(`[SCREENER:START] job=${job.id} strategies=${job.strategyIds.join(',')}`);

  // Get stock list
  let stocks = getStockList();
  if (marketFilter && marketFilter !== 'all') {
    if (marketFilter === 'sh') stocks = stocks.filter((s) => s.market === 'SH');
    else if (marketFilter === 'sz') stocks = stocks.filter((s) => s.market === 'SZ');
    // hs300 handled later
  }
  job.progress.total = stocks.length;

  const results = new Map<string, ScreenerResult[]>();
  for (const sid of job.strategyIds) {
    results.set(sid, []);
    job.results.set(sid, []);
  }

  // Dynamic concurrency using simple semaphore
  let concurrency = 20;
  let consecutiveTimeouts = 0;
  let consecutiveSuccesses = 0;
  let activeRequests = 0;
  const pending: Array<() => void> = [];

  function releaseSlot() {
    activeRequests--;
    const next = pending.shift();
    if (next) {
      activeRequests++;
      next();
    }
  }

  function acquireSlot(): Promise<void> {
    if (activeRequests < concurrency) {
      activeRequests++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      pending.push(resolve);
    });
  }

  function adjustConcurrency(timedOut: boolean) {
    if (timedOut) {
      consecutiveTimeouts++;
      consecutiveSuccesses = 0;
      if (consecutiveTimeouts >= 5 && concurrency > 5) {
        concurrency = Math.max(5, concurrency === 20 ? 10 : 5);
        consecutiveTimeouts = 0;
        console.log(`[SCREENER] Concurrency reduced to ${concurrency}`);
      }
    } else {
      consecutiveSuccesses++;
      consecutiveTimeouts = 0;
      if (consecutiveSuccesses >= 50 && concurrency < 20) {
        concurrency = Math.min(20, concurrency === 5 ? 10 : 20);
        consecutiveSuccesses = 0;
        console.log(`[SCREENER] Concurrency recovered to ${concurrency}`);
      }
    }
  }

  const promises: Promise<void>[] = [];

  for (const stock of stocks) {
    if (signal.aborted) break;

    const p = (async () => {
      await acquireSlot();
      if (signal.aborted) { releaseSlot(); return; }

      try {
        // Phase 1: pre-filter with realtime data
        let market: { name: string; price: number; change: number; turnover: number; volume: number; high: number; low: number; open: number; preClose: number };
        try {
          market = await fetchRealtime(stock.code);
        } catch {
          adjustConcurrency(true);
          job.progress.scanned++;
          return;
        }

        if (!prefilterStock(market)) {
          adjustConcurrency(false);
          job.progress.scanned++;
          return;
        }

        // Phase 2: K-line + factor scoring
        let klines: any[];
        try {
          klines = await fetchKLine(stock.code, 60, signal);
        } catch {
          adjustConcurrency(true);
          job.progress.scanned++;
          return;
        }

        if (klines.length < 20) {
          adjustConcurrency(false);
          job.progress.scanned++;
          return;
        }

        adjustConcurrency(false);

        // Score against each strategy
        for (const sid of job.strategyIds) {
          const strategy = getStrategy(sid);
          if (!strategy) continue;

          const { score, triggered } = scoreStock(klines, market, strategy);
          if (score >= strategy.minScore) {
            const result: ScreenerResult = {
              code: stock.code,
              name: market.name,
              market: stock.market,
              price: market.price,
              change: market.change,
              open: market.open,
              high: market.high,
              low: market.low,
              preClose: market.preClose,
              volume: market.volume,
              turnover: market.turnover,
              score,
              triggeredFactors: triggered,
              klineSnapshot: klines.slice(-20).map((k: any) => k.close),
            };
            results.get(sid)!.push(result);
          }
        }
      } finally {
        job.progress.scanned++;
        releaseSlot();
      }
    })();

    promises.push(p);
  }

  await Promise.allSettled(promises);

  if (signal.aborted) return;

  // Sort and trim top 50 per strategy
  for (const sid of job.strategyIds) {
    const strategyResults = results.get(sid) ?? [];
    strategyResults.sort((a, b) => b.score - a.score);
    job.results.set(sid, strategyResults.slice(0, 50));
  }

  job.status = 'done';
  const totalResults = Array.from(job.results.values()).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`[SCREENER:DONE] job=${job.id} results=${totalResults} duration=${((Date.now() - job.startedAt) / 1000).toFixed(1)}s`);
}
