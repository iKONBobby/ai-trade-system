import type { KLine, MarketData } from '@trade/shared';

const DEFAULT_BASE_URL = 'https://fuyao.aicubes.cn';
const MAX_BATCH_SIZE = 100;
const MAX_ATTEMPTS = 3;
const CIRCUIT_BREAK_MS = 60_000;

export interface HithinkFetchOpts {
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface ApiEnvelope<T> {
  code?: number;
  message?: string;
  request_id?: string;
  data?: T | null;
}

interface SnapshotItem {
  thscode?: string;
  ticker?: string;
  volume?: number | null;
  turnover?: number | null;
  last_price?: number | null;
  price_change_ratio_pct?: number | null;
  open_price?: number | null;
  high_price?: number | null;
  low_price?: number | null;
  prev_price?: number | null;
}

interface SnapshotData {
  timestamp?: number | null;
  item?: SnapshotItem[];
}

interface HistoricalItem {
  date_ms?: number;
  open_price?: number | null;
  high_price?: number | null;
  low_price?: number | null;
  close_price?: number | null;
  volume?: number | null;
}

interface HistoricalData {
  item?: HistoricalItem[];
}

interface TickerItem {
  ticker?: string;
  name?: string;
}

interface TickerSearchData {
  item?: TickerItem[];
}

export class HithinkApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly requestId?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'HithinkApiError';
  }
}

let unavailableUntil = 0;
const nameCache = new Map<string, string>();

export function hasHithinkApiKey(): boolean {
  return Boolean(process.env.HITHINK_FINANCE_API_KEY?.trim());
}

/** Test seam for deterministic retry/circuit-breaker tests. */
export function __resetHithinkStateForTest(): void {
  unavailableUntil = 0;
  nameCache.clear();
}

function baseUrl(): string {
  return (process.env.HITHINK_FINANCE_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function toThscode(code: string): string {
  return `${code}.${code.startsWith('6') ? 'SH' : 'SZ'}`;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function retryableBusinessCode(code: number | undefined): boolean {
  return code === 4001 || code === 5001 || code === 5002 || code === 5003;
}

function shouldOpenCircuit(error: HithinkApiError): boolean {
  // HTTP failures do not carry an API business code. Authentication and
  // entitlement errors make every subsequent request fail until configuration
  // changes; validation/not-found errors are isolated to a single request.
  return error.code === undefined || error.code === 2001 || error.code === 2002 || error.code === 2003;
}

function abortError(): DOMException {
  return new DOMException('Request cancelled by caller', 'AbortError');
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

async function callApi<T>(
  pathname: string,
  params: Record<string, string>,
  opts: HithinkFetchOpts = {},
): Promise<T> {
  const apiKey = process.env.HITHINK_FINANCE_API_KEY?.trim();
  if (!apiKey) throw new HithinkApiError('HITHINK_API_KEY_NOT_CONFIGURED');
  if (Date.now() < unavailableUntil) throw new HithinkApiError('HITHINK_CIRCUIT_OPEN');

  const url = new URL(pathname, `${baseUrl()}/`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (opts.signal?.aborted) throw abortError();
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? 8_000);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

    try {
      const response = await fetch(url, {
        headers: { 'X-api-key': apiKey, Accept: 'application/json' },
        signal,
      });
      if (!response.ok) {
        const error = new HithinkApiError(`HiThink HTTP ${response.status}`);
        if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS - 1) {
          lastError = error;
        } else {
          throw error;
        }
      } else {
        const envelope = await response.json() as ApiEnvelope<T>;
        if (envelope.code === 0 && envelope.data != null) return envelope.data;
        const error = new HithinkApiError(
          `HiThink API ${envelope.code ?? 'unknown'}: ${envelope.message ?? 'unknown error'}`,
          envelope.code,
          envelope.request_id,
        );
        if (retryableBusinessCode(envelope.code) && attempt < MAX_ATTEMPTS - 1) {
          lastError = error;
        } else {
          throw error;
        }
      }
    } catch (error) {
      if (opts.signal?.aborted) throw error;
      lastError = error;
      if (error instanceof HithinkApiError && !retryableBusinessCode(error.code)) {
        if (shouldOpenCircuit(error)) unavailableUntil = Date.now() + CIRCUIT_BREAK_MS;
        throw error;
      }
      if (attempt >= MAX_ATTEMPTS - 1) break;
    }

    await delay(500 * Math.pow(2, attempt), opts.signal);
  }

  unavailableUntil = Date.now() + CIRCUIT_BREAK_MS;
  throw new HithinkApiError('HiThink service unavailable after 3 attempts', undefined, undefined, lastError);
}

async function resolveName(code: string, opts: HithinkFetchOpts): Promise<string> {
  const cached = nameCache.get(code);
  if (cached) return cached;
  try {
    const data = await callApi<TickerSearchData>('/api/meta/tickers/search', {
      q: toThscode(code),
      asset_type: 'a-share',
      limit: '1',
    }, opts);
    const name = data.item?.find((item) => item.ticker === code)?.name?.trim() ?? '';
    if (name) nameCache.set(code, name);
    return name;
  } catch {
    return '';
  }
}

function mapSnapshotItem(item: SnapshotItem, timestamp: number | null, name = ''): MarketData | null {
  const code = item.ticker ?? item.thscode?.slice(0, 6) ?? '';
  const price = finiteNumber(item.last_price);
  if (!/^\d{6}$/.test(code) || price === null || price <= 0) return null;

  return {
    code,
    name,
    price,
    change: finiteNumber(item.price_change_ratio_pct) ?? 0,
    // HiThink documents snapshot volume in shares. Existing MarketData uses lots.
    volume: (finiteNumber(item.volume) ?? 0) / 100,
    // The official snapshot exposes turnover amount, not turnover rate.
    turnover: 0,
    turnoverAvailable: false,
    turnoverAmount: finiteNumber(item.turnover) ?? undefined,
    open: finiteNumber(item.open_price) ?? 0,
    high: finiteNumber(item.high_price) ?? 0,
    low: finiteNumber(item.low_price) ?? 0,
    preClose: finiteNumber(item.prev_price) ?? 0,
    quoteTimestamp: timestamp,
    source: 'hithink',
  };
}

export async function fetchHithinkRealtimeBatch(
  codes: readonly string[],
  opts: HithinkFetchOpts = {},
): Promise<Map<string, MarketData>> {
  if (codes.length === 0) return new Map();
  const result = new Map<string, MarketData>();

  for (let start = 0; start < codes.length; start += MAX_BATCH_SIZE) {
    const chunk = codes.slice(start, start + MAX_BATCH_SIZE);
    const data = await callApi<SnapshotData>('/api/a-share/prices/snapshot', {
      thscodes: chunk.map(toThscode).join(','),
    }, opts);
    const timestamp = finiteNumber(data.timestamp);
    for (const item of data.item ?? []) {
      const mapped = mapSnapshotItem(item, timestamp);
      if (mapped) result.set(mapped.code, mapped);
    }
  }

  return result;
}

export async function fetchHithinkRealtime(
  code: string,
  opts: HithinkFetchOpts = {},
): Promise<MarketData> {
  const quotes = await fetchHithinkRealtimeBatch([code], opts);
  const quote = quotes.get(code);
  if (!quote) throw new HithinkApiError('STOCK_NOT_FOUND', 3001);
  quote.name = await resolveName(code, opts);
  return quote;
}

const shanghaiDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Optional daily fallback. Uses unadjusted prices while Fuyao adjustment semantics remain under review. */
export async function fetchHithinkDaily(
  code: string,
  days: number,
  opts: HithinkFetchOpts = {},
): Promise<KLine[] | null> {
  if (!hasHithinkApiKey() || Date.now() < unavailableUntil) return null;
  const end = Date.now();
  const start = end - (Math.ceil(days * 1.8) + 45) * 86_400_000;

  try {
    const data = await callApi<HistoricalData>('/api/a-share/prices/historical', {
      thscode: toThscode(code),
      interval: '1d',
      start: String(start),
      end: String(end),
      adjust: 'none',
    }, opts);
    const klines = (data.item ?? []).flatMap((item): KLine[] => {
      const dateMs = finiteNumber(item.date_ms);
      const values = [item.open_price, item.high_price, item.low_price, item.close_price, item.volume]
        .map(finiteNumber);
      if (dateMs === null || values.some((value) => value === null)) return [];
      return [{
        date: shanghaiDate.format(new Date(dateMs)),
        open: values[0]!,
        high: values[1]!,
        low: values[2]!,
        close: values[3]!,
        volume: values[4]!,
      }];
    }).sort((a, b) => a.date.localeCompare(b.date));
    return klines.length > 0 ? klines.slice(-days) : null;
  } catch (error) {
    if (opts.signal?.aborted) throw error;
    return null;
  }
}
