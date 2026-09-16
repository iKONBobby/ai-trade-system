import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketData, RealtimeSourcePreference, ScreenerResult, Strategy, TriggeredFactor, StockListItem, ScanSnapshot } from '@trade/shared';
import { isGEM, isSTAR } from '@trade/shared';
import type { FactorContext, ScanningJob } from './types.js';
import { getStrategy } from './strategies.js';
import { getFactor, isAtUpperLimit } from './factors.js';
import { reviewScreenerCandidates } from './ai-reviewer.js';
import { fetchRealtimeFromSource, fetchRealtimeBatchFromSource, fetchKLine } from '../market.js';
import { getPersistence } from '../persistence-container.js';
import { JsonStore } from '../storage/json-store.js';
import { prepareTushareMarketHistory } from '../tushare-market.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STOCKS_CACHE_PATH = path.resolve(__dirname, '../../../data/stocks-cache.json');

export interface ScanBoardOpts {
  /** 包含创业板（300xxx）。默认 false。 */
  includeGEM?: boolean;
  /** 包含科创板（688xxx）。默认 false。 */
  includeSTAR?: boolean;
  /** AI re-ranks the top 20 quantitative candidates for each strategy. */
  useAIReview?: boolean;
  /** Free realtime provider selection. */
  realtimeSource?: RealtimeSourcePreference;
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

function isAtLowerLimit(market: Pick<MarketData, 'code' | 'price' | 'preClose'>): boolean {
  if (market.preClose <= 0) return false;
  const limitPct = isGEM(market.code) || isSTAR(market.code) ? 20 : 10;
  const limitPrice = Math.round(market.preClose * (1 - limitPct / 100) * 100) / 100;
  return market.price <= limitPrice + 0.005;
}

function prefilterStock(market: MarketData): boolean {
  if (ST_PATTERN.test(market.name)) return false; // ST / *ST / 新股
  if (isAtLowerLimit(market)) return false;
  if (market.turnoverAvailable !== false && market.turnover < 0.5) return false; // 换手率太低
  return true;
}

// ── Scoring ───────────────────────────────────────────────────────

interface FactorCondition {
  factorId: string;
  operator: string;
  value: string | number;
  weight: number;
}

function evaluateCondition(condition: FactorCondition, klines: { close: number; high: number; low: number; open: number; volume: number; date: string }[], market: MarketData, context?: FactorContext): { passed: boolean; actualValue: number | string | null } {
  const factor = getFactor(condition.factorId);
  if (!factor) return { passed: false, actualValue: null };

  const result = factor.compute(klines as any, market, context);

  if (result === null) return { passed: false, actualValue: null };

  const { operator, value: configValue } = condition;

  if (typeof result === 'string') {
    if (operator === 'eq') return { passed: result === configValue, actualValue: result };
    if (operator === 'neq') return { passed: result !== configValue, actualValue: result };
    return { passed: false, actualValue: result };
  }

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

function scoreStock(klines: any[], market: MarketData, strategy: Strategy, context?: FactorContext): { score: number; triggered: TriggeredFactor[] } {
  let totalScore = 0;
  const triggered: TriggeredFactor[] = [];

  for (const cond of strategy.factors) {
    const { passed, actualValue } = evaluateCondition(cond, klines, market, context);
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

interface ScannableStock {
  stock: StockListItem;
  market: MarketData;
  klines: import('@trade/shared').KLine[];
}

export function __percentileRanksForTest(values: Array<{ code: string; value: number }>): Map<string, number> {
  const sorted = values.slice().sort((a, b) => a.value - b.value);
  const ranks = new Map<string, number>();
  if (sorted.length === 1) {
    ranks.set(sorted[0].code, 100);
    return ranks;
  }

  for (let start = 0; start < sorted.length;) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1].value === sorted[start].value) end++;
    const percentile = (((start + end) / 2) / (sorted.length - 1)) * 100;
    for (let index = start; index <= end; index++) ranks.set(sorted[index].code, percentile);
    start = end + 1;
  }
  return ranks;
}

function buildFactorContext(candidates: ScannableStock[]): FactorContext {
  const crossSectionRanks = new Map<string, Map<string, number>>();
  for (const factorId of ['return_20d', 'return_60d']) {
    const factor = getFactor(factorId);
    if (!factor) continue;
    const values = candidates.flatMap(({ market, klines }) => {
      const value = factor.compute(klines, market);
      return typeof value === 'number' && Number.isFinite(value) ? [{ code: market.code, value }] : [];
    });
    crossSectionRanks.set(factorId, __percentileRanksForTest(values));
  }
  return { crossSectionRanks };
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
    progress: { scanned: 0, total: 0, failed: 0 },
    results: new Map(),
    startedAt: Date.now(),
    abortController: new AbortController(),
    phase: 'scanning',
    useAIReview: boards.useAIReview === true,
    aiReviewStatus: boards.useAIReview ? 'running' : 'not_requested',
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
    aiReviewStatus: job.aiReviewStatus === 'running' ? 'not_requested' : job.aiReviewStatus,
    aiReviewError: job.aiReviewError,
    aiReviewedAt: job.aiReviewedAt,
  };
  try {
    await sink.append(snapshot);
    console.log(`[HISTORY:WRITE] id=${snapshot.id} results=${Object.values(snapshot.results).reduce((s, a) => s + a.length, 0)}`);
  } catch (err) {
    // best-effort: NEVER throw; failure must not affect API response
    console.error(`[HISTORY:WRITE_FAIL] id=${snapshot.id}`, err);
  }
}

async function performAIReview(job: ScanningJob): Promise<void> {
  const signal = job.abortController.signal;
  job.phase = 'ai_review';
  job.useAIReview = true;
  job.aiReviewStatus = 'running';
  job.aiReviewError = undefined;

  const outcomes = await Promise.all(job.strategyIds.map(async (sid): Promise<'success' | 'empty' | 'failed'> => {
    const strategy = getStrategy(sid);
    const current = job.results.get(sid) ?? [];
    if (!strategy || current.length === 0) return 'empty';

    const shortlist = current.slice(0, 20);
    const reviews = await reviewScreenerCandidates(strategy, shortlist, signal);
    if (!reviews) return 'failed';
    const byCode = new Map(reviews.map((review) => [review.code, review]));
    const reviewed = shortlist.map((candidate) => {
      const review = byCode.get(candidate.code);
      if (!review) return candidate;
      const quantScore = candidate.quantScore ?? candidate.score;
      return {
        ...candidate,
        quantScore,
        score: Math.round(quantScore * 0.75 + review.score * 0.25),
        aiReview: {
          score: Math.round(review.score),
          confidence: Math.round(review.confidence),
          thesis: review.thesis,
          risks: review.risks,
        },
      };
    });
    reviewed.sort((a, b) => b.score - a.score);
    job.results.set(sid, [...reviewed, ...current.slice(20)]);
    return 'success';
  }));

  if (signal.aborted) return;
  if (outcomes.some((outcome) => outcome === 'success') || outcomes.every((outcome) => outcome === 'empty')) {
    job.aiReviewStatus = 'done';
    job.aiReviewedAt = new Date().toISOString();
    if (outcomes.some((outcome) => outcome === 'failed')) job.aiReviewError = '部分策略未能完成 AI 复核，已保留其量化排序';
  } else {
    job.aiReviewStatus = 'unavailable';
    job.aiReviewError = process.env.LLM_API_KEY
      ? 'AI 复核暂时不可用，已保留量化排序'
      : 'LLM_API_KEY 未配置，已保留量化排序';
  }
}

const manualReviewLocks = new Set<string>();

/** Add AI review to a completed current or archived scan and persist the result. */
export async function reviewScanSnapshot(snapshotId: string): Promise<ScanSnapshot | null> {
  if (manualReviewLocks.has(snapshotId)) throw new Error('AI_REVIEW_RUNNING');
  const history = getPersistence().history;
  const liveJob = jobs.get(snapshotId);
  const stored = await history.get(snapshotId);
  if (!liveJob && !stored) return null;
  if (liveJob && liveJob.status !== 'done') throw new Error('SCAN_NOT_COMPLETED');

  const alreadyReviewed = liveJob
    ? liveJob.aiReviewStatus === 'done'
    : stored?.aiReviewStatus === 'done' || Object.values(stored?.results ?? {}).some((items) => items.some((item) => item.aiReview));
  if (alreadyReviewed && stored) return stored;

  const job: ScanningJob = liveJob ?? {
    id: stored!.id,
    strategyIds: stored!.strategyIds,
    status: 'done',
    progress: { scanned: 0, total: 0, failed: 0 },
    results: new Map(Object.entries(stored!.results)),
    startedAt: new Date(stored!.timestamp).getTime(),
    abortController: new AbortController(),
    phase: 'ai_review',
    useAIReview: true,
    aiReviewStatus: stored!.aiReviewStatus ?? 'not_requested',
    aiReviewError: stored!.aiReviewError,
    aiReviewedAt: stored!.aiReviewedAt,
  };

  manualReviewLocks.add(snapshotId);
  try {
    await performAIReview(job);
    const base = stored ?? {
      id: job.id,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      strategyIds: job.strategyIds,
      marketFilter: 'all' as const,
      durationMs: Date.now() - job.startedAt,
      results: {},
    };
    const reviewed: ScanSnapshot = {
      ...base,
      results: Object.fromEntries(job.results),
      aiReviewStatus: job.aiReviewStatus === 'running' ? 'unavailable' : job.aiReviewStatus,
      aiReviewError: job.aiReviewError,
      aiReviewedAt: job.aiReviewedAt,
    };
    await history.append(reviewed);
    return reviewed;
  } finally {
    manualReviewLocks.delete(snapshotId);
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
    progress: { scanned: 0, total: 0, failed: 0 },
    results: opts.resultsMap ?? new Map(),
    startedAt: Date.now() - 1000,
    abortController: new AbortController(),
    phase: 'scanning',
    useAIReview: false,
    aiReviewStatus: 'not_requested',
  };
  await recordSnapshot(fakeJob, opts.marketFilter);
}

async function runScan(job: ScanningJob, marketFilter?: string, boards: ScanBoardOpts = {}): Promise<void> {
  const signal = job.abortController.signal;
  const selectedStrategies = job.strategyIds.flatMap((id) => {
    const strategy = getStrategy(id);
    return strategy ? [strategy] : [];
  });
  const lookbackDays = Math.max(60, ...selectedStrategies.map((strategy) => strategy.lookbackDays ?? 60));
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

  // Tushare's free daily API is most efficient by trade_date: each request
  // returns the full market and is cached as a date shard for future scans.
  let tushareHistories: Map<string, import('@trade/shared').KLine[]> | null = null;
  try {
    job.phase = 'market_sync';
    tushareHistories = await prepareTushareMarketHistory(lookbackDays, signal);
    if (tushareHistories) console.log(`[SCREENER] Tushare history ready: ${tushareHistories.size} stocks`);
  } catch (error) {
    if (signal.aborted) return;
    console.warn(`[SCREENER] Tushare history unavailable; using EastMoney fallback: ${(error as Error).message}`);
  }
  job.phase = 'scanning';

  // One paged full-market snapshot replaces thousands of per-stock realtime
  // calls. Missing rows still fall back to the legacy single-stock endpoint.
  let realtimeSnapshot = new Map<string, MarketData>();
  try {
    realtimeSnapshot = await fetchRealtimeBatchFromSource(stocks.map((stock) => stock.code), boards.realtimeSource ?? 'auto', {
      retries: 2,
      timeoutMs: 8000,
      signal,
    });
    console.log(`[SCREENER] Realtime batch loaded: ${realtimeSnapshot.size}/${stocks.length}`);
  } catch (error) {
    if (signal.aborted) return;
    console.warn(`[SCREENER] Realtime batch unavailable; using per-stock fallback: ${(error as Error).message}`);
  }

  const results = new Map<string, ScreenerResult[]>();
  for (const sid of job.strategyIds) {
    results.set(sid, []);
    job.results.set(sid, []);
  }
  const candidates: ScannableStock[] = [];

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
        let market: MarketData;
        try {
          market = realtimeSnapshot.get(stock.code) ?? await fetchRealtimeFromSource(
            stock.code,
            boards.realtimeSource ?? 'auto',
            { retries: 1, timeoutMs: 6000, signal },
          );
          if (!market.name) market = { ...market, name: stock.name };
        } catch {
          job.progress.failed++;
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
          const cachedHistory = tushareHistories?.get(stock.code);
          klines = cachedHistory && cachedHistory.length >= Math.min(20, lookbackDays)
            ? cachedHistory.slice(-lookbackDays)
            : await fetchKLine(stock.code, lookbackDays, {
              signal,
              skipTushare: true,
              skipBaoStock: true,
              skipHithink: true,
            });
        } catch {
          job.progress.failed++;
          adjustConcurrency(true);
          return;
        }

        if (klines.length < 20) {
          job.progress.failed++;
          adjustConcurrency(false);
          return;
        }

        adjustConcurrency(false);

        candidates.push({ stock, market, klines });
      } finally {
        job.progress.scanned++;
        releaseSlot();
      }
    })();

    promises.push(p);
  }

  await Promise.allSettled(promises);

  if (signal.aborted) return;

  const factorContext = buildFactorContext(candidates);
  for (const { stock, market, klines } of candidates) {
    for (const sid of job.strategyIds) {
      const strategy = getStrategy(sid);
      if (!strategy) continue;
      if (isAtUpperLimit(market) && !strategy.includeLimitUp) continue;

      const { score, triggered } = scoreStock(klines, market, strategy, factorContext);
      if (score >= strategy.minScore) {
        results.get(sid)!.push({
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
          turnoverAvailable: market.turnoverAvailable,
          turnoverAmount: market.turnoverAmount,
          score,
          triggeredFactors: triggered,
          klineSnapshot: klines.slice(-20).map((kline) => kline.close),
        });
      }
    }
  }

  // Sort and trim top 50 per strategy
  for (const sid of job.strategyIds) {
    const strategyResults = results.get(sid) ?? [];
    strategyResults.sort((a, b) => b.score - a.score);
    job.results.set(sid, strategyResults.slice(0, 50));
  }

  if (job.useAIReview && !signal.aborted) await performAIReview(job);

  const totalResults = Array.from(job.results.values()).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`[SCREENER:DONE] job=${job.id} results=${totalResults} duration=${((Date.now() - job.startedAt) / 1000).toFixed(1)}s`);

  // Persist before exposing done so a post-scan review can immediately update it.
  await recordSnapshot(job, marketFilter);
  job.status = 'done';
}
