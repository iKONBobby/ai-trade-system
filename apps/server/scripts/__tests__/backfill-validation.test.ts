import { describe, it, expect } from 'vitest';
import type { KLine } from '@trade/shared';
import {
  parseRow,
  formatRow,
  computeDirection,
  isVerdictHit,
} from '../backfill-validation.js';

// ---- parseRow ----

describe('parseRow', () => {
  it('合规行 → 返回 8 字段', () => {
    const line =
      '| 2026-05-14 | 600519     | swarm  | buy     |         78 |       35 |              | 备注 |';
    const row = parseRow(line);
    expect(row).not.toBeNull();
    expect(row).toMatchObject({
      date: '2026-05-14',
      stockCode: '600519',
      mode: 'swarm',
      verdict: 'buy',
      confidence: '78',
      positionPct: '35',
      fiveDay: '',
      notes: '备注',
    });
  });

  it('已填 5d_direction 也能解析', () => {
    const line =
      '| 2026-05-14 | 600519     | swarm  | buy     |         78 |       35 | ↑ up         | x |';
    const row = parseRow(line);
    expect(row?.fiveDay).toBe('↑ up');
  });

  it('表头行返回 null', () => {
    expect(
      parseRow('| date       | stock_code | mode   | verdict | confidence | position | 5d_direction | notes |'),
    ).toBeNull();
  });

  it('分隔行返回 null', () => {
    expect(
      parseRow('|------------|------------|--------|---------|------------|----------|--------------|-------|'),
    ).toBeNull();
  });

  it('非 markdown 表行返回 null', () => {
    expect(parseRow('# Header text')).toBeNull();
    expect(parseRow('')).toBeNull();
    expect(parseRow('plain text')).toBeNull();
  });

  it('date 格式错误返回 null', () => {
    const line =
      '| 14-05-2026 | 600519     | swarm  | buy     |         78 |       35 |              | x |';
    expect(parseRow(line)).toBeNull();
  });

  it('stockCode 非 6 位数字返回 null', () => {
    const line =
      '| 2026-05-14 | abc        | swarm  | buy     |         78 |       35 |              | x |';
    expect(parseRow(line)).toBeNull();
  });
});

// ---- formatRow ----

describe('formatRow', () => {
  it('重新生成行 + 填入 5d_direction', () => {
    const line =
      '| 2026-05-14 | 600519     | swarm  | buy     |         78 |       35 |              | 备注 |';
    const row = parseRow(line)!;
    const out = formatRow(row, '↑ up');
    expect(out).toContain('| 2026-05-14 ');
    expect(out).toContain('| 600519     ');
    expect(out).toContain('| swarm  ');
    expect(out).toContain('| buy     ');
    expect(out).toContain('| ↑ up         ');
    expect(out).toContain('| 备注 |');
    // 反 parse 能 round-trip
    const reparsed = parseRow(out)!;
    expect(reparsed.fiveDay).toBe('↑ up');
  });
});

// ---- computeDirection ----

function mkKline(date: string, close: number): KLine {
  return { date, open: close, high: close, low: close, close, volume: 100 };
}

describe('computeDirection', () => {
  it('5 交易日后涨 >1% → up', () => {
    const klines: KLine[] = [
      mkKline('2026-05-08', 1600),
      mkKline('2026-05-11', 1605),
      mkKline('2026-05-12', 1610),
      mkKline('2026-05-13', 1615),
      mkKline('2026-05-14', 1620),
      mkKline('2026-05-15', 1640),
      mkKline('2026-05-16', 1700),
      // 决策 = 2026-05-08, +5 交易日 = 2026-05-15
      // 1640 vs 1600 = +2.5% → up
    ];
    expect(computeDirection('2026-05-08', klines)).toBe('up');
  });

  it('5 交易日后跌 <-1% → down', () => {
    const klines: KLine[] = [
      mkKline('2026-05-08', 1600),
      mkKline('2026-05-11', 1595),
      mkKline('2026-05-12', 1590),
      mkKline('2026-05-13', 1585),
      mkKline('2026-05-14', 1580),
      mkKline('2026-05-15', 1560), // -2.5% from 1600
    ];
    expect(computeDirection('2026-05-08', klines)).toBe('down');
  });

  it('-1% ~ 1% → flat', () => {
    const klines: KLine[] = [
      mkKline('2026-05-08', 1600),
      mkKline('2026-05-11', 1600),
      mkKline('2026-05-12', 1600),
      mkKline('2026-05-13', 1600),
      mkKline('2026-05-14', 1600),
      mkKline('2026-05-15', 1608), // +0.5%
    ];
    expect(computeDirection('2026-05-08', klines)).toBe('flat');
  });

  it('数据不足 5 交易日 → null', () => {
    const klines: KLine[] = [
      mkKline('2026-05-08', 1600),
      mkKline('2026-05-11', 1605),
      mkKline('2026-05-12', 1610),
    ];
    expect(computeDirection('2026-05-08', klines)).toBeNull();
  });

  it('决策日没在 kline 范围内 → null', () => {
    const klines: KLine[] = [
      mkKline('2026-06-01', 1600),
      mkKline('2026-06-02', 1610),
    ];
    expect(computeDirection('2026-05-08', klines)).toBeNull();
  });

  it('决策日 weekend (周六), 自动用下一交易日为基准', () => {
    // 假设 2026-05-09 是周六, 下一交易日 2026-05-11 (周一)
    const klines: KLine[] = [
      mkKline('2026-05-08', 1500), // 周五, < decision
      mkKline('2026-05-11', 1600), // 周一, 自动选这个 (date >= '2026-05-09')
      mkKline('2026-05-12', 1605),
      mkKline('2026-05-13', 1610),
      mkKline('2026-05-14', 1615),
      mkKline('2026-05-15', 1620),
      mkKline('2026-05-18', 1640), // +5 交易日 from 5-11
    ];
    expect(computeDirection('2026-05-09', klines)).toBe('up');
  });

  it('kline 乱序也能处理 (内部排序)', () => {
    const klines: KLine[] = [
      mkKline('2026-05-15', 1620),
      mkKline('2026-05-08', 1600),
      mkKline('2026-05-12', 1610),
      mkKline('2026-05-11', 1605),
      mkKline('2026-05-14', 1618),
      mkKline('2026-05-13', 1615),
    ];
    expect(computeDirection('2026-05-08', klines)).toBe('up');
  });
});

// ---- isVerdictHit ----

describe('isVerdictHit', () => {
  it('buy + up = hit', () => {
    expect(isVerdictHit('buy', 'up')).toBe(true);
  });

  it('buy + down = miss', () => {
    expect(isVerdictHit('buy', 'down')).toBe(false);
  });

  it('buy + flat = miss', () => {
    expect(isVerdictHit('buy', 'flat')).toBe(false);
  });

  it('sell + down = hit', () => {
    expect(isVerdictHit('sell', 'down')).toBe(true);
  });

  it('sell + flat = hit (不亏即胜)', () => {
    expect(isVerdictHit('sell', 'flat')).toBe(true);
  });

  it('sell + up = miss', () => {
    expect(isVerdictHit('sell', 'up')).toBe(false);
  });

  it('avoid + down/flat = hit', () => {
    expect(isVerdictHit('avoid', 'down')).toBe(true);
    expect(isVerdictHit('avoid', 'flat')).toBe(true);
  });

  it('avoid + up = miss', () => {
    expect(isVerdictHit('avoid', 'up')).toBe(false);
  });

  it('hold 永远算 hit (没买没卖)', () => {
    expect(isVerdictHit('hold', 'up')).toBe(true);
    expect(isVerdictHit('hold', 'down')).toBe(true);
    expect(isVerdictHit('hold', 'flat')).toBe(true);
  });

  it('未知 verdict → miss', () => {
    expect(isVerdictHit('unknown', 'up')).toBe(false);
  });
});
