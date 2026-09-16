import type { KLine, KlinePeriod } from '@trade/shared';

export type TechnicalTone = 'bullish' | 'bearish' | 'neutral';

export interface TechnicalPoint {
  date: string;
  close: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  bollUpper: number | null;
  bollMiddle: number | null;
  bollLower: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
}

export interface TimeframeSnapshot {
  period: KlinePeriod;
  close: number;
  changePct: number;
  trend: TechnicalTone;
  momentum: TechnicalTone;
  volume: TechnicalTone;
  risk: TechnicalTone;
  overall: TechnicalTone;
  rsi: number | null;
  volumeRatio: number | null;
  atr: number | null;
  atrPct: number | null;
  support: number;
  resistance: number;
  ma20: number | null;
  ma60: number | null;
  macdHistogram: number | null;
}

export function buildTechnicalSeries(klines: KLine[]): TechnicalPoint[] {
  if (klines.length === 0) return [];
  const closes = klines.map((item) => item.close);
  const ma5 = sma(closes, 5);
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const rsi = rsiSeries(closes, 14);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macd = closes.map((_, index) => ema12[index] - ema26[index]);
  const macdSignal = ema(macd, 9);

  return klines.map((item, index) => {
    const boll = rollingBands(closes, index, 20);
    return {
      date: item.date,
      close: item.close,
      ma5: ma5[index],
      ma20: ma20[index],
      ma60: ma60[index],
      bollUpper: boll?.upper ?? null,
      bollMiddle: boll?.middle ?? null,
      bollLower: boll?.lower ?? null,
      rsi: rsi[index],
      macd: macd[index],
      macdSignal: macdSignal[index],
      macdHistogram: macd[index] - macdSignal[index],
    };
  });
}

export function summarizeTimeframe(period: KlinePeriod, klines: KLine[]): TimeframeSnapshot | null {
  if (klines.length < 2) return null;
  const series = buildTechnicalSeries(klines);
  const current = series.at(-1)!;
  const previous = klines.at(-2)!;
  const recent = klines.slice(-20);
  const support = Math.min(...recent.map((item) => item.low));
  const resistance = Math.max(...recent.map((item) => item.high));
  const atr = averageTrueRange(klines, 14);
  const averageVolume = average(klines.slice(-21, -1).map((item) => item.volume));
  const volumeRatio = averageVolume > 0 ? klines.at(-1)!.volume / averageVolume : null;

  const trendScore = score([
    compare(current.close, current.ma20),
    compare(current.ma20, current.ma60),
    slope(series.map((item) => item.ma20)),
  ]);
  const momentumScore = score([
    current.rsi == null ? 0 : current.rsi >= 55 && current.rsi < 75 ? 1 : current.rsi < 45 ? -1 : 0,
    compare(current.macdHistogram, 0),
  ]);
  const volumeScore = volumeRatio == null ? 0 : volumeRatio >= 1.2 ? 1 : volumeRatio < 0.7 ? -1 : 0;
  const atrPct = atr == null || current.close === 0 ? null : (atr / current.close) * 100;
  const riskScore = atrPct == null ? 0 : atrPct > 5 ? -1 : atrPct < 1.2 ? 1 : 0;
  const overallScore = trendScore * 2 + momentumScore + volumeScore + riskScore;

  return {
    period,
    close: current.close,
    changePct: previous.close === 0 ? 0 : ((current.close - previous.close) / previous.close) * 100,
    trend: tone(trendScore),
    momentum: tone(momentumScore),
    volume: tone(volumeScore),
    risk: tone(riskScore),
    overall: tone(overallScore),
    rsi: current.rsi,
    volumeRatio,
    atr,
    atrPct,
    support,
    resistance,
    ma20: current.ma20,
    ma60: current.ma60,
    macdHistogram: current.macdHistogram,
  };
}

function sma(values: number[], period: number): Array<number | null> {
  let total = 0;
  return values.map((value, index) => {
    total += value;
    if (index >= period) total -= values[index - period];
    return index >= period - 1 ? total / period : null;
  });
}

function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const multiplier = 2 / (period + 1);
  const output = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    output.push((values[index] - output[index - 1]) * multiplier + output[index - 1]);
  }
  return output;
}

function rsiSeries(values: number[], period: number): Array<number | null> {
  const output: Array<number | null> = values.map(() => null);
  if (values.length <= period) return output;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  output[period] = toRsi(averageGain, averageLoss);
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    output[index] = toRsi(averageGain, averageLoss);
  }
  return output;
}

function toRsi(averageGain: number, averageLoss: number): number {
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

function rollingBands(values: number[], index: number, period: number) {
  if (index < period - 1) return null;
  const window = values.slice(index - period + 1, index + 1);
  const middle = average(window);
  const variance = average(window.map((value) => (value - middle) ** 2));
  const deviation = Math.sqrt(variance);
  return { middle, upper: middle + deviation * 2, lower: middle - deviation * 2 };
}

function averageTrueRange(klines: KLine[], period: number): number | null {
  if (klines.length < 2) return null;
  const ranges = klines.slice(1).map((item, index) => {
    const previousClose = klines[index].close;
    return Math.max(item.high - item.low, Math.abs(item.high - previousClose), Math.abs(item.low - previousClose));
  });
  return average(ranges.slice(-period));
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function compare(left: number | null, right: number | null): number {
  if (left == null || right == null) return 0;
  const tolerance = Math.max(Math.abs(right) * 0.002, Number.EPSILON);
  if (left > right + tolerance) return 1;
  if (left < right - tolerance) return -1;
  return 0;
}

function slope(values: Array<number | null>): number {
  const valid = values.filter((value): value is number => value != null);
  if (valid.length < 6) return 0;
  return compare(valid.at(-1)!, valid.at(-6)!);
}

function score(items: number[]): number {
  return items.reduce((sum, value) => sum + value, 0);
}

function tone(value: number): TechnicalTone {
  if (value > 0) return 'bullish';
  if (value < 0) return 'bearish';
  return 'neutral';
}
