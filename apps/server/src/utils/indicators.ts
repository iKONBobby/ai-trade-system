import type { KLine, BollingerResult, MAResult } from '@trade/shared';

/**
 * Calculate Simple Moving Average for a given period.
 */
export function calcMA(klines: KLine[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < klines.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += klines[j].close;
    }
    result.push(sum / period);
  }
  return result;
}

/**
 * Calculate Bollinger Bands.
 * Middle = SMA(period), Upper = middle + 2*std, Lower = middle - 2*std
 * Width = (4 * std) / middle
 */
export function calcBollinger(klines: KLine[], period = 20): BollingerResult {
  const closes = klines.map((k) => k.close);
  const len = closes.length;

  // Use as many bars as available (at most `period`)
  const slice = closes.slice(Math.max(0, len - period));
  const n = slice.length;
  const sum = slice.reduce((a, b) => a + b, 0);
  const middle = sum / n;

  const variance = slice.reduce((acc, val) => acc + (val - middle) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  const upper = middle + 2 * std;
  const lower = middle - 2 * std;
  const width = middle !== 0 ? (4 * std) / middle : 0;

  return { upper, middle, lower, width };
}

/**
 * Calculate Average True Range.
 */
export function calcATR(klines: KLine[], period = 14): number {
  const trValues: number[] = [];

  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trValues.push(tr);
  }

  if (trValues.length === 0) return 0;

  // First ATR is simple average of first `period` TRs
  const initial = trValues.slice(0, period);
  const initialSum = initial.reduce((a, b) => a + b, 0);
  let atr = initialSum / initial.length;

  // Remaining: smoothed ATR = (prevATR * (period - 1) + currentTR) / period
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
  }

  return atr;
}

/**
 * Calculate MA5, MA20, MA60 values (most recent value for each).
 */
export function calcMAValues(klines: KLine[]): MAResult {
  const closes = klines.map((k) => k.close);
  const len = closes.length;

  const safeSlice = (n: number) => {
    const start = Math.max(0, len - n);
    const slice = closes.slice(start);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  };

  return {
    ma5: len >= 5 ? safeSlice(5) : closes[closes.length - 1] ?? 0,
    ma20: len >= 20 ? safeSlice(20) : closes[closes.length - 1] ?? 0,
    ma60: len >= 60 ? safeSlice(60) : closes[closes.length - 1] ?? 0,
  };
}

/**
 * Find support (lowest low) and resistance (highest high) from recent bars.
 * Uses last 20 bars (or fewer if not enough data).
 */
export function findSupportResistance(klines: KLine[]): { support: number; resistance: number } {
  const lookback = Math.min(20, klines.length);
  const recent = klines.slice(klines.length - lookback);

  let support = Infinity;
  let resistance = -Infinity;

  for (const bar of recent) {
    if (bar.low < support) support = bar.low;
    if (bar.high > resistance) resistance = bar.high;
  }

  return { support, resistance };
}
