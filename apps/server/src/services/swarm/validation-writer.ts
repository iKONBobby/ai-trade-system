// Validation writer (C3): 每次 swarm 完成 append 一行到季度 markdown 文件.
//
// 文件路径: docs/validation/swarm-vs-single-{year}Q{n}.md (例如 2026Q2.md)
// 季度切换自动创建新文件 + 写表头.
//
// 字段: date | stock_code | mode | verdict | confidence | position | 5d_direction | notes
// 5d_direction 由人工后续填 (3 周后回填), MVP 不自动化.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { MarketData, PortfolioManagerOutput } from '@trade/shared';

export type RecordMode = 'single' | 'swarm';

export interface ValidationEntry {
  date: string; // ISO 日期 (YYYY-MM-DD)
  stockCode: string;
  mode: RecordMode;
  verdict: string;
  confidence: number;
  positionPct: number;
  notes?: string;
}

const TABLE_HEADER = [
  '# Swarm vs Single 决策对照表',
  '',
  '> 每次跑 swarm 或 single 自动 append. 5d_direction 由用户在 5 交易日后人工填.',
  '> design doc Success Criteria — Outcome Validation.',
  '',
  '| date       | stock_code | mode   | verdict | confidence | position | 5d_direction | notes |',
  '|------------|------------|--------|---------|------------|----------|--------------|-------|',
].join('\n');

function quarterKey(d: Date): string {
  const year = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${year}Q${q}`;
}

function formatRow(entry: ValidationEntry): string {
  return `| ${entry.date} | ${entry.stockCode.padEnd(10)} | ${entry.mode.padEnd(6)} | ${entry.verdict.padEnd(7)} | ${String(entry.confidence).padStart(10)} | ${String(entry.positionPct).padStart(8)} |              | ${entry.notes ?? ''} |`;
}

export class ValidationWriter {
  constructor(
    private readonly baseDir: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 文件路径 (供测试 introspect) */
  filePath(date: Date = this.now()): string {
    return join(this.baseDir, `swarm-vs-single-${quarterKey(date)}.md`);
  }

  async record(entry: ValidationEntry): Promise<void> {
    const date = new Date(entry.date);
    const path = this.filePath(isNaN(date.getTime()) ? this.now() : date);

    // 文件不存在 → 创建带表头
    let needsHeader = false;
    try {
      await fs.access(path);
    } catch {
      needsHeader = true;
    }

    if (needsHeader) {
      await fs.mkdir(this.baseDir, { recursive: true });
      await fs.writeFile(path, TABLE_HEADER + '\n', 'utf8');
    }

    await fs.appendFile(path, formatRow(entry) + '\n', 'utf8');
  }

  /** 从 PM verdict 构造 entry — 调用端常用 helper. */
  static fromVerdict(args: {
    market: MarketData;
    verdict: PortfolioManagerOutput;
    mode: RecordMode;
    notes?: string;
    date?: Date;
  }): ValidationEntry {
    const d = args.date ?? new Date();
    return {
      date: d.toISOString().slice(0, 10),
      stockCode: args.market.code,
      mode: args.mode,
      verdict: args.verdict.verdict,
      confidence: args.verdict.confidence,
      positionPct: args.verdict.position_size_pct,
      notes: args.notes,
    };
  }
}
