import { protectedRequest, CircuitOpenError, marketLog, marketDelay, checkCancelled, resetMarketResilience } from './market-resilience.js';
import type { MarketData, KLine, StockSearchItem, MarketIndex, RealtimeSourcePreference } from '@trade/shared';
import { fetchTushareDaily } from './tushare-market.js';
import { fetchBaoStockDaily } from './baostock-market.js';
import {
  __resetHithinkStateForTest,
  fetchHithinkDaily,
  fetchHithinkRealtime as fetchOfficialRealtime,
  fetchHithinkRealtimeBatch as fetchOfficialRealtimeBatch,
  hasHithinkApiKey,
  HithinkApiError,
} from './hithink-market.js';

/**
 * Convert A-share stock code to EastMoney market code.
 * 6xxxxx -> SH (1.xxxxxx), others -> SZ (0.xxxxxx)
 */
function getMarketCode(code: string): string {
  return code.startsWith('6') ? `1.${code}` : `0.${code}`;
}

/**
 * Network error class — thrown when the upstream API is unreachable (timeout,
 * DNS, connection refused, 5xx). Distinct from STOCK_NOT_FOUND (which is a
 * client-input problem). Callers can use this to surface a friendly message.
 */
export class UpstreamUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'UpstreamUnavailableError';
  }
}

interface FetchWithRetryOpts {
  rateLimit?: boolean;
  /** Number of retry attempts on network failure (default 0). */
  retries?: number;
  /** Per-attempt timeout in ms (default 10000). */
  timeoutMs?: number;
  /** External cancellation signal — if aborted, no retry. */
  signal?: AbortSignal;
}

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cause = (err as { cause?: { code?: string } }).cause;
  const code = cause?.code;
  const retryableCodes = new Set([
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
  ]);
  return code !== undefined && retryableCodes.has(code);
}

/**
 * Fetch wrapper with explicit per-attempt timeout and retry-with-backoff
 * on transient network failures, 429 and 5xx. Never retries on other 4xx, user-cancellation,
 * or on STOCK_NOT_FOUND parsing — those are caller-decoded.
 *
 *   attempt 1 ──fail──▶ wait 500ms ──▶ attempt 2 ──fail──▶ wait 1500ms ──▶ attempt 3
 *      │ ok                              │ ok                                 │ ok / final fail
 *      ▼                                 ▼                                    ▼
 *   return                            return                                throw
 */
async function fetchWithRetry(url: string, opts: FetchWithRetryOpts = {}): Promise<Response> {
  const { retries = 0, timeoutMs = 10000, signal: externalSignal } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (externalSignal?.aborted) {
      throw new DOMException('Request cancelled by caller', 'AbortError');
    }

    let perAttemptTimeout: AbortSignal | undefined;

    try {
      const res = await protectedRequest(new URL(url).host, externalSignal, async () => {
        perAttemptTimeout = AbortSignal.timeout(timeoutMs);
        const combinedSignal = externalSignal
          ? AbortSignal.any([externalSignal, perAttemptTimeout]) : perAttemptTimeout;
        const response = await fetch(url, { signal: combinedSignal });
        if (response.status === 429 || response.status >= 500) {
          await response.body?.cancel();
          throw Object.assign(new UpstreamUnavailableError(`Upstream HTTP ${response.status}`), { status: response.status });
        }
        // Consume the body inside the timeout/circuit scope, not just the headers.
        const body = await response.arrayBuffer();
        return new Response(body, { status: response.status, headers: response.headers });
      }, opts.rateLimit);
      return res;
    } catch (err: unknown) {
      lastErr = err;
      // user-initiated abort: do not retry
      if (externalSignal?.aborted) throw err;
      // not a retryable transport error: bail immediately
      if (err instanceof CircuitOpenError) throw new UpstreamUnavailableError(err.message, err);
      if (!(err instanceof UpstreamUnavailableError) && !isRetryableNetworkError(err) && !(perAttemptTimeout && isTimeoutAbort(err, perAttemptTimeout))) {
        throw err;
      }
    }

    if (attempt < retries) {
      // 500ms, 1500ms, 4500ms ...
      const backoffMs = 500 * Math.pow(3, attempt);
      await marketDelay(backoffMs, externalSignal);
    }
  }

  throw new UpstreamUnavailableError(
    `Failed to reach ${new URL(url).host} after ${retries + 1} attempt(s)`,
    lastErr,
  );
}

function isTimeoutAbort(err: unknown, timeoutSignal: AbortSignal): boolean {
  return err instanceof Error &&
    (err.name === 'AbortError' || err.name === 'TimeoutError') && timeoutSignal.aborted;
}

interface EastMoneySearchResponse {
  QuotationCodeTable?: {
    Data?: Array<{
      Code: string;
      Name: string;
      Market: string; // "1" = SH, "0" = SZ
    }>;
  };
}

/**
 * Search stocks by keyword (code or name) using EastMoney suggest API.
 */
export async function searchStocks(keyword: string): Promise<StockSearchItem[]> {
  const url = `https://searchadapter.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8`;

  const res = await fetchWithRetry(url, { retries: 1, timeoutMs: 8000 });
  if (!res.ok) {
    throw new Error(`EastMoney search API error: ${res.status}`);
  }

  const json: EastMoneySearchResponse = await res.json();
  const data = json.QuotationCodeTable?.Data ?? [];

  return data
    .filter(item => /^\d{6}$/.test(item.Code))
    .map(item => ({
      code: item.Code,
      name: item.Name,
      market: (item.Market === '1' ? 'SH' : 'SZ') as 'SH' | 'SZ',
    }));
}

interface EastMoneyRealtimeResponse {
  data?: {
    f43: number | null;  // price * 100
    f44: number | null;  // high * 100
    f45: number | null;  // low * 100
    f46: number | null;  // open * 100
    f47: number | null;  // volume
    f58: string | null;  // name
    f60: number | null;  // preClose * 100
    f168: number | null; // turnover * 100
    f170: number | null; // change * 100
  } | null;
}

import type { KlinePeriod } from '@trade/shared';
import { KLINE_PERIOD_TO_KLT } from '@trade/shared';

export interface FetchOpts {
  /** Apply process-wide scan request pacing. */
  rateLimit?: boolean;
  /** Number of retries on network failure. Default 0 (no retry, for high-volume scanner). */
  retries?: number;
  /** Per-attempt timeout. Default 10s. */
  timeoutMs?: number;
  /** Cancellation signal. */
  signal?: AbortSignal;
}

export interface KLineFetchOpts extends FetchOpts {
  /** K-line period. Default 'daily' (klt=101). */
  period?: KlinePeriod;
  /** Skip Tushare and force the existing EastMoney path (scanner fallback). */
  skipTushare?: boolean;
  /** Avoid process-per-stock BaoStock fallback during a full-market scan. */
  skipBaoStock?: boolean;
  /** Avoid one authenticated HiThink request per stock during a full-market scan. */
  skipHithink?: boolean;
}

/**
 * Fetch realtime market data for a given stock code.
 * Throws 'STOCK_NOT_FOUND' if the stock is not found or no data returned.
 * Throws UpstreamUnavailableError if eastmoney is unreachable after retries.
 */
export async function fetchRealtime(code: string, opts: FetchOpts = {}): Promise<MarketData> {
  const marketCode = getMarketCode(code);
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${marketCode}&fields=f43,f44,f45,f46,f47,f48,f50,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170,f171`;

  const res = await fetchWithRetry(url, opts);
  if (!res.ok) {
    throw new Error(`EastMoney API error: ${res.status}`);
  }

  const json: EastMoneyRealtimeResponse = await res.json();

  if (!json.data || json.data.f43 == null || json.data.f43 === 0) {
    throw new Error('STOCK_NOT_FOUND');
  }

  const d = json.data;

  return {
    code,
    name: d.f58 ?? '',
    price: (d.f43 ?? 0) / 100,
    change: (d.f170 ?? 0) / 100,
    volume: d.f47 ?? 0,
    turnover: (d.f168 ?? 0) / 100,
    open: (d.f46 ?? 0) / 100,
    high: (d.f44 ?? 0) / 100,
    low: (d.f45 ?? 0) / 100,
    preClose: (d.f60 ?? 0) / 100,
    source: 'eastmoney',
  };
}

function tencentMarketCode(code: string): string {
  return `${code.startsWith('6') ? 'sh' : 'sz'}${code}`;
}

function parseTencentText(text: string): Map<string, MarketData> {
  const result = new Map<string, MarketData>();
  for (const row of text.split(';')) {
    const match = row.match(/v_(?:sh|sz)(\d{6})="([^"]*)"/);
    if (!match) continue;
    const code = match[1];
    const fields = match[2].split('~');
    const price = quoteNumber(fields[3]);
    if (price <= 0) continue;
    result.set(code, {
      code,
      name: fields[1] ?? '',
      price,
      change: quoteNumber(fields[32]),
      volume: quoteNumber(fields[6]),
      turnover: quoteNumber(fields[38]),
      open: quoteNumber(fields[5]),
      high: quoteNumber(fields[33]),
      low: quoteNumber(fields[34]),
      preClose: quoteNumber(fields[4]),
      source: 'tencent',
    });
  }
  return result;
}

async function fetchTencentChunk(codes: readonly string[], opts: FetchOpts): Promise<Map<string, MarketData>> {
  const query = codes.map(tencentMarketCode).join(',');
  const response = await fetchWithRetry(`https://qt.gtimg.cn/q=${query}`, opts);
  if (!response.ok) throw new Error(`Tencent quote API error: ${response.status}`);
  const bytes = await response.arrayBuffer();
  return parseTencentText(new TextDecoder('gbk').decode(bytes));
}

export async function fetchRealtimeTencent(code: string, opts: FetchOpts = {}): Promise<MarketData> {
  const quotes = await fetchTencentChunk([code], opts);
  const quote = quotes.get(code);
  if (!quote) throw new Error('STOCK_NOT_FOUND');
  return quote;
}

export async function fetchRealtimeHithink(code: string, opts: FetchOpts = {}): Promise<MarketData> {
  try {
    return await fetchOfficialRealtime(code, opts);
  } catch (error) {
    if (error instanceof HithinkApiError && (error.message === 'STOCK_NOT_FOUND' || error.code === 3001)) {
      throw new Error('STOCK_NOT_FOUND');
    }
    throw new UpstreamUnavailableError('HiThink quote API is unavailable', error);
  }
}

/** Resolve one quote using the user's selected provider. */
export async function fetchRealtimeFromSource(
  code: string,
  source: RealtimeSourcePreference = 'auto',
  opts: FetchOpts = {},
): Promise<MarketData> {
  const providers = { eastmoney: fetchRealtime, tencent: fetchRealtimeTencent, hithink: fetchRealtimeHithink };
  if (source !== 'auto') return providers[source](code, opts);
  let lastError: unknown;
  for (const provider of ['eastmoney', 'tencent', 'hithink'] as const) {
    checkCancelled(opts.signal);
    if (provider === 'hithink' && !hasHithinkApiKey()) continue;
    const started = Date.now();
    const budget = AbortSignal.timeout(Math.min(opts.timeoutMs ?? 2500, 2500));
    try {
      const quote = await providers[provider](code, {
        ...opts, retries: 0, timeoutMs: Math.min(opts.timeoutMs ?? 2500, 2500),
        // HiThink retries internally; bound its entire operation too.
        signal: provider === 'hithink'
          ? (opts.signal ? AbortSignal.any([opts.signal, budget]) : budget) : opts.signal,
      });
      marketLog('quote_resolved', { provider, code, elapsedMs: Date.now() - started });
      return quote;
    } catch (error) {
      checkCancelled(opts.signal);
      lastError = error;
      marketLog('source_fallback', { provider, code, elapsedMs: Date.now() - started });
    }
  }
  throw lastError;

}

interface EastMoneyListQuote {
  f2?: number | string | null;
  f3?: number | string | null;
  f5?: number | string | null;
  f8?: number | string | null;
  f12?: string | null;
  f14?: string | null;
  f15?: number | string | null;
  f16?: number | string | null;
  f17?: number | string | null;
  f18?: number | string | null;
}

interface EastMoneyListResponse {
  data?: {
    total?: number;
    diff?: EastMoneyListQuote[] | Record<string, EastMoneyListQuote>;
  } | null;
}

const REALTIME_PAGE_SIZE = 100;
const REALTIME_MAX_PAGES = 80;
const REALTIME_PAGE_CONCURRENCY = 3;
let realtimeBatchCache: { fetchedAt: number; values: Map<string, MarketData> } | null = null;

export function __resetRealtimeBatchCacheForTest(): void {
  resetMarketResilience();
  realtimeBatchCache = null;
  tencentBatchCache = null;
  __resetHithinkStateForTest();
}

function quoteNumber(value: number | string | null | undefined): number {
  if (value === '-' || value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function listDiff(json: EastMoneyListResponse): EastMoneyListQuote[] {
  const diff = json.data?.diff;
  if (!diff) return [];
  return Array.isArray(diff) ? diff : Object.values(diff);
}

async function fetchRealtimePage(page: number, opts: FetchOpts): Promise<EastMoneyListResponse> {
  const fields = 'f2,f3,f5,f8,f12,f14,f15,f16,f17,f18';
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${REALTIME_PAGE_SIZE}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=${fields}`;
  const response = await fetchWithRetry(url, opts);
  if (!response.ok) throw new Error(`EastMoney realtime batch API error: ${response.status}`);
  return response.json() as Promise<EastMoneyListResponse>;
}

/**
 * Fetch a full-market realtime snapshot in ~55 paged requests instead of one
 * request per stock. A short in-memory cache lets concurrent scans share it.
 */
export async function fetchRealtimeBatch(
  codes: readonly string[],
  opts: FetchOpts = {},
): Promise<Map<string, MarketData>> {
  const wanted = new Set(codes);
  if (realtimeBatchCache && Date.now() - realtimeBatchCache.fetchedAt < 15_000) {
    return new Map([...realtimeBatchCache.values].filter(([code]) => wanted.has(code)));
  }

  const first = await fetchRealtimePage(1, { retries: 2, timeoutMs: 8000, ...opts });
  const total = Math.min(first.data?.total ?? REALTIME_PAGE_SIZE, REALTIME_PAGE_SIZE * REALTIME_MAX_PAGES);
  const pages = Math.max(1, Math.ceil(total / REALTIME_PAGE_SIZE));
  const responses: EastMoneyListResponse[] = [first];

  for (let start = 2; start <= pages; start += REALTIME_PAGE_CONCURRENCY) {
    checkCancelled(opts.signal);
    const pageNumbers = Array.from(
      { length: Math.min(REALTIME_PAGE_CONCURRENCY, pages - start + 1) },
      (_, index) => start + index,
    );
    const settled = await Promise.allSettled(pageNumbers.map((page) =>
      fetchRealtimePage(page, { retries: 2, timeoutMs: 8000, ...opts }),
    ));
    for (const result of settled) {
      if (result.status === 'fulfilled') responses.push(result.value);
    }
    if (settled.every((result) => result.status === 'rejected')) break;
  }

  const all = new Map<string, MarketData>();
  for (const response of responses) {
    for (const quote of listDiff(response)) {
      const code = quote.f12 ?? '';
      const price = quoteNumber(quote.f2);
      if (!/^\d{6}$/.test(code) || price <= 0) continue;
      all.set(code, {
        code,
        name: quote.f14 ?? '',
        price,
        change: quoteNumber(quote.f3),
        volume: quoteNumber(quote.f5),
        turnover: quoteNumber(quote.f8),
        open: quoteNumber(quote.f17),
        high: quoteNumber(quote.f15),
        low: quoteNumber(quote.f16),
        preClose: quoteNumber(quote.f18),
        source: 'eastmoney',
      });
    }
  }
  checkCancelled(opts.signal);
  realtimeBatchCache = { fetchedAt: Date.now(), values: all };
  return new Map([...all].filter(([code]) => wanted.has(code)));
}

let tencentBatchCache: { fetchedAt: number; values: Map<string, MarketData> } | null = null;

export async function fetchRealtimeBatchTencent(
  codes: readonly string[],
  opts: FetchOpts = {},
): Promise<Map<string, MarketData>> {
  const wanted = new Set(codes);
  if (tencentBatchCache && Date.now() - tencentBatchCache.fetchedAt < 15_000 &&
      [...wanted].every((code) => tencentBatchCache!.values.has(code))) {
    return new Map([...tencentBatchCache.values].filter(([code]) => wanted.has(code)));
  }
  const all = new Map<string, MarketData>();
  const chunks: string[][] = [];
  for (let index = 0; index < codes.length; index += 50) chunks.push(codes.slice(index, index + 50) as string[]);
  for (let start = 0; start < chunks.length; start += 3) {
    checkCancelled(opts.signal);
    const settled = await Promise.allSettled(chunks.slice(start, start + 3).map((chunk) =>
      fetchTencentChunk(chunk, { retries: 2, timeoutMs: 8000, ...opts }),
    ));
    for (const response of settled) {
      if (response.status !== 'fulfilled') continue;
      for (const [code, quote] of response.value) all.set(code, quote);
    }
    if (settled.every((response) => response.status === 'rejected')) break;
  }
  checkCancelled(opts.signal);
  if (all.size === 0 && codes.length > 0) throw new UpstreamUnavailableError('Failed to reach qt.gtimg.cn');
  tencentBatchCache = { fetchedAt: Date.now(), values: all };
  return all;
}

export async function fetchRealtimeBatchHithink(
  codes: readonly string[],
  opts: FetchOpts = {},
): Promise<Map<string, MarketData>> {
  try {
    return await fetchOfficialRealtimeBatch(codes, opts);
  } catch (error) {
    throw new UpstreamUnavailableError('HiThink batch quote API is unavailable', error);
  }
}

export async function fetchRealtimeBatchFromSource(
  codes: readonly string[],
  source: RealtimeSourcePreference = 'auto',
  opts: FetchOpts = {},
): Promise<Map<string, MarketData>> {
  checkCancelled(opts.signal);
  if (codes.length === 0) return new Map();
  const providers = { eastmoney: fetchRealtimeBatch, tencent: fetchRealtimeBatchTencent, hithink: fetchRealtimeBatchHithink };
  if (source !== 'auto') return providers[source](codes, { ...opts, retries: 0 });
  const result = new Map<string, MarketData>();
  for (const provider of ['eastmoney', 'tencent', 'hithink'] as const) {
    checkCancelled(opts.signal);
    if (provider === 'hithink' && !hasHithinkApiKey()) continue;
    const missing = codes.filter((code) => !result.has(code));
    if (!missing.length) break;
    const started = Date.now();
    try {
      const quotes = await providers[provider](missing, { ...opts, retries: 0, timeoutMs: Math.min(opts.timeoutMs ?? 2500, 2500) });
      for (const [code, quote] of quotes) result.set(code, quote);
      marketLog('batch_coverage', { provider, requested: missing.length, received: quotes.size, elapsedMs: Date.now() - started });
    } catch (error) {
      checkCancelled(opts.signal);
      marketLog('batch_fallback', { provider, requested: missing.length, elapsedMs: Date.now() - started });
    }
  }
  if (!result.size) throw new UpstreamUnavailableError('All quote providers are unavailable');
  return result;

}

// ---- 大盘指数 ----

const INDEX_SECIDS: { secid: string; label: string }[] = [
  { secid: '1.000001', label: '上证指数' },
  { secid: '0.399001', label: '深证成指' },
  { secid: '0.399006', label: '创业板指' },
];

/**
 * Fetch 上证 / 深证成指 / 创业板指 实时点位 + 涨跌幅.
 * 单个指数失败时 fallback 到 {value:0, changePct:0} (前端显示 "—"),
 * 不让一个指数挂掉拖垮整组. 全部失败也返回 3 个 fallback (不 throw).
 */
export async function fetchIndices(opts: FetchOpts = {}): Promise<MarketIndex[]> {
  const results = await Promise.allSettled(
    INDEX_SECIDS.map(async ({ secid, label }) => {
      const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f58,f170`;
      const res = await fetchWithRetry(url, opts);
      if (!res.ok) throw new Error(`EastMoney index API error: ${res.status}`);
      const json = (await res.json()) as {
        data?: { f43?: number; f58?: string; f170?: number } | null;
      };
      const d = json.data;
      if (!d || d.f43 == null) throw new Error(`INDEX_NOT_FOUND: ${secid}`);
      return {
        label,
        value: (d.f43 ?? 0) / 100,
        changePct: (d.f170 ?? 0) / 100,
      } satisfies MarketIndex;
    }),
  );
  return INDEX_SECIDS.map((cfg, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') return r.value;
    return { label: cfg.label, value: 0, changePct: 0 };
  });
}

interface EastMoneyKLineResponse {
  data?: {
    klines?: string[];
  } | null;
}

/**
 * Fetch K-line (daily) data for a given stock code.
 * @param code Stock code
 * @param days Number of trading days (default 60)
 * @param signalOrOpts Either an AbortSignal (legacy) or full FetchOpts. Legacy
 *   signal-only call kept for backwards-compat with engine.ts mass scan path.
 */
export async function fetchKLine(
  code: string,
  days = 60,
  signalOrOpts?: AbortSignal | KLineFetchOpts,
): Promise<KLine[]> {
  const opts: KLineFetchOpts =
    signalOrOpts instanceof AbortSignal
      ? { signal: signalOrOpts }
      : signalOrOpts ?? {};
  if ((opts.period ?? 'daily') === 'daily' && !opts.skipTushare) {
    const tushare = await fetchTushareDaily(code, days, opts.signal);
    if (tushare && tushare.length > 0) return tushare;
  }
  if ((opts.period ?? 'daily') === 'daily' && !opts.skipBaoStock) {
    const baostock = await fetchBaoStockDaily(code, days);
    if (baostock && baostock.length > 0) return baostock;
  }
  if ((opts.period ?? 'daily') === 'daily' && !opts.skipHithink) {
    const hithink = await fetchHithinkDaily(code, days, opts);
    if (hithink && hithink.length > 0) return hithink;
  }
  const klt = KLINE_PERIOD_TO_KLT[opts.period ?? 'daily'];
  const marketCode = getMarketCode(code);
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${marketCode}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=${klt}&fqt=1&end=20500101&lmt=${days}`;

  const res = await fetchWithRetry(url, opts);
  if (!res.ok) {
    throw new Error(`EastMoney KLine API error: ${res.status}`);
  }

  const json: EastMoneyKLineResponse = await res.json();

  if (!json.data?.klines || json.data.klines.length === 0) {
    throw new Error('STOCK_NOT_FOUND');
  }

  return json.data.klines.map((item: string) => {
    const parts = item.split(',');
    const date = parts[0];
    const open = parseFloat(parts[1]);
    const close = parseFloat(parts[2]);
    const high = parseFloat(parts[3]);
    const low = parseFloat(parts[4]);
    const volume = parseFloat(parts[5]);

    return { date, open, high, low, close, volume };
  });
}
