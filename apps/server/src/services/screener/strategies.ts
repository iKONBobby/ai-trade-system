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
    horizon: 'short',
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
    horizon: 'short',
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
    horizon: 'short',
  },
  {
    id: 'limit_up_watch',
    name: '涨停次日观察',
    description: '保留当前封板股，结合封板位置、换手、量能和趋势筛选次日观察池（非直接买入信号）',
    horizon: 'short',
    includeLimitUp: true,
    factors: [
      { factorId: 'upper_limit_status', operator: 'eq', value: 1, weight: 55 },
      { factorId: 'volume_breakout', operator: 'gt', value: 1.2, weight: 15 },
      { factorId: 'turnover_rate', operator: 'gt', value: 3, weight: 10 },
      { factorId: 'close_position', operator: 'gt', value: 0.98, weight: 10 },
      { factorId: 'ma_arrangement', operator: 'neq', value: 'bearish_alignment', weight: 10 },
    ],
    minScore: 70,
  },
  {
    id: 'trend_pullback',
    name: '趋势回踩',
    description: '中期趋势保持向上，价格回到 MA20 附近且量能不过热，寻找回踩后的二次启动',
    horizon: 'medium',
    factors: [
      { factorId: 'ma_arrangement', operator: 'eq', value: 'bullish_alignment', weight: 25 },
      { factorId: 'ma_deviation', operator: 'gt', value: -3, weight: 15 },
      { factorId: 'ma_deviation', operator: 'lt', value: 3, weight: 15 },
      { factorId: 'rsi_signal', operator: 'eq', value: 'neutral', weight: 15 },
      { factorId: 'volume_ratio', operator: 'lt', value: 1.2, weight: 10 },
      { factorId: 'return_20d', operator: 'gt', value: 0, weight: 20 },
    ],
    minScore: 70,
  },
  {
    id: 'medium_momentum',
    name: '中期动量',
    description: '20/60 日动量、接近年内高位、均线趋势与波动约束共同确认',
    horizon: 'medium',
    lookbackDays: 260,
    factors: [
      { factorId: 'return_20d', operator: 'gt', value: 5, weight: 20 },
      { factorId: 'return_60d', operator: 'gt', value: 10, weight: 20 },
      { factorId: 'near_52w_high', operator: 'gt', value: 0.8, weight: 20 },
      { factorId: 'ma_arrangement', operator: 'eq', value: 'bullish_alignment', weight: 25 },
      { factorId: 'volatility_20d', operator: 'lt', value: 4, weight: 15 },
    ],
    minScore: 65,
  },
  {
    id: 'long_trend',
    name: '长周期趋势（价格型）',
    description: '站上 MA200、长期均线向上、接近年内高位，同时限制波动与最大回撤',
    horizon: 'long',
    lookbackDays: 260,
    factors: [
      { factorId: 'above_ma200', operator: 'eq', value: 1, weight: 30 },
      { factorId: 'ma200_slope', operator: 'gt', value: 0, weight: 25 },
      { factorId: 'near_52w_high', operator: 'gt', value: 0.75, weight: 15 },
      { factorId: 'volatility_60d', operator: 'lt', value: 3, weight: 15 },
      { factorId: 'max_drawdown_250d', operator: 'lt', value: 30, weight: 15 },
    ],
    minScore: 65,
  },
  {
    id: 'vcp_setup',
    name: 'VCP 波动收缩',
    description: '长期趋势向上、接近年内高位，近期波动与成交量同步收缩的突破前观察池',
    horizon: 'medium',
    lookbackDays: 260,
    factors: [
      { factorId: 'above_ma200', operator: 'eq', value: 1, weight: 20 },
      { factorId: 'ma200_slope', operator: 'gt', value: 0, weight: 15 },
      { factorId: 'ma50_over_ma150_pct', operator: 'gt', value: 0, weight: 20 },
      { factorId: 'near_52w_high', operator: 'gt', value: 0.75, weight: 15 },
      { factorId: 'range_contraction_5_20', operator: 'lt', value: 0.75, weight: 20 },
      { factorId: 'volume_contraction_5_20', operator: 'lt', value: 0.9, weight: 10 },
    ],
    minScore: 75,
  },
  {
    id: 'range_breakout',
    name: '箱体放量突破',
    description: '收盘突破过去60日平台高点，并由放量、强势收盘和换手率共同确认',
    horizon: 'short',
    lookbackDays: 80,
    factors: [
      { factorId: 'breakout_60d_pct', operator: 'gte', value: 0, weight: 40 },
      { factorId: 'volume_breakout', operator: 'gt', value: 1.5, weight: 20 },
      { factorId: 'close_position', operator: 'gt', value: 0.8, weight: 15 },
      { factorId: 'ma_arrangement', operator: 'neq', value: 'bearish_alignment', weight: 10 },
      { factorId: 'turnover_rate', operator: 'gt', value: 1, weight: 5 },
      { factorId: 'limit_distance', operator: 'gt', value: 2, weight: 10 },
    ],
    minScore: 70,
  },
  {
    id: 'low_vol_momentum',
    name: '低波动动量',
    description: '保留中期上涨趋势，同时约束日常波动、长期回撤和追高风险',
    horizon: 'medium',
    lookbackDays: 260,
    factors: [
      { factorId: 'return_60d', operator: 'gt', value: 8, weight: 35 },
      { factorId: 'above_ma200', operator: 'eq', value: 1, weight: 15 },
      { factorId: 'ma200_slope', operator: 'gt', value: 0, weight: 10 },
      { factorId: 'volatility_60d', operator: 'lt', value: 2.5, weight: 20 },
      { factorId: 'near_52w_high', operator: 'gt', value: 0.75, weight: 10 },
      { factorId: 'max_drawdown_250d', operator: 'lt', value: 30, weight: 10 },
    ],
    minScore: 75,
  },
  {
    id: 'relative_strength',
    name: 'RPS 相对强势',
    description: '同时处于全市场20日与60日强势区间，并由中长期趋势和年内位置确认',
    horizon: 'medium',
    lookbackDays: 260,
    factors: [
      { factorId: 'rps_20d', operator: 'gte', value: 90, weight: 30 },
      { factorId: 'rps_60d', operator: 'gte', value: 80, weight: 25 },
      { factorId: 'return_20d', operator: 'gt', value: 0, weight: 10 },
      { factorId: 'ma_arrangement', operator: 'eq', value: 'bullish_alignment', weight: 15 },
      { factorId: 'above_ma200', operator: 'eq', value: 1, weight: 10 },
      { factorId: 'near_52w_high', operator: 'gt', value: 0.75, weight: 10 },
    ],
    minScore: 75,
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
export function listStrategies(): { id: string; name: string; description: string; horizon: 'short' | 'medium' | 'long'; includeLimitUp: boolean }[] {
  return strategies.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    horizon: s.horizon ?? 'short',
    includeLimitUp: s.includeLimitUp ?? false,
  }));
}
