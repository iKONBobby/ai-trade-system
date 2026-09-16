import type { Factor } from './types.js';
import {
  calcRSI,
  calcMACD,
  calcKDJ,
  calcWR,
  calcAmplitude,
  calcVolumeRatio,
  calcLimitDistance,
  calcMAArrangement,
  calcBollinger,
  calcMAValues,
} from '../../utils/indicators.js';

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function trailingReturn(klines: { close: number }[], days: number): number | null {
  if (klines.length <= days) return null;
  const current = klines[klines.length - 1].close;
  const base = klines[klines.length - 1 - days].close;
  return base > 0 ? ((current / base) - 1) * 100 : null;
}

function realizedVolatility(klines: { close: number }[], days: number): number | null {
  if (klines.length <= days) return null;
  const closes = klines.slice(-(days + 1)).map((k) => k.close);
  const returns = closes.slice(1).map((close, i) => ((close / closes[i]) - 1) * 100);
  const mean = average(returns);
  const variance = average(returns.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function movingAverage(values: number[], days: number): number | null {
  if (values.length < days) return null;
  return average(values.slice(-days));
}

function averageRangePercent(
  klines: { high: number; low: number; close: number }[],
  start: number,
  end?: number,
): number | null {
  const window = klines.slice(start, end);
  if (window.length === 0) return null;
  const ranges = window
    .filter((kline) => kline.close > 0)
    .map((kline) => ((kline.high - kline.low) / kline.close) * 100);
  return ranges.length > 0 ? average(ranges) : null;
}

/** Board-aware upper-limit check. ST stocks are filtered before this runs. */
export function isAtUpperLimit(market: { code: string; price: number; preClose: number }): boolean {
  if (market.preClose <= 0) return false;
  const limitPct = market.code.startsWith('30') || market.code.startsWith('688') ? 20 : 10;
  const limitPrice = Math.round(market.preClose * (1 + limitPct / 100) * 100) / 100;
  return market.price >= limitPrice - 0.005;
}

export const factors: Factor[] = [
  {
    id: 'ma_arrangement',
    name: '均线排列',
    description: 'MA5/MA20/MA60 多头或空头排列',
    category: 'trend',
    compute(klines) {
      const ma = calcMAValues(klines);
      return calcMAArrangement(ma);
    },
  },
  {
    id: 'rsi_signal',
    name: 'RSI 信号',
    description: 'RSI(14) 超买(>70)或超卖(<30)',
    category: 'momentum',
    compute(klines) {
      const rsi = calcRSI(klines);
      if (!rsi) return null;
      return rsi.signal;
    },
  },
  {
    id: 'macd_signal',
    name: 'MACD 信号',
    description: 'MACD 金叉死叉判断',
    category: 'momentum',
    compute(klines) {
      const macd = calcMACD(klines);
      if (!macd) return null;
      return macd.signal;
    },
  },
  {
    id: 'macd_death_cross',
    name: 'MACD 死叉',
    description: 'MACD 死叉信号',
    category: 'momentum',
    compute(klines) {
      const macd = calcMACD(klines);
      if (!macd) return null;
      return macd.signal;
    },
  },
  {
    id: 'kdj_signal',
    name: 'KDJ 信号',
    description: 'KDJ 超买(>80)或超卖(<20)',
    category: 'momentum',
    compute(klines) {
      const kdj = calcKDJ(klines);
      if (!kdj) return null;
      return kdj.signal;
    },
  },
  {
    id: 'volume_ratio',
    name: '量比',
    description: '当日成交量 / 5日均量',
    category: 'volume',
    compute(klines) {
      return calcVolumeRatio(klines);
    },
  },
  {
    id: 'bollinger_position',
    name: '布林带位置',
    description: '价格在布林带中的相对位置 (0=下轨, 1=上轨)',
    category: 'volatility',
    compute(klines) {
      const bb = calcBollinger(klines);
      const price = klines[klines.length - 1]?.close ?? 0;
      if (bb.upper === bb.lower) return null;
      return (price - bb.lower) / (bb.upper - bb.lower);
    },
  },
  {
    id: 'amplitude',
    name: '振幅',
    description: '日内振幅百分比',
    category: 'volatility',
    compute(_klines, market) {
      return calcAmplitude(market.high, market.low, market.preClose);
    },
  },
  {
    id: 'volume_breakout',
    name: '放量突破',
    description: '成交量突破 20 日均量 1.5 倍以上',
    category: 'volume',
    compute(klines) {
      if (klines.length < 21) return null;
      const current = klines[klines.length - 1].volume;
      let sum = 0;
      for (let i = klines.length - 21; i < klines.length - 1; i++) {
        sum += klines[i].volume;
      }
      const avg20 = sum / 20;
      if (avg20 === 0) return null;
      return current / avg20;
    },
  },
  {
    id: 'ma_deviation',
    name: '均线偏离',
    description: '股价偏离 MA20 的百分比',
    category: 'trend',
    compute(klines) {
      const ma = calcMAValues(klines);
      const price = klines[klines.length - 1]?.close ?? 0;
      if (ma.ma20 === 0) return null;
      return ((price - ma.ma20) / ma.ma20) * 100;
    },
  },
  {
    id: 'limit_distance',
    name: '涨跌停距离',
    description: '距涨跌停板的百分比距离',
    category: 'volatility',
    compute(_klines, market) {
      const dist = calcLimitDistance(market.price, market.preClose);
      return Math.min(dist.up, dist.down);
    },
  },
  {
    id: 'wr_signal',
    name: 'WR 信号',
    description: '威廉指标超买(>-20)或超卖(<-80)',
    category: 'momentum',
    compute(klines) {
      const wr = calcWR(klines);
      if (!wr) return null;
      return wr.signal;
    },
  },
  {
    id: 'upper_limit_status',
    name: '当前涨停',
    description: '按主板 10%、创业板/科创板 20% 的价格限制判断当前是否封板',
    category: 'momentum',
    compute(_klines, market) {
      return isAtUpperLimit(market);
    },
  },
  {
    id: 'turnover_rate',
    name: '换手率',
    description: '当日换手率百分比',
    category: 'volume',
    compute(_klines, market) {
      return market.turnoverAvailable === false ? null : market.turnover;
    },
  },
  {
    id: 'close_position',
    name: '日内收盘位置',
    description: '现价在当日最低与最高价区间的位置，1 表示位于最高价',
    category: 'momentum',
    compute(_klines, market) {
      const range = market.high - market.low;
      if (range <= 0) return market.price >= market.high ? 1 : null;
      return Math.max(0, Math.min(1, (market.price - market.low) / range));
    },
  },
  {
    id: 'return_20d',
    name: '20日收益',
    description: '最近 20 个交易日累计涨跌幅',
    category: 'momentum',
    compute(klines) {
      return trailingReturn(klines, 20);
    },
  },
  {
    id: 'return_60d',
    name: '60日收益',
    description: '最近 60 个交易日累计涨跌幅',
    category: 'momentum',
    compute(klines) {
      return trailingReturn(klines, 60);
    },
  },
  {
    id: 'near_52w_high',
    name: '年内高位接近度',
    description: '当前收盘价 / 最近 250 日最高价',
    category: 'trend',
    compute(klines) {
      if (klines.length < 250) return null;
      const window = klines.slice(-250);
      const high = Math.max(...window.map((k) => k.high));
      return high > 0 ? window[window.length - 1].close / high : null;
    },
  },
  {
    id: 'volatility_20d',
    name: '20日波动率',
    description: '最近 20 日收益率的日度标准差',
    category: 'volatility',
    compute(klines) {
      return realizedVolatility(klines, 20);
    },
  },
  {
    id: 'volatility_60d',
    name: '60日波动率',
    description: '最近 60 日收益率的日度标准差',
    category: 'volatility',
    compute(klines) {
      return realizedVolatility(klines, 60);
    },
  },
  {
    id: 'above_ma200',
    name: '站上MA200',
    description: '当前收盘价高于最近 200 日均价',
    category: 'trend',
    compute(klines) {
      if (klines.length < 200) return null;
      const ma200 = average(klines.slice(-200).map((k) => k.close));
      return klines[klines.length - 1].close > ma200;
    },
  },
  {
    id: 'ma200_slope',
    name: 'MA200斜率',
    description: '当前 MA200 相对 20 个交易日前 MA200 的变化百分比',
    category: 'trend',
    compute(klines) {
      if (klines.length < 220) return null;
      const current = average(klines.slice(-200).map((k) => k.close));
      const previous = average(klines.slice(-220, -20).map((k) => k.close));
      return previous > 0 ? ((current / previous) - 1) * 100 : null;
    },
  },
  {
    id: 'max_drawdown_250d',
    name: '250日最大回撤',
    description: '最近 250 日从阶段高点计算的最大回撤百分比',
    category: 'volatility',
    compute(klines) {
      if (klines.length < 250) return null;
      let peak = 0;
      let maxDrawdown = 0;
      for (const { close } of klines.slice(-250)) {
        peak = Math.max(peak, close);
        if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - close) / peak) * 100);
      }
      return maxDrawdown;
    },
  },
  {
    id: 'ma50_over_ma150_pct',
    name: 'MA50相对MA150',
    description: 'MA50 高于 MA150 的百分比，用于确认中长期趋势结构',
    category: 'trend',
    compute(klines) {
      const closes = klines.map((kline) => kline.close);
      const ma50 = movingAverage(closes, 50);
      const ma150 = movingAverage(closes, 150);
      if (ma50 === null || ma150 === null || ma150 <= 0) return null;
      return ((ma50 / ma150) - 1) * 100;
    },
  },
  {
    id: 'range_contraction_5_20',
    name: '波动收缩比',
    description: '最近5日平均振幅 / 此前15日平均振幅，低于1表示波动收缩',
    category: 'volatility',
    compute(klines) {
      if (klines.length < 20) return null;
      const recent = averageRangePercent(klines, -5);
      const baseline = averageRangePercent(klines, -20, -5);
      if (recent === null || baseline === null || baseline <= 0) return null;
      return recent / baseline;
    },
  },
  {
    id: 'volume_contraction_5_20',
    name: '成交量收缩比',
    description: '最近5日均量 / 此前15日均量，低于1表示整理期缩量',
    category: 'volume',
    compute(klines) {
      if (klines.length < 20) return null;
      const recent = average(klines.slice(-5).map((kline) => kline.volume));
      const baseline = average(klines.slice(-20, -5).map((kline) => kline.volume));
      return baseline > 0 ? recent / baseline : null;
    },
  },
  {
    id: 'breakout_60d_pct',
    name: '60日平台突破',
    description: '最新收盘价相对之前60日最高价的突破幅度，正数表示已突破',
    category: 'trend',
    compute(klines) {
      if (klines.length < 61) return null;
      const previousHigh = Math.max(...klines.slice(-61, -1).map((kline) => kline.high));
      const currentClose = klines[klines.length - 1].close;
      return previousHigh > 0 ? ((currentClose / previousHigh) - 1) * 100 : null;
    },
  },
  {
    id: 'rps_20d',
    name: '20日相对强度',
    description: '20日收益在本次扫描股票池中的百分位排名',
    category: 'momentum',
    compute(_klines, market, context) {
      return context?.crossSectionRanks?.get('return_20d')?.get(market.code) ?? null;
    },
  },
  {
    id: 'rps_60d',
    name: '60日相对强度',
    description: '60日收益在本次扫描股票池中的百分位排名',
    category: 'momentum',
    compute(_klines, market, context) {
      return context?.crossSectionRanks?.get('return_60d')?.get(market.code) ?? null;
    },
  },
];

const factorMap = new Map<string, Factor>();
for (const f of factors) {
  factorMap.set(f.id, f);
}

export function getFactor(id: string): Factor | undefined {
  return factorMap.get(id);
}

export function getFactorInfo(): { id: string; name: string; description: string; category: string }[] {
  return factors.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description,
    category: f.category,
  }));
}
