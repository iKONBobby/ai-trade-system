import type { Strategy } from '@trade/shared';

export const strategies: Strategy[] = [
  {
    id: 'ma_bullish',
    name: '均线多头排列',
    description: 'MA5>MA20>MA60 多头排列 + MACD 金叉 + 放量确认，趋势启动信号',
    factors: [
      { factorId: 'ma_arrangement', operator: 'eq', value: 'bullish_alignment', weight: 35 },
      { factorId: 'macd_signal', operator: 'eq', value: 'golden_cross', weight: 30 },
      { factorId: 'volume_ratio', operator: 'gt', value: 1.2, weight: 20 },
      { factorId: 'limit_distance', operator: 'gt', value: 3, weight: 15 },
    ],
    minScore: 60,
  },
  {
    id: 'oversold_reversal',
    name: '超跌反弹',
    description: 'RSI 超卖 + KDJ 超卖 + 股价接近布林下轨 + 放量，超跌反弹机会',
    factors: [
      { factorId: 'rsi_signal', operator: 'eq', value: 'oversold', weight: 30 },
      { factorId: 'kdj_signal', operator: 'eq', value: 'oversold', weight: 25 },
      { factorId: 'bollinger_position', operator: 'lt', value: 0.25, weight: 25 },
      { factorId: 'volume_ratio', operator: 'gt', value: 1.2, weight: 20 },
    ],
    minScore: 55,
  },
  {
    id: 'volume_breakout',
    name: '放量突破',
    description: '成交量突破 20 日均量 1.5 倍 + 价格在布林带上半区 + 均线不空头，放量启动信号',
    factors: [
      { factorId: 'volume_breakout', operator: 'gt', value: 1.5, weight: 35 },
      { factorId: 'bollinger_position', operator: 'gt', value: 0.5, weight: 25 },
      { factorId: 'ma_arrangement', operator: 'neq', value: 'bearish_alignment', weight: 25 },
      { factorId: 'limit_distance', operator: 'gt', value: 2, weight: 15 },
    ],
    minScore: 55,
  },
];

const strategyMap = new Map<string, Strategy>();
for (const s of strategies) {
  strategyMap.set(s.id, s);
}

export function getStrategy(id: string): Strategy | undefined {
  return strategyMap.get(id);
}

export function getAllStrategies(): Strategy[] {
  return strategies;
}

/** List strategies for the API (id/name/description only, minus factor config) */
export function listStrategies(): { id: string; name: string; description: string }[] {
  return strategies.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
  }));
}
