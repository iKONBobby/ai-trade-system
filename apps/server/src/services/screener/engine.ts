import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScreenerResult, Strategy, TriggeredFactor, StockListItem, ScanSnapshot } from '@trade/shared';
import { isGEM, isSTAR } from '@trade/shared';
import type { ScanningJob } from './types.js';
import { getStrategy } from './strategies.js';
import { getFactor } from './factors.js';
import { fetchRealtime, fetchKLine } from '../market.js';
import { getPersistence } from '../persistence-container.js';
import { JsonStore } from '../storage/json-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STOCKS_CACHE_PATH = path.resolve(__dirname, '../../../data/stocks-cache.json');

export interface ScanBoardOpts {
  /** 包含创业板（300xxx）。默认 false。 */
  includeGEM?: boolean;
  /** 包含科创板（688xxx）。默认 false。 */
  includeSTAR?: boolean;
}

// Allow tests to inject a fake history sink without booting the full container.
type HistorySink = { append: (snap: ScanSnapshot) => Promise<void> };
let historySinkOverride: HistorySink | null = null;
export function __setHistorySinkForTest(sink: HistorySink | null): void {
  historySinkOverride = sink;
}

// ── Stock list cache ──────────────────────────────────────────────
//
// The A-share ticker list is near-static (a handful of IPOs/delistings per week),
// so we treat it as a long-lived cache rather than something to re-fetch each boot.
//
// Boot order (no network on the hot path):
//   1. Read data/stocks-cache.json — the last successful EastMoney snapshot.
//   2. If absent/empty, fall back to the bundled src/data/stocks.json seed (100 stocks).
//   3. Mark loaded; the server can start handling requests immediately.
//   4. Kick off a background refresh — on success, replace memory cache + persist to disk.
//   5. Schedule hourly background refresh; failures are silent (keep prior cache).

let stockListCache: StockListItem[] = [];
let stockListLoaded = false;

interface StockCacheFile {
  /** Unix ms of the last successful EastMoney fetch. 0 means "never". */
  fetchedAt: number;
  stocks: StockListItem[];
}

interface StockCacheStore {
  read(): Promise<StockCacheFile>;
  update(fn: (data: StockCacheFile) => StockCacheFile): Promise<StockCacheFile>;
}

let stockCacheStore: StockCacheStore = new JsonStore<StockCacheFile>(STOCKS_CACHE_PATH, { fetchedAt: 0, stocks: [] });

/** Test seam — inject an in-memory store so unit tests don't touch the real disk. */
export function __setStockCacheStoreForTest(store: StockCacheStore | null): void {
  stockCacheStore = store ?? new JsonStore<StockCacheFile>(STOCKS_CACHE_PATH, { fetchedAt: 0, stocks: [] });
}

/** Test seam — reset module state so initStockList() can be exercised more than once. */
export function __resetStockListForTest(): void {
  stockListCache = [];
  stockListLoaded = false;
}

// EastMoney clist API caps each page at 100 rows server-side regardless of pz.
// We paginate until cumulative count reaches data.total (or pages run out).
const EM_PAGE_SIZE = 100;
const EM_MAX_PAGES = 80; // safety net: 80 * 100 = 8000 > current A-share total ~5500
const EM_PAGE_TIMEOUT_MS = 10000;

// EastMoney serves the clist API on both the apex host and many numbered shard
// subdomains (N.push2.eastmoney.com). When the apex returns 502 / empty replies
// (observed in prod), individual shards may still answer. We try a randomized
// pool per page and remember the last good host to short-circuit subsequent pages.
const EM_HOSTS: readonly string[] = [
  'push2.eastmoney.com',
  '1.push2.eastmoney.com',
  '5.push2.eastmoney.com',
  '22.push2.eastmoney.com',
  '29.push2.eastmoney.com',
  '48.push2.eastmoney.com',
  '76.push2.eastmoney.com',
  '82.push2.eastmoney.com',
  '90.push2.eastmoney.com',
  '99.push2.eastmoney.com',
];

const EM_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://quote.eastmoney.com/',
};

let lastGoodHost: string | null = null;

function shuffled<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface ClistResponse {
  data?: {
    total?: number;
    diff?: Array<{ f12: string; f14: string }>;
  };
}

// Exposed for tests so they can stub one page without monkey-patching global fetch.
let clistFetcher: (pn: number, pz: number) => Promise<ClistResponse> = defaultClistFetch;
export function __setClistFetcherForTest(fn: ((pn: number, pz: number) => Promise<ClistResponse>) | null): void {
  clistFetcher = fn ?? defaultClistFetch;
}

async function defaultClistFetch(pn: number, pz: number): Promise<ClistResponse> {
  const path = `/api/qt/clist/get?pn=${pn}&pz=${pz}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14`;
  const order = lastGoodHost
    ? [lastGoodHost, ...shuffled(EM_HOSTS.filter((h) => h !== lastGoodHost))]
    : shuffled(EM_HOSTS);

  let lastErr: Error | null = null;
  for (const host of order) {
    try {
      const resp = await fetch(`https://${host}${path}`, {
        signal: AbortSignal.timeout(EM_PAGE_TIMEOUT_MS),
        headers: EM_HEADERS,
      });
      if (!resp.ok) {
        lastErr = new Error(`EastMoney clist HTTP ${resp.status} via ${host} (pn=${pn})`);
        continue;
      }
      const json = (await resp.json()) as ClistResponse;
      lastGoodHost = host;
      return json;
    } catch (err) {
      lastErr = err as Error;
    }
  }
  lastGoodHost = null;
  throw lastErr ?? new Error(`EastMoney clist: all ${EM_HOSTS.length} hosts failed (pn=${pn})`);
}

async function fetchStockListFromEastMoney(): Promise<StockListItem[]> {
  const accum: StockListItem[] = [];
  const seen = new Set<string>();
  let total: number | null = null;

  for (let pn = 1; pn <= EM_MAX_PAGES; pn++) {
    const json = await clistFetcher(pn, EM_PAGE_SIZE);
    const data = json.data ?? {};
    const diff = data.diff ?? [];
    if (total === null && typeof data.total === 'number') total = data.total;

    if (diff.length === 0) break;

    for (const item of diff) {
      if (!/^\d{6}$/.test(item.f12) || seen.has(item.f12)) continue;
      seen.add(item.f12);
      accum.push({
        code: item.f12,
        name: item.f14,
        market: item.f12.startsWith('6') ? 'SH' : 'SZ',
      });
    }

    // Stop when we've collected all the server says exists, or when a page comes back short.
    if (total !== null && accum.length >= total) break;
    if (diff.length < EM_PAGE_SIZE) break;
  }

  // Sanity check: A-share market is ~5500 stocks. Anything under 4000 likely means
  // the upstream truncated mid-way or returned a degraded response — don't cache it.
  const MIN_EXPECTED = 4000;
  if (accum.length < MIN_EXPECTED) {
    throw new Error(`EastMoney clist returned only ${accum.length} stocks (total reported: ${total ?? 'unknown'}) — suspicious, refusing to cache`);
  }
  return accum;
}

async function tryFetchWithBackoff(): Promise<StockListItem[] | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const list = await fetchStockListFromEastMoney();
      console.log(`[SCREENER] Stock list fetched on attempt ${attempt}: ${list.length} stocks`);
      return list;
    } catch (err) {
      console.warn(`[SCREENER] fetch attempt ${attempt}/3 failed: ${(err as Error).message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return null;
}

async function loadBundledFallback(): Promise<StockListItem[]> {
  try {
    const { default: bundled } = await import('../../data/stocks.json', { with: { type: 'json' } });
    return bundled as StockListItem[];
  } catch {
    return [];
  }
}

async function persistSnapshot(list: StockListItem[]): Promise<void> {
  try {
    await stockCacheStore.update(() => ({ fetchedAt: Date.now(), stocks: list }));
  } catch (err) {
    // Non-fatal: in-memory cache is still updated; we'll try again on next refresh.
    console.warn(`[SCREENER] Failed to persist stock cache to disk: ${(err as Error).message}`);
  }
}

/** Pull from EastMoney; on success, replace memory cache and persist to disk. */
async function backgroundRefresh(): Promise<void> {
  const list = await tryFetchWithBackoff();
  if (!list) return; // upstream unreachable — keep prior cache
  stockListCache = list;
  await persistSnapshot(list);
  console.log(`[SCREENER] Stock list refreshed: ${list.length} stocks (persisted to disk)`);
}

export async function initStockList(): Promise<void> {
  if (stockListLoaded) return;

  // Hot path: disk-only, no network. Boot should be ~instant.
  const cached = await stockCacheStore.read();
  if (cached.stocks.length > 0) {
    stockListCache = cached.stocks;
    const ageDays = cached.fetchedAt ? ((Date.now() - cached.fetchedAt) / 86400000).toFixed(1) : '?';
    console.log(`[SCREENER] Stock list loaded from disk cache: ${stockListCache.length} stocks (age ${ageDays}d)`);
  } else {
    stockListCache = await loadBundledFallback();
    if (stockListCache.length > 0) {
      console.log(`[SCREENER] Stock list loaded from bundled fallback: ${stockListCache.length} stocks (will refresh in background)`);
    } else {
      console.error('[SCREENER] No disk cache and bundled fallback failed — cache empty; will retry from EastMoney in background');
    }
  }
  stockListLoaded = true;

  // Background refresh — does not block the caller. If EastMoney is up we'll have
  // fresh data in seconds; if it's down we stay on the cached/bundled snapshot.
  void backgroundRefresh();

  // Hourly refresh (keeps the snapshot current without ever blocking requests).
  setInterval(() => { void backgroundRefresh(); }, 3600000);
}

/** Manual refresh — useful when initial fetch failed (e.g., DNS issues at server start). */
export async function refreshStockList(): Promise<{ ok: boolean; count: number; message?: string }> {
  const list = await tryFetchWithBackoff();
  if (list) {
    stockListCache = list;
    await persistSnapshot(list);
    return { ok: true, count: list.length };
  }
  return { ok: false, count: stockListCache.length, message: 'eastmoney unreachable after 3 attempts' };
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

export async function runScreener(
  strategyIds: string[],
  marketFilter?: string,
  boards: ScanBoardOpts = {},
): Promise<string[]> {
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
  runScan(job, marketFilter, boards).catch((err) => {
    if (job.status !== 'cancelled') {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[SCREENER:ERROR] job=${jobId}`, err);
    }
  });

  return [jobId];
}

/** Filter the stock list to keep only main-board codes unless GEM/STAR explicitly included. */
export function filterByBoards(stocks: StockListItem[], opts: ScanBoardOpts): StockListItem[] {
  const { includeGEM = false, includeSTAR = false } = opts;
  if (includeGEM && includeSTAR) return stocks;
  return stocks.filter((s) => {
    if (!includeGEM && isGEM(s.code)) return false;
    if (!includeSTAR && isSTAR(s.code)) return false;
    return true;
  });
}

const ALLOWED_FILTERS: ScanSnapshot['marketFilter'][] = ['all', 'sh', 'sz', 'hs300'];

function normalizeFilter(filter: string | undefined): ScanSnapshot['marketFilter'] {
  if (filter && (ALLOWED_FILTERS as string[]).includes(filter)) return filter as ScanSnapshot['marketFilter'];
  return 'all';
}

async function recordSnapshot(job: ScanningJob, marketFilter: string | undefined): Promise<void> {
  const sink: HistorySink = historySinkOverride ?? getPersistence().history;
  const completedAt = new Date();
  const snapshot: ScanSnapshot = {
    id: job.id,
    date: completedAt.toISOString().slice(0, 10),
    timestamp: completedAt.toISOString(),
    strategyIds: job.strategyIds,
    marketFilter: normalizeFilter(marketFilter),
    durationMs: Date.now() - job.startedAt,
    results: Object.fromEntries(job.results),
  };
  try {
    await sink.append(snapshot);
    console.log(`[HISTORY:WRITE] id=${snapshot.id} results=${Object.values(snapshot.results).reduce((s, a) => s + a.length, 0)}`);
  } catch (err) {
    // best-effort: NEVER throw; failure must not affect API response
    console.error(`[HISTORY:WRITE_FAIL] id=${snapshot.id}`, err);
  }
}

/** Test-only helper: drive recordSnapshot with a fabricated job. */
export async function __recordSnapshotForTest(opts: {
  marketFilter?: string;
  strategyIds?: string[];
  resultsMap?: Map<string, ScreenerResult[]>;
}): Promise<void> {
  const fakeJob: ScanningJob = {
    id: `job_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    strategyIds: opts.strategyIds ?? ['ma_bullish'],
    status: 'done',
    progress: { scanned: 0, total: 0 },
    results: opts.resultsMap ?? new Map(),
    startedAt: Date.now() - 1000,
    abortController: new AbortController(),
  };
  await recordSnapshot(fakeJob, opts.marketFilter);
}

async function runScan(job: ScanningJob, marketFilter?: string, boards: ScanBoardOpts = {}): Promise<void> {
  const signal = job.abortController.signal;
  console.log(`[SCREENER:START] job=${job.id} strategies=${job.strategyIds.join(',')} boards=${JSON.stringify(boards)}`);

  // Get stock list
  let stocks = getStockList();
  // Default: exclude 创业板(300xxx) + 科创板(688xxx). User must explicitly opt in via includeGEM/includeSTAR.
  stocks = filterByBoards(stocks, boards);
  if (marketFilter && marketFilter !== 'all') {
    if (marketFilter === 'sh') stocks = stocks.filter((s) => s.market === 'SH');
    else if (marketFilter === 'sz') stocks = stocks.filter((s) => s.market === 'SZ');
    // hs300 handled later
  }
  job.progress.total = stocks.length;
  console.log(`[SCREENER] runScan: ${stocks.length} stocks after filter (cache=${getStockList().length}, marketFilter=${marketFilter ?? 'all'}, boards=${JSON.stringify(boards)})`);

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
          return; // finally still runs and increments scanned exactly once
        }

        if (!prefilterStock(market)) {
          adjustConcurrency(false);
          return;
        }

        // Phase 2: K-line + factor scoring
        let klines: any[];
        try {
          klines = await fetchKLine(stock.code, 60, signal);
        } catch {
          adjustConcurrency(true);
          return;
        }

        if (klines.length < 20) {
          adjustConcurrency(false);
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

  // ENG-D3: persistence is best-effort, isolated from job lifecycle
  void recordSnapshot(job, marketFilter);
}
