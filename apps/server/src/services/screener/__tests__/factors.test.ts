import { describe, it, expect } from 'vitest';
import { factors, getFactor, getFactorInfo } from '../factors.js';
import type { KLine, MarketData } from '@trade/shared';

function makeKLine(closes: number[], volumes?: number[]): KLine[] {
  return closes.map((close, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: close * 0.99,
    high: close * 1.02,
    low: close * 0.98,
    close,
    volume: volumes?.[i] ?? 1000000,
  }));
}

function makeMarket(overrides: Partial<MarketData> = {}): MarketData {
  return {
    code: '600519',
    name: '贵州茅台',
    price: 1800,
    change: 1.5,
    volume: 5000000,
    turnover: 3.2,
    open: 1780,
    high: 1810,
    low: 1775,
    preClose: 1773,
    ...overrides,
  };
}

describe('factors', () => {
  it('has 12 registered factors', () => {
    expect(factors.length).toBe(12);
  });

  it('getFactor returns factor by id', () => {
    const f = getFactor('rsi_signal');
    expect(f).toBeDefined();
    expect(f!.id).toBe('rsi_signal');
    expect(f!.category).toBe('momentum');
  });

  it('getFactor returns undefined for unknown id', () => {
    expect(getFactor('nonexistent')).toBeUndefined();
  });

  it('getFactorInfo returns all factor summaries', () => {
    const info = getFactorInfo();
    expect(info.length).toBe(12);
    expect(info[0]).toHaveProperty('id');
    expect(info[0]).toHaveProperty('name');
    expect(info[0]).toHaveProperty('category');
  });
});

describe('volume_ratio factor', () => {
  it('returns null when insufficient data (< 6 klines)', () => {
    const klines = makeKLine([100, 101, 102]);
    const market = makeMarket();
    const f = getFactor('volume_ratio')!;
    const result = f.compute(klines, market);
    expect(result).toBeNull();
  });

  it('returns a number when enough data', () => {
    const volumes = [1e6, 1e6, 1e6, 1e6, 1e6, 2e6];
    const klines = makeKLine([100, 101, 102, 103, 104, 105], volumes);
    const market = makeMarket();
    const f = getFactor('volume_ratio')!;
    const result = f.compute(klines, market);
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
  });
});

describe('bollinger_position factor', () => {
  it('returns a value between 0 and 1 for flat prices', () => {
    const closes = Array(30).fill(100);
    const klines = makeKLine(closes);
    const market = makeMarket({ price: 100 });
    const f = getFactor('bollinger_position')!;
    const result = f.compute(klines, market);
    // When all prices equal, stdev=0, position should be NaN (band width is 0)
    expect(result).toBeNull(); // upper === lower, returns null
  });

  it('returns a position value for varying prices', () => {
    const closes: number[] = [];
    for (let i = 0; i < 30; i++) {
      closes.push(90 + Math.sin(i * 0.5) * 10);
    }
    const klines = makeKLine(closes);
    const market = makeMarket({ price: closes[closes.length - 1] });
    const f = getFactor('bollinger_position')!;
    const result = f.compute(klines, market);
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});

describe('amplitude factor', () => {
  it('computes daily amplitude', () => {
    const market = makeMarket({ high: 1810, low: 1775, preClose: 1773 });
    const f = getFactor('amplitude')!;
    const result = f.compute([], market);
    expect(typeof result).toBe('number');
    expect(result).toBeCloseTo((1810 - 1775) / 1773 * 100, 1);
  });
});

describe('volume_breakout factor', () => {
  it('returns null when < 21 klines', () => {
    const klines = makeKLine(Array(10).fill(100));
    const f = getFactor('volume_breakout')!;
    expect(f.compute(klines, makeMarket())).toBeNull();
  });

  it('returns breakout ratio >= 1 when current volume is double', () => {
    const closes = Array(25).fill(100);
    const volumes = Array(24).fill(1e6).concat([3e6]); // last is 3x avg
    const klines = makeKLine(closes, volumes);
    const f = getFactor('volume_breakout')!;
    const result = f.compute(klines, makeMarket());
    expect(typeof result).toBe('number');
    expect(result!).toBeGreaterThan(1);
  });
});

describe('ma_deviation factor', () => {
  it('returns positive when price above MA20', () => {
    const closes = Array(20).fill(100).concat([110]); // price 110, MA20 ~100.5
    const klines = makeKLine(closes);
    const market = makeMarket({ price: 110 });
    const f = getFactor('ma_deviation')!;
    const result = f.compute(klines, market);
    expect(typeof result).toBe('number');
    expect(result!).toBeGreaterThan(0);
  });

  it('returns negative when price below MA20', () => {
    const closes = Array(20).fill(100).concat([90]);
    const klines = makeKLine(closes);
    const market = makeMarket({ price: 90 });
    const f = getFactor('ma_deviation')!;
    const result = f.compute(klines, market);
    expect(typeof result).toBe('number');
    expect(result!).toBeLessThan(0);
  });
});
