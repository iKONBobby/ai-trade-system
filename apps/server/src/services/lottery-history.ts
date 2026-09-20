import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  LotteryDraw,
  LotteryHistoryProvider,
  LotteryHistoryResponse,
  LotteryKind,
} from '@trade/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = path.resolve(__dirname, '../../data/lottery-cache');
const CACHE_VERSION = 1;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SOURCE_LABELS: Record<LotteryHistoryProvider, string> = {
  cwl: '中国福利彩票发行管理中心',
  sporttery: '中国体育彩票',
  juhe: '聚合数据彩票历史',
};

type CachedHistory = {
  version: number;
  fetchedAt: number;
  source: LotteryHistoryProvider;
  draws: LotteryDraw[];
};

let cacheDir = DEFAULT_CACHE_DIR;
const inflight = new Map<string, Promise<LotteryHistoryResponse>>();

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseNumbers(value: unknown): number[] {
  const source = Array.isArray(value) ? value.join(' ') : String(value ?? '');
  return (source.match(/\d+/g) ?? []).map(Number);
}

function validDraw(kind: LotteryKind, draw: LotteryDraw): boolean {
  const config = kind === 'ssq'
    ? { frontCount: 6, frontMax: 33, backCount: 1, backMax: 16 }
    : { frontCount: 5, frontMax: 35, backCount: 2, backMax: 12 };
  return Boolean(draw.issue)
    && draw.front.length === config.frontCount
    && new Set(draw.front).size === config.frontCount
    && draw.front.every((number) => Number.isInteger(number) && number >= 1 && number <= config.frontMax)
    && draw.back.length === config.backCount
    && new Set(draw.back).size === config.backCount
    && draw.back.every((number) => Number.isInteger(number) && number >= 1 && number <= config.backMax);
}

function normalize(kind: LotteryKind, draws: LotteryDraw[]): LotteryDraw[] {
  const unique = new Map<string, LotteryDraw>();
  draws.forEach((draw) => {
    const normalized = {
      ...draw,
      issue: draw.issue.trim(),
      drawDate: draw.drawDate.trim().slice(0, 10),
      front: [...draw.front].sort((a, b) => a - b),
      back: [...draw.back].sort((a, b) => a - b),
    };
    if (validDraw(kind, normalized)) unique.set(normalized.issue, normalized);
  });
  return [...unique.values()].sort((left, right) => {
    const byDate = right.drawDate.localeCompare(left.drawDate);
    return byDate || right.issue.localeCompare(left.issue, 'zh-CN', { numeric: true });
  });
}

export function parseCwlHistory(payload: unknown): LotteryDraw[] {
  const rows = list(record(payload)?.result);
  return normalize('ssq', rows.map((value): LotteryDraw => {
    const row = record(value) ?? {};
    return {
      issue: String(row.code ?? row.issue ?? ''),
      drawDate: String(row.date ?? row.drawDate ?? ''),
      front: parseNumbers(row.red ?? row.redBall ?? row.front),
      back: parseNumbers(row.blue ?? row.blueBall ?? row.back),
    };
  }));
}

export function parseSportteryHistory(payload: unknown): LotteryDraw[] {
  const root = record(payload);
  const value = record(root?.value);
  const rows = list(value?.list ?? root?.list);
  return normalize('dlt', rows.map((item): LotteryDraw => {
    const row = record(item) ?? {};
    const all = parseNumbers(row.lotteryDrawResult ?? row.drawResult ?? row.result);
    return {
      issue: String(row.lotteryDrawNum ?? row.issue ?? ''),
      drawDate: String(row.lotteryDrawTime ?? row.drawTime ?? row.date ?? ''),
      front: all.slice(0, 5),
      back: all.slice(5, 7),
    };
  }));
}

export function parseJuheHistory(kind: LotteryKind, payload: unknown): LotteryDraw[] {
  const result = record(record(payload)?.result);
  const rows = list(result?.lotteryResList ?? result?.list ?? result?.data);
  return normalize(kind, rows.map((item): LotteryDraw => {
    const row = record(item) ?? {};
    const all = parseNumbers(row.lottery_res ?? row.lotteryRes ?? row.result);
    const frontCount = kind === 'ssq' ? 6 : 5;
    return {
      issue: String(row.lottery_no ?? row.lotteryNo ?? row.issue ?? ''),
      drawDate: String(row.lottery_date ?? row.lotteryDate ?? row.date ?? ''),
      front: all.slice(0, frontCount),
      back: all.slice(frontCount),
    };
  }));
}

async function getJson(url: URL, headers: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (compatible; AITradeSystem/1.0)',
      ...headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`upstream HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    throw new Error(`upstream returned ${contentType || 'an unknown content type'}`);
  }
  return response.json();
}

async function fetchCwl(limit: number): Promise<LotteryDraw[]> {
  const url = new URL('https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice');
  url.search = new URLSearchParams({
    name: 'ssq', issueCount: String(limit), issueStart: '', issueEnd: '',
    dayStart: '', dayEnd: '', pageNo: '1', pageSize: String(limit), week: '', systemType: 'PC',
  }).toString();
  return parseCwlHistory(await getJson(url, { Referer: 'https://www.cwl.gov.cn/ygkj/wqkjgg/ssq/' }));
}

async function fetchSporttery(limit: number): Promise<LotteryDraw[]> {
  const pageSize = 30;
  const pages = Math.ceil(limit / pageSize);
  const draws: LotteryDraw[] = [];
  for (let pageNo = 1; pageNo <= pages; pageNo += 1) {
    const url = new URL('https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry');
    url.search = new URLSearchParams({
      gameNo: '85', provinceId: '0', pageSize: String(pageSize), pageNo: String(pageNo), isVerify: '1',
    }).toString();
    const page = parseSportteryHistory(await getJson(url, { Referer: 'https://www.sporttery.cn/' }));
    draws.push(...page);
    if (page.length < pageSize) break;
  }
  return normalize('dlt', draws).slice(0, limit);
}

async function fetchJuhe(kind: LotteryKind, limit: number): Promise<LotteryDraw[]> {
  const key = process.env.JUHE_LOTTERY_KEY?.trim();
  if (!key) throw new Error('JUHE_LOTTERY_KEY is not configured');
  const pageSize = Math.min(50, limit);
  const pages = Math.ceil(limit / pageSize);
  const draws: LotteryDraw[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const url = new URL('https://apis.juhe.cn/lottery/history');
    url.search = new URLSearchParams({ key, lottery_id: kind, page_size: String(pageSize), page: String(page) }).toString();
    const payload = await getJson(url, {});
    const root = record(payload);
    if (Number(root?.error_code ?? 0) !== 0) throw new Error(String(root?.reason ?? 'Juhe upstream error'));
    const current = parseJuheHistory(kind, payload);
    draws.push(...current);
    if (current.length < pageSize) break;
  }
  return normalize(kind, draws).slice(0, limit);
}

function cachePath(kind: LotteryKind): string {
  return path.join(cacheDir, `${kind}.json`);
}

async function readCache(kind: LotteryKind): Promise<CachedHistory | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(cachePath(kind), 'utf8')) as CachedHistory;
    if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.draws)) return null;
    const draws = normalize(kind, parsed.draws);
    return draws.length ? { ...parsed, draws } : null;
  } catch {
    return null;
  }
}

async function writeCache(kind: LotteryKind, cache: CachedHistory): Promise<void> {
  const target = cachePath(kind);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(temp, JSON.stringify(cache), 'utf8');
  await fs.rename(temp, target);
}

function responseFromCache(kind: LotteryKind, cache: CachedHistory, limit: number, stale: boolean): LotteryHistoryResponse {
  return {
    kind,
    draws: cache.draws.slice(0, limit),
    source: cache.source,
    sourceLabel: SOURCE_LABELS[cache.source],
    fetchedAt: new Date(cache.fetchedAt).toISOString(),
    cached: true,
    stale,
  };
}

async function refresh(kind: LotteryKind, limit: number, cached: CachedHistory | null): Promise<LotteryHistoryResponse> {
  const attempts: Array<{ source: LotteryHistoryProvider; load: () => Promise<LotteryDraw[]> }> = kind === 'ssq'
    ? [{ source: 'cwl', load: () => fetchCwl(limit) }]
    : [{ source: 'sporttery', load: () => fetchSporttery(limit) }];
  if (process.env.JUHE_LOTTERY_KEY?.trim()) attempts.push({ source: 'juhe', load: () => fetchJuhe(kind, limit) });

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const draws = await attempt.load();
      if (draws.length === 0) throw new Error('upstream returned no valid draws');
      const entry: CachedHistory = { version: CACHE_VERSION, fetchedAt: Date.now(), source: attempt.source, draws };
      try {
        await writeCache(kind, entry);
      } catch (cacheError) {
        console.warn(`[LOTTERY:HISTORY] cache write failed: ${cacheError instanceof Error ? cacheError.message : 'unknown error'}`);
      }
      return { ...responseFromCache(kind, entry, limit, false), cached: false };
    } catch (error) {
      errors.push(`${attempt.source}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  if (cached) return responseFromCache(kind, cached, limit, true);
  throw new Error(`LOTTERY_HISTORY_UNAVAILABLE (${errors.join('; ')})`);
}

export async function getLotteryHistory(
  kind: LotteryKind,
  limit = 100,
  forceRefresh = false,
): Promise<LotteryHistoryResponse> {
  const safeLimit = Math.max(10, Math.min(200, Math.floor(limit)));
  const cached = await readCache(kind);
  if (!forceRefresh && cached && cached.draws.length >= safeLimit && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return responseFromCache(kind, cached, safeLimit, false);
  }

  const inflightKey = `${kind}:${safeLimit}`;
  const current = inflight.get(inflightKey);
  if (current) return current;
  const request = refresh(kind, safeLimit, cached).finally(() => inflight.delete(inflightKey));
  inflight.set(inflightKey, request);
  return request;
}

/** Test seam: isolates cache fixtures from application data. */
export function __setLotteryCacheDirForTest(directory: string | null): void {
  cacheDir = directory ?? DEFAULT_CACHE_DIR;
  inflight.clear();
}
