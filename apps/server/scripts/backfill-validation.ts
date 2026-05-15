// Outcome validation backfill — 把 docs/validation/*.md 的 5d_direction 列自动填上.
//
// 用法:
//   pnpm tsx scripts/backfill-validation.ts            # dry-run (默认), 只打印
//   pnpm tsx scripts/backfill-validation.ts --write    # 实际写回 markdown
//   pnpm tsx scripts/backfill-validation.ts --file docs/validation/swarm-vs-single-2026Q2.md
//
// 设计:
//   1. 扫 docs/validation/*.md (或 --file 指定)
//   2. 每行 markdown 表 row 提取 date + stock_code
//   3. 跳过表头、空行、已填 5d_direction 的行
//   4. 拉 60 天 daily K 线
//   5. 算决策日 + 5 个交易日后收盘价方向 (>1% up, <-1% down, else flat)
//   6. 重写 markdown 5d_direction 列
//   7. 输出 swarm vs single 方向命中率统计

import 'dotenv/config';
import { promises as fs } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KLine } from '@trade/shared';
import { fetchKLine, UpstreamUnavailableError } from '../src/services/market.js';

const FIVE_DAY_UP_THRESHOLD = 1.0; // %
const FIVE_DAY_DOWN_THRESHOLD = -1.0;
const TRADING_DAYS_AHEAD = 5;
const KLINE_DAYS = 60; // 拉 60 天保证 5 个交易日后数据已有

type Direction = 'up' | 'down' | 'flat';

interface Row {
  raw: string;
  date: string; // YYYY-MM-DD
  stockCode: string;
  mode: string;
  verdict: string;
  confidence: string;
  positionPct: string;
  fiveDay: string;
  notes: string;
}

// ---- Pure functions (export 供测试) ----

export function parseRow(line: string): Row | null {
  if (!line.startsWith('|')) return null;
  // markdown table row: '| a | b | c |' split → ['', ' a ', ' b ', ' c ', '']
  const parts = line.split('|');
  if (parts.length < 10) return null;
  const cells = parts.slice(1, -1).map((c) => c.trim());
  if (cells.length !== 8) return null;
  const [date, stockCode, mode, verdict, confidence, positionPct, fiveDay, notes] = cells;
  // skip header rows
  if (date === 'date' || /^-+$/.test(date)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{6}$/.test(stockCode)) return null;
  return {
    raw: line,
    date,
    stockCode,
    mode,
    verdict,
    confidence,
    positionPct,
    fiveDay,
    notes,
  };
}

export function formatRow(row: Row, newFiveDay: string): string {
  return `| ${row.date} | ${row.stockCode.padEnd(10)} | ${row.mode.padEnd(6)} | ${row.verdict.padEnd(7)} | ${row.confidence.padStart(10)} | ${row.positionPct.padStart(8)} | ${newFiveDay.padEnd(12)} | ${row.notes} |`;
}

export function computeDirection(
  decisionDate: string,
  klines: KLine[],
): Direction | null {
  // klines 期望按 date 升序
  const sorted = [...klines].sort((a, b) => a.date.localeCompare(b.date));
  // 找决策日当天或之后第一个交易日
  const idx = sorted.findIndex((k) => k.date >= decisionDate);
  if (idx === -1) return null;
  const targetIdx = idx + TRADING_DAYS_AHEAD;
  if (targetIdx >= sorted.length) return null;
  const decisionDay = sorted[idx];
  const target = sorted[targetIdx];
  if (!decisionDay.close || decisionDay.close <= 0) return null;
  const pct = ((target.close - decisionDay.close) / decisionDay.close) * 100;
  if (pct > FIVE_DAY_UP_THRESHOLD) return 'up';
  if (pct < FIVE_DAY_DOWN_THRESHOLD) return 'down';
  return 'flat';
}

const DIR_LABEL: Record<Direction, string> = {
  up: '↑ up',
  down: '↓ down',
  flat: '~ flat',
};

/** verdict 与方向是否一致 (hold 永远视为 hit). */
export function isVerdictHit(verdict: string, dir: Direction): boolean {
  if (verdict === 'hold') return true; // 没卖也没买, 永远算对
  if (verdict === 'buy') return dir === 'up';
  if (verdict === 'sell' || verdict === 'avoid') return dir === 'down' || dir === 'flat';
  return false;
}

// ---- Main ----

interface BackfillStats {
  total: number;
  filled: number;
  skippedAlreadyFilled: number;
  skippedNoData: number;
  errors: number;
  byMode: Record<string, { total: number; hit: number; up: number; down: number; flat: number }>;
}

function initStats(): BackfillStats {
  return {
    total: 0,
    filled: 0,
    skippedAlreadyFilled: 0,
    skippedNoData: 0,
    errors: 0,
    byMode: {},
  };
}

async function backfillFile(
  filePath: string,
  options: { write: boolean },
  stats: BackfillStats,
): Promise<void> {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n');
  const updatedLines: string[] = [];

  // Cache kline per (stockCode, fetchDate) 避免同一只股票多次拉取
  const klineCache = new Map<string, KLine[]>();

  for (const line of lines) {
    const row = parseRow(line);
    if (!row) {
      updatedLines.push(line);
      continue;
    }
    stats.total++;

    if (row.fiveDay && row.fiveDay !== '') {
      stats.skippedAlreadyFilled++;
      updatedLines.push(line);
      // 仍然统计已填行 (用于胜率)
      tallyHit(stats, row, parseDirFromLabel(row.fiveDay));
      continue;
    }

    let klines: KLine[];
    if (klineCache.has(row.stockCode)) {
      klines = klineCache.get(row.stockCode)!;
    } else {
      try {
        klines = await fetchKLine(row.stockCode, KLINE_DAYS, {
          retries: 2,
          timeoutMs: 8000,
          period: 'daily',
        });
        klineCache.set(row.stockCode, klines);
      } catch (err) {
        if (err instanceof UpstreamUnavailableError) {
          console.error(`  [${row.stockCode}] 上游不可达, 跳过`);
        } else {
          console.error(`  [${row.stockCode}] fetch 失败:`, (err as Error).message);
        }
        stats.errors++;
        updatedLines.push(line);
        continue;
      }
    }

    const dir = computeDirection(row.date, klines);
    if (!dir) {
      stats.skippedNoData++;
      console.log(`  [${row.stockCode} @ ${row.date}] 数据不足 5 交易日, 跳过`);
      updatedLines.push(line);
      continue;
    }

    const label = DIR_LABEL[dir];
    const newLine = formatRow(row, label);
    updatedLines.push(newLine);
    stats.filled++;
    tallyHit(stats, row, dir);
    console.log(`  [${row.stockCode} @ ${row.date}] ${row.mode}/${row.verdict} → ${label}`);
  }

  if (options.write) {
    const newContent = updatedLines.join('\n');
    if (newContent !== content) {
      await fs.writeFile(filePath, newContent, 'utf8');
      console.log(`✏  written: ${filePath}`);
    } else {
      console.log(`(no change: ${filePath})`);
    }
  }
}

function parseDirFromLabel(label: string): Direction | null {
  if (label.includes('up')) return 'up';
  if (label.includes('down')) return 'down';
  if (label.includes('flat')) return 'flat';
  return null;
}

function tallyHit(stats: BackfillStats, row: Row, dir: Direction | null): void {
  if (!dir) return;
  if (!stats.byMode[row.mode]) {
    stats.byMode[row.mode] = { total: 0, hit: 0, up: 0, down: 0, flat: 0 };
  }
  const m = stats.byMode[row.mode];
  m.total++;
  m[dir]++;
  if (isVerdictHit(row.verdict, dir)) m.hit++;
}

function printSummary(stats: BackfillStats): void {
  console.log('\n═══════════════ Summary ═══════════════');
  console.log(`total rows: ${stats.total}`);
  console.log(`filled:     ${stats.filled}`);
  console.log(`already:    ${stats.skippedAlreadyFilled}`);
  console.log(`no-data:    ${stats.skippedNoData}`);
  console.log(`errors:     ${stats.errors}`);
  console.log('');
  console.log('方向胜率 (verdict 与 5d 走势一致比例):');
  for (const [mode, s] of Object.entries(stats.byMode)) {
    if (s.total === 0) continue;
    const rate = ((s.hit / s.total) * 100).toFixed(1);
    console.log(
      `  ${mode.padEnd(6)} → 命中 ${s.hit}/${s.total} (${rate}%)  [up ${s.up} / down ${s.down} / flat ${s.flat}]`,
    );
  }
  console.log('═════════════════════════════════════');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const fileArgIdx = args.indexOf('--file');
  const specificFile = fileArgIdx !== -1 ? args[fileArgIdx + 1] : null;

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const validationDir = resolve(__dirname, '..', '..', '..', 'docs', 'validation');

  let files: string[];
  if (specificFile) {
    files = [resolve(process.cwd(), specificFile)];
  } else {
    try {
      const entries = await fs.readdir(validationDir);
      files = entries
        .filter((f) => f.startsWith('swarm-vs-single-') && f.endsWith('.md'))
        .map((f) => join(validationDir, f));
    } catch {
      console.error(`validation 目录不存在: ${validationDir}`);
      console.error('请先跑几次 swarm 让 C3 writer 自动创建文件.');
      process.exit(1);
    }
  }

  if (files.length === 0) {
    console.log('没有找到 validation 文件. 先跑几次 swarm (POST /api/swarm/runs).');
    return;
  }

  console.log(`Mode: ${write ? '✏ write' : '👁 dry-run (加 --write 实际写回)'}`);
  console.log(`Files: ${files.length}`);
  console.log('');

  const stats = initStats();
  for (const f of files) {
    console.log(`▶ ${f}`);
    try {
      await backfillFile(f, { write }, stats);
    } catch (err) {
      console.error(`  ${(err as Error).message}`);
      stats.errors++;
    }
  }

  printSummary(stats);
}

// 仅作为 script 运行时执行 main; vitest import 时不执行
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('backfill-validation.ts') ||
  process.argv[1]?.endsWith('backfill-validation.js')
) {
  main().catch((err) => {
    console.error('❌ backfill 失败:', err);
    process.exit(1);
  });
}
