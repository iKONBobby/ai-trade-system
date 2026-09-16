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
  it('has 29 registered factors', () => {
    expect(factors.length).toBe(29);
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
    expect(info.length).toBe(29);
    expect(info[0]).toHaveProperty('id');
    expect(info[0]).toHaveProperty('name');
    expect(info[0]).toHaveProperty('category');
  });
});

describe('categorical factors', () => {
  it('preserves bullish, bearish, and crossed MA states', () => {
    const bullish = makeKLine(Array.from({ length: 60 }, (_, i) => i + 1));
    const bearish = makeKLine(Array.from({ length: 60 }, (_, i) => 60 - i));
    const crossed = makeKLine(Array(60).fill(100));
    const factor = getFactor('ma_arrangement')!;

    expect(factor.compute(bullish, makeMarket())).toBe('bullish_alignment');
    expect(factor.compute(bearish, makeMarket())).toBe('bearish_alignment');
    expect(factor.compute(crossed, makeMarket())).toBe('crossed');
  });

  it('does not collapse RSI overbought into oversold', () => {
    const rising = makeKLine(Array.from({ length: 30 }, (_, i) => 100 + i));
    const falling = makeKLine(Array.from({ length: 30 }, (_, i) => 130 - i));
    const factor = getFactor('rsi_signal')!;

    expect(factor.compute(rising, makeMarket())).toBe('overbought');
    expect(factor.compute(falling, makeMarket())).toBe('oversold');
  });

  it('does not collapse KDJ overbought into oversold', () => {
    const rising = makeKLine(Array.from({ length: 30 }, (_, i) => 100 + i));
    const falling = makeKLine(Array.from({ length: 30 }, (_, i) => 130 - i));
    const factor = getFactor('kdj_signal')!;

    expect(factor.compute(rising, makeMarket())).toBe('overbought');
    expect(factor.compute(falling, makeMarket())).toBe('oversold');
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

describe('multi-horizon factors', () => {
  it('detects board-aware upper limits', () => {
    const mainBoard = getFactor('upper_limit_status')!;
    expect(mainBoard.compute([], makeMarket({ code: '600519', preClose: 100, price: 110 }))).toBe(true);
    expect(mainBoard.compute([], makeMarket({ code: '300750', preClose: 100, price: 110 }))).toBe(false);
    expect(mainBoard.compute([], makeMarket({ code: '300750', preClose: 100, price: 120 }))).toBe(true);
  });

  it('computes medium-term return and volatility', () => {
    const closes = Array.from({ length: 80 }, (_, index) => 100 + index * 0.5);
    const klines = makeKLine(closes);
    expect(getFactor('return_20d')!.compute(klines, makeMarket())).toBeGreaterThan(0);
    expect(getFactor('return_60d')!.compute(klines, makeMarket())).toBeGreaterThan(0);
    expect(getFactor('volatility_20d')!.compute(klines, makeMarket())).toBeGreaterThanOrEqual(0);
  });

  it('computes long-trend and drawdown factors with 250 bars', () => {
    const closes = Array.from({ length: 260 }, (_, index) => 50 + index * 0.2);
    const klines = makeKLine(closes);
    expect(getFactor('above_ma200')!.compute(klines, makeMarket())).toBe(true);
    expect(getFactor('ma200_slope')!.compute(klines, makeMarket())).toBeGreaterThan(0);
    expect(getFactor('near_52w_high')!.compute(klines, makeMarket())).toBeGreaterThan(0.9);
    expect(getFactor('max_drawdown_250d')!.compute(klines, makeMarket())).toBe(0);
  });

  it('computes VCP trend and contraction factors', () => {
    const klines = makeKLine(Array.from({ length: 260 }, (_, index) => 50 + index * 0.2));
    for (const kline of klines.slice(-20, -5)) {
      kline.high = kline.close * 1.03;
      kline.low = kline.close * 0.97;
      kline.volume = 2_000_000;
    }
    for (const kline of klines.slice(-5)) {
      kline.high = kline.close * 1.01;
      kline.low = kline.close * 0.99;
      kline.volume = 1_000_000;
    }

    expect(getFactor('ma50_over_ma150_pct')!.compute(klines, makeMarket())).toBeGreaterThan(0);
    expect(getFactor('range_contraction_5_20')!.compute(klines, makeMarket())).toBeLessThan(0.75);
    expect(getFactor('volume_contraction_5_20')!.compute(klines, makeMarket())).toBeLessThan(0.9);
  });

  it('only reports a 60-day breakout when the latest close clears the prior range', () => {
    const breakout = makeKLine(Array(60).fill(100).concat([104]));
    const insideRange = makeKLine(Array(60).fill(100).concat([101]));

    expect(getFactor('breakout_60d_pct')!.compute(breakout, makeMarket())).toBeGreaterThan(0);
    expect(getFactor('breakout_60d_pct')!.compute(insideRange, makeMarket())).toBeLessThan(0);
  });

  it('reads RPS values from the scan-wide factor context', () => {
    const context = {
      crossSectionRanks: new Map([
        ['return_20d', new Map([['600519', 93]])],
        ['return_60d', new Map([['600519', 87]])],
      ]),
    };

    expect(getFactor('rps_20d')!.compute([], makeMarket(), context)).toBe(93);
    expect(getFactor('rps_60d')!.compute([], makeMarket(), context)).toBe(87);
    expect(getFactor('rps_20d')!.compute([], makeMarket({ code: '000001' }), context)).toBeNull();
  });
});
