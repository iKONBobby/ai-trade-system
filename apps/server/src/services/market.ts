import type { MarketData, KLine, StockSearchItem, MarketIndex } from '@trade/shared';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch wrapper with explicit per-attempt timeout and retry-with-backoff
 * on transient network failures. Never retries on 4xx, user-cancellation,
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

    const perAttemptTimeout = AbortSignal.timeout(timeoutMs);
    const combinedSignal = externalSignal
      ? AbortSignal.any([externalSignal, perAttemptTimeout])
      : perAttemptTimeout;

    try {
      const res = await fetch(url, { signal: combinedSignal });
      if (res.status >= 500 && attempt < retries) {
        lastErr = new Error(`Upstream ${res.status}`);
      } else {
        return res;
      }
    } catch (err: unknown) {
      lastErr = err;
      // user-initiated abort: do not retry
      if (externalSignal?.aborted) throw err;
      // not a retryable transport error: bail immediately
      if (!isRetryableNetworkError(err) && !isTimeoutAbort(err, perAttemptTimeout)) {
        throw err;
      }
    }

    if (attempt < retries) {
      // 500ms, 1500ms, 4500ms ...
      const backoffMs = 500 * Math.pow(3, attempt);
      await sleep(backoffMs);
    }
  }

  throw new UpstreamUnavailableError(
    `Failed to reach ${new URL(url).host} after ${retries + 1} attempt(s)`,
    lastErr,
  );
}

function isTimeoutAbort(err: unknown, timeoutSignal: AbortSignal): boolean {
  return err instanceof DOMException && err.name === 'AbortError' && timeoutSignal.aborted;
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
  };
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
