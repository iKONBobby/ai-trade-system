import type { KLine, BollingerResult, MAResult, RSIResult, MACDResult, KDJResult, WRResult } from '@trade/shared';

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
 * Calculate Exponential Moving Average.
 */
export function calcEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(data[i]);
    } else if (i < period - 1) {
      result.push(NaN);
    } else if (!isNaN(result[i - 1])) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    } else {
      // First valid EMA uses SMA as seed
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j];
      }
      result.push(sum / period);
    }
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

  const initial = trValues.slice(0, period);
  const initialSum = initial.reduce((a, b) => a + b, 0);
  let atr = initialSum / initial.length;

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

// ---- New indicators ----

/**
 * Calculate RSI (Relative Strength Index, Wilder's smoothing).
 * RSI > 70 = overbought, < 30 = oversold.
 */
export function calcRSI(klines: KLine[], period = 14): RSIResult | null {
  if (klines.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    changes.push(klines[i].close - klines[i - 1].close);
  }

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average over first `period` changes
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining values
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  const signal: RSIResult['signal'] = rsi >= 70 ? 'overbought' : rsi <= 30 ? 'oversold' : 'neutral';

  return { value: Math.round(rsi * 100) / 100, signal };
}

/**
 * Calculate MACD (12/26/9).
 * DIF = EMA12 - EMA26, DEA = EMA9(DIF), Histogram = 2 * (DIF - DEA).
 */
export function calcMACD(klines: KLine[]): MACDResult | null {
  if (klines.length < 33) return null;

  const closes = klines.map((k) => k.close);
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);

  // DIF starts where both EMAs are valid (index 25 = 26th bar)
  const difSeries: number[] = [];
  const startIdx = 25; // EMA26 needs 26 bars
  for (let i = startIdx; i < closes.length; i++) {
    difSeries.push(ema12[i] - ema26[i]);
  }

  // DEA = EMA9 of DIF values (needs 9 DIF values, i.e. 8 more indices)
  const deaSeries = calcEMA(difSeries, 9);

  const lastDIF = difSeries[difSeries.length - 1] ?? 0;
  const lastDEA = deaSeries[deaSeries.length - 1] ?? 0;
  const histogram = 2 * (lastDIF - lastDEA);

  const prevDIF = difSeries[difSeries.length - 2] ?? lastDIF;
  const prevDEA = deaSeries[deaSeries.length - 2] ?? lastDEA;

  const wasBelow = prevDIF <= prevDEA;
  const nowAbove = lastDIF > lastDEA;
  const wasAbove = prevDIF > prevDEA;
  const nowBelow = lastDIF <= lastDEA;

  let signal: MACDResult['signal'] = 'neutral';
  if (wasBelow && nowAbove) signal = 'golden_cross';
  else if (wasAbove && nowBelow) signal = 'death_cross';
  else if (histogram > 0) signal = 'bullish';
  else signal = 'bearish';

  return {
    dif: Math.round(lastDIF * 100) / 100,
    dea: Math.round(lastDEA * 100) / 100,
    histogram: Math.round(histogram * 100) / 100,
    signal,
  };
}

/**
 * Calculate KDJ (Stochastic, period=9).
 * K > 80 = overbought, K < 20 = oversold.
 */
export function calcKDJ(klines: KLine[], period = 9): KDJResult | null {
  if (klines.length < period) return null;

  const len = klines.length;
  const kValues: number[] = [];
  const dValues: number[] = [];
  let prevK = 50;
  let prevD = 50;

  for (let i = period - 1; i < len; i++) {
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (klines[j].high > highestHigh) highestHigh = klines[j].high;
      if (klines[j].low < lowestLow) lowestLow = klines[j].low;
    }

    const close = klines[i].close;
    const range = highestHigh - lowestLow;
    const rsv = range === 0 ? 50 : ((close - lowestLow) / range) * 100;

    const k = (2 / 3) * prevK + (1 / 3) * rsv;
    const d = (2 / 3) * prevD + (1 / 3) * k;
    const j = 3 * k - 2 * d;

    kValues.push(k);
    dValues.push(d);
    prevK = k;
    prevD = d;
  }

  const finalK = kValues[kValues.length - 1] ?? 50;
  const finalD = dValues[dValues.length - 1] ?? 50;
  const finalJ = 3 * finalK - 2 * finalD;

  const signal: KDJResult['signal'] = finalK >= 80 ? 'overbought' : finalK <= 20 ? 'oversold' : 'neutral';

  return {
    k: Math.round(finalK * 100) / 100,
    d: Math.round(finalD * 100) / 100,
    j: Math.round(finalJ * 100) / 100,
    signal,
  };
}

/**
 * Calculate Williams %R.
 * %R > -20 = overbought, %R < -80 = oversold.
 */
export function calcWR(klines: KLine[], period = 14): WRResult | null {
  if (klines.length < period) return null;

  const len = klines.length;
  let highestHigh = -Infinity;
  let lowestLow = Infinity;

  for (let i = len - period; i < len; i++) {
    if (klines[i].high > highestHigh) highestHigh = klines[i].high;
    if (klines[i].low < lowestLow) lowestLow = klines[i].low;
  }

  const close = klines[len - 1].close;
  const range = highestHigh - lowestLow;
  const wr = range === 0 ? -50 : ((highestHigh - close) / range) * -100;

  const signal: WRResult['signal'] = wr >= -20 ? 'overbought' : wr <= -80 ? 'oversold' : 'neutral';

  return { value: Math.round(wr * 100) / 100, signal };
}

/**
 * Calculate daily amplitude.
 */
export function calcAmplitude(high: number, low: number, preClose: number): number {
  if (preClose === 0) return 0;
  return Math.round(((high - low) / preClose) * 10000) / 100;
}

/**
 * Calculate volume ratio (current volume / 5-day average volume).
 */
export function calcVolumeRatio(klines: KLine[]): number | null {
  if (klines.length < 6) return null;

  const current = klines[klines.length - 1].volume;
  let sum = 0;
  for (let i = klines.length - 6; i < klines.length - 1; i++) {
    sum += klines[i].volume;
  }
  const avg = sum / 5;
  if (avg === 0) return null;

  return Math.round((current / avg) * 100) / 100;
}

/**
 * Calculate distance to A-share limit up/down (10% for most stocks).
 */
export function calcLimitDistance(price: number, preClose: number): { up: number; down: number } {
  if (preClose === 0) return { up: 0, down: 0 };
  const limitUp = preClose * 1.1;
  const limitDown = preClose * 0.9;
  return {
    up: Math.round(((limitUp - price) / price) * 10000) / 100,
    down: Math.round(((price - limitDown) / price) * 10000) / 100,
  };
}

/**
 * Determine MA arrangement.
 */
export function calcMAArrangement(ma: MAResult): 'bullish_alignment' | 'bearish_alignment' | 'crossed' {
  if (ma.ma5 > ma.ma20 && ma.ma20 > ma.ma60) return 'bullish_alignment';
  if (ma.ma5 < ma.ma20 && ma.ma20 < ma.ma60) return 'bearish_alignment';
  return 'crossed';
}
