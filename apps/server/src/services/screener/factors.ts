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

export const factors: Factor[] = [
  {
    id: 'ma_arrangement',
    name: '均线排列',
    description: 'MA5/MA20/MA60 多头或空头排列',
    category: 'trend',
    labels: { true: 'bullish_alignment', false: 'bearish_alignment' },
    compute(klines) {
      const ma = calcMAValues(klines);
      const arr = calcMAArrangement(ma);
      if (arr === 'bullish_alignment') return true;
      if (arr === 'bearish_alignment') return true; // captured via labels
      return false;
    },
  },
  {
    id: 'rsi_signal',
    name: 'RSI 信号',
    description: 'RSI(14) 超买(>70)或超卖(<30)',
    category: 'momentum',
    labels: { true: 'oversold', false: 'neutral' },
    compute(klines) {
      const rsi = calcRSI(klines);
      if (!rsi) return null;
      return rsi.signal === 'oversold' || rsi.signal === 'overbought';
    },
  },
  {
    id: 'macd_signal',
    name: 'MACD 信号',
    description: 'MACD 金叉死叉判断',
    category: 'momentum',
    labels: { true: 'golden_cross', false: 'neutral' },
    compute(klines) {
      const macd = calcMACD(klines);
      if (!macd) return null;
      return macd.signal === 'golden_cross';
    },
  },
  {
    id: 'macd_death_cross',
    name: 'MACD 死叉',
    description: 'MACD 死叉信号',
    category: 'momentum',
    labels: { true: 'death_cross', false: 'neutral' },
    compute(klines) {
      const macd = calcMACD(klines);
      if (!macd) return null;
      return macd.signal === 'death_cross';
    },
  },
  {
    id: 'kdj_signal',
    name: 'KDJ 信号',
    description: 'KDJ 超买(>80)或超卖(<20)',
    category: 'momentum',
    labels: { true: 'oversold', false: 'neutral' },
    compute(klines) {
      const kdj = calcKDJ(klines);
      if (!kdj) return null;
      return kdj.signal === 'oversold' || kdj.signal === 'overbought';
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
    labels: { true: 'oversold', false: 'neutral' },
    compute(klines) {
      const wr = calcWR(klines);
      if (!wr) return null;
      return wr.signal === 'oversold' || wr.signal === 'overbought';
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
