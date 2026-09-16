import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KLine } from '@trade/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = path.resolve(__dirname, '../../data/market-cache/tushare');
const API_URL = 'https://api.tushare.pro';
const CACHE_VERSION = 1;
const DEFAULT_CALLS_PER_MINUTE = 45;

interface TushareTable {
  fields?: string[];
  items?: unknown[][];
}

interface TushareResponse {
  code?: number;
  msg?: string;
  data?: TushareTable;
}

interface CachedKLines {
  version: number;
  fetchedAt: number;
  klines: KLine[];
}

interface CachedMarketDay {
  version: number;
  tradeDate: string;
  klines: Array<KLine & { code: string }>;
}

let cacheDir = DEFAULT_CACHE_DIR;
let requestGate: Promise<void> = Promise.resolve();
let nextRequestAt = 0;

export function hasTushareToken(): boolean {
  return Boolean(process.env.TUSHARE_TOKEN?.trim());
}

/** Test seam: keep fixtures away from the real market cache. */
export function __setTushareCacheDirForTest(dir: string | null): void {
  cacheDir = dir ?? DEFAULT_CACHE_DIR;
  requestGate = Promise.resolve();
  nextRequestAt = 0;
  marketHistoryInflight = null;
}

function tushareCode(code: string): string {
  return `${code}.${code.startsWith('6') ? 'SH' : 'SZ'}`;
}

function cachePath(code: string): string {
  return path.join(cacheDir, 'stocks', `${code}.json`);
}

function marketDayPath(tradeDate: string): string {
  return path.join(cacheDir, 'days', `${tradeDate}.json`);
}

function callsPerMinute(): number {
  const parsed = Number(process.env.TUSHARE_CALLS_PER_MINUTE);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_CALLS_PER_MINUTE;
}

async function waitForRateSlot(signal?: AbortSignal): Promise<void> {
  const interval = Math.ceil(60_000 / callsPerMinute());
  const previous = requestGate;
  let release!: () => void;
  requestGate = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    if (signal?.aborted) throw new DOMException('Request cancelled by caller', 'AbortError');
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    if (waitMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, waitMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Request cancelled by caller', 'AbortError'));
        }, { once: true });
      });
    }
    nextRequestAt = Date.now() + interval;
  } finally {
    release();
  }
}

async function callTushare(
  apiName: string,
  params: Record<string, string>,
  fields: string,
  signal?: AbortSignal,
): Promise<TushareTable> {
  const token = process.env.TUSHARE_TOKEN?.trim();
  if (!token) throw new Error('TUSHARE_TOKEN_NOT_CONFIGURED');

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    await waitForRateSlot(signal);
    const timeout = AbortSignal.timeout(15_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_name: apiName, token, params, fields }),
        signal: combined,
      });
      if (!response.ok) throw new Error(`Tushare HTTP ${response.status}`);
      const payload = await response.json() as TushareResponse;
      if (payload.code !== 0) throw new Error(`Tushare API ${payload.code ?? 'unknown'}: ${payload.msg ?? 'unknown error'}`);
      return payload.data ?? { fields: [], items: [] };
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Tushare request failed');
}

function tableRows(table: TushareTable): Array<Record<string, unknown>> {
  const fields = table.fields ?? [];
  return (table.items ?? []).map((item) => Object.fromEntries(fields.map((field, index) => [field, item[index]])));
}

function parseDaily(table: TushareTable): KLine[] {
  return tableRows(table)
    .map((row): KLine | null => {
      const rawDate = String(row.trade_date ?? '');
      const values = [row.open, row.high, row.low, row.close, row.vol].map(Number);
      if (!/^\d{8}$/.test(rawDate) || values.some((value) => !Number.isFinite(value))) return null;
      return {
        date: `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
        open: values[0],
        high: values[1],
        low: values[2],
        close: values[3],
        volume: values[4],
      };
    })
    .filter((row): row is KLine => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseMarketDay(table: TushareTable): Array<KLine & { code: string }> {
  return tableRows(table)
    .map((row): (KLine & { code: string }) | null => {
      const rawDate = String(row.trade_date ?? '');
      const rawCode = String(row.ts_code ?? '');
      const values = [row.open, row.high, row.low, row.close, row.vol].map(Number);
      if (!/^\d{6}\.(SH|SZ)$/.test(rawCode) || !/^\d{8}$/.test(rawDate) || values.some((value) => !Number.isFinite(value))) return null;
      return {
        code: rawCode.slice(0, 6),
        date: `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
        open: values[0], high: values[1], low: values[2], close: values[3], volume: values[4],
      };
    })
    .filter((row): row is KLine & { code: string } => row !== null);
}

async function readCache(code: string): Promise<CachedKLines | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(cachePath(code), 'utf8')) as CachedKLines;
    if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.klines)) return null;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

async function writeCache(code: string, data: CachedKLines): Promise<void> {
  const target = cachePath(code);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(temp, JSON.stringify(data), 'utf8');
  await fs.rename(temp, target);
}

async function readMarketDay(tradeDate: string): Promise<CachedMarketDay | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(marketDayPath(tradeDate), 'utf8')) as CachedMarketDay;
    return parsed.version === CACHE_VERSION && Array.isArray(parsed.klines) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeMarketDay(data: CachedMarketDay): Promise<void> {
  const target = marketDayPath(data.tradeDate);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(temp, JSON.stringify(data), 'utf8');
  await fs.rename(temp, target);
}

function startDateForTradingDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Math.ceil(days * 1.7) - 30);
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function cacheIsFresh(cache: CachedKLines, days: number): boolean {
  return cache.klines.length >= days && Date.now() - cache.fetchedAt < 6 * 60 * 60 * 1000;
}

/**
 * Fetch unadjusted A-share daily bars from Tushare's free `daily` API.
 * Returns null when no token is configured or Tushare is unavailable, allowing
 * the caller to fall back without changing existing API behavior.
 */
export async function fetchTushareDaily(
  code: string,
  days: number,
  signal?: AbortSignal,
): Promise<KLine[] | null> {
  if (!hasTushareToken()) return null;
  const cached = await readCache(code);
  if (cached && cacheIsFresh(cached, days)) return cached.klines.slice(-days);

  try {
    const table = await callTushare(
      'daily',
      { ts_code: tushareCode(code), start_date: startDateForTradingDays(days) },
      'ts_code,trade_date,open,high,low,close,vol',
      signal,
    );
    const klines = parseDaily(table);
    if (klines.length === 0) return cached?.klines.slice(-days) ?? null;
    await writeCache(code, { version: CACHE_VERSION, fetchedAt: Date.now(), klines });
    return klines.slice(-days);
  } catch (error) {
    if (signal?.aborted) throw error;
    return cached && cached.klines.length >= days ? cached.klines.slice(-days) : null;
  }
}

function compactDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function scannerDateRange(days: number): { start: string; end: string } {
  const now = new Date();
  const shanghaiHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false,
  }).format(now));
  const end = new Date(now);
  if (shanghaiHour < 17) end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.ceil(days * 1.7) - 30);
  return { start: compactDate(start), end: compactDate(end) };
}

async function cachedTradeDates(days: number): Promise<string[]> {
  try {
    return (await fs.readdir(path.join(cacheDir, 'days')))
      .map((name) => name.match(/^(\d{8})\.json$/)?.[1])
      .filter((date): date is string => Boolean(date))
      .sort()
      .slice(-days);
  } catch {
    return [];
  }
}

let marketHistoryInflight: Promise<Map<string, KLine[]> | null> | null = null;

/**
 * Build scanner history by trade date: one request yields the whole A-share
 * market. Date shards are persisted, so after the first backfill a normal day
 * adds only one new `daily` request.
 */
export function prepareTushareMarketHistory(
  days: number,
  signal?: AbortSignal,
): Promise<Map<string, KLine[]> | null> {
  if (!hasTushareToken()) return Promise.resolve(null);
  if (marketHistoryInflight) return marketHistoryInflight;
  marketHistoryInflight = prepareMarketHistory(days, signal).finally(() => {
    marketHistoryInflight = null;
  });
  return marketHistoryInflight;
}

async function prepareMarketHistory(days: number, signal?: AbortSignal): Promise<Map<string, KLine[]> | null> {
  const range = scannerDateRange(days);
  let openDates: string[];
  try {
    const calendar = await callTushare(
      'trade_cal',
      { exchange: 'SSE', is_open: '1', start_date: range.start, end_date: range.end },
      'cal_date,is_open',
      signal,
    );
    openDates = tableRows(calendar)
      .filter((row) => Number(row.is_open) === 1 && /^\d{8}$/.test(String(row.cal_date ?? '')))
      .map((row) => String(row.cal_date))
      .sort()
      .slice(-days);
  } catch (error) {
    if (signal?.aborted) throw error;
    openDates = await cachedTradeDates(days);
    if (openDates.length === 0) return null;
  }

  const histories = new Map<string, KLine[]>();
  let loadedDays = 0;
  let consecutiveFailures = 0;
  for (const tradeDate of openDates) {
    if (signal?.aborted) throw new DOMException('Request cancelled by caller', 'AbortError');
    let day = await readMarketDay(tradeDate);
    if (!day) {
      try {
        const table = await callTushare(
          'daily',
          { trade_date: tradeDate },
          'ts_code,trade_date,open,high,low,close,vol',
          signal,
        );
        const klines = parseMarketDay(table);
        if (klines.length === 0) {
          consecutiveFailures++;
          if (consecutiveFailures >= 3) break;
          continue;
        }
        day = { version: CACHE_VERSION, tradeDate, klines };
        await writeMarketDay(day);
        consecutiveFailures = 0;
      } catch (error) {
        if (signal?.aborted) throw error;
        consecutiveFailures++;
        // Do not turn a Tushare outage or bad token into hundreds of doomed
        // requests. Existing date shards remain usable; scanner then falls back.
        if (consecutiveFailures >= 3) break;
        continue;
      }
    }
    loadedDays++;
    for (const { code, ...kline } of day.klines) {
      const history = histories.get(code) ?? [];
      history.push(kline);
      histories.set(code, history);
    }
  }

  return loadedDays >= Math.min(20, days) ? histories : null;
}
