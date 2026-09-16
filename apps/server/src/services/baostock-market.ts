import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { KLine } from '@trade/shared';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '../../data/market-cache/baostock/stocks');
const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/baostock-kline.py');
const VENV_PYTHON = path.resolve(__dirname, '../../.venv/bin/python');
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CacheFile {
  fetchedAt: number;
  klines: KLine[];
}

interface BridgeResult {
  ok?: boolean;
  error?: string;
  klines?: KLine[];
}

let unavailableUntil = 0;

async function pythonExecutable(): Promise<string> {
  if (process.env.BAOSTOCK_PYTHON?.trim()) return process.env.BAOSTOCK_PYTHON.trim();
  try {
    await fs.access(VENV_PYTHON);
    return VENV_PYTHON;
  } catch {
    return 'python3';
  }
}

function targetPath(code: string): string {
  return path.join(CACHE_DIR, `${code}.json`);
}

async function readCache(code: string): Promise<CacheFile | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(targetPath(code), 'utf8')) as CacheFile;
    return Array.isArray(parsed.klines) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCache(code: string, data: CacheFile): Promise<void> {
  const target = targetPath(code);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(temp, JSON.stringify(data), 'utf8');
  await fs.rename(temp, target);
}

function validKLines(value: unknown): value is KLine[] {
  return Array.isArray(value) && value.every((row) =>
    row && typeof row === 'object' && typeof row.date === 'string' &&
    ['open', 'high', 'low', 'close', 'volume'].every((key) => Number.isFinite(Number((row as Record<string, unknown>)[key]))),
  );
}

/** Optional free historical fallback. Missing Python/BaoStock is circuit-broken. */
export async function fetchBaoStockDaily(code: string, days: number): Promise<KLine[] | null> {
  const cached = await readCache(code);
  if (cached && cached.klines.length >= days && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.klines.slice(-days);
  }
  if (Date.now() < unavailableUntil) {
    return cached && cached.klines.length >= days ? cached.klines.slice(-days) : null;
  }

  try {
    const { stdout } = await execFileAsync(await pythonExecutable(), [SCRIPT_PATH, code, String(days)], {
      timeout: 10_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    // BaoStock may print login/logout messages around our JSON payload.
    const line = stdout.trim().split('\n').reverse().find((value) => value.trim().startsWith('{')) ?? '';
    const result = JSON.parse(line) as BridgeResult;
    if (!result.ok || !validKLines(result.klines) || result.klines.length === 0) return null;
    const klines = result.klines.map((row) => ({
      ...row,
      open: Number(row.open), high: Number(row.high), low: Number(row.low),
      close: Number(row.close), volume: Number(row.volume),
    }));
    await writeCache(code, { fetchedAt: Date.now(), klines });
    return klines.slice(-days);
  } catch {
    // A missing package or an unavailable BaoStock server should cost one
    // failed attempt, not one process spawn on every request.
    unavailableUntil = Date.now() + 5 * 60 * 1000;
    return cached && cached.klines.length >= days ? cached.klines.slice(-days) : null;
  }
}
