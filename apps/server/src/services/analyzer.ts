import type { MarketData, KLine, AnalysisResult } from '@trade/shared';
import { calcBollinger, calcATR, calcMAValues, findSupportResistance } from '../utils/indicators.js';

/**
 * Run the rule engine analysis on market data and klines.
 * @param market Realtime market data
 * @param klines K-line data (should contain enough bars for MA60/ATR14/etc)
 * @param forceMode Optional forced trading mode
 */
export function analyze(
  market: MarketData,
  klines: KLine[],
  forceMode?: 'grid' | 'condition',
): AnalysisResult {
  const price = market.price;
  const bollinger = calcBollinger(klines);
  const atr = calcATR(klines);
  const ma = calcMAValues(klines);
  const { support, resistance } = findSupportResistance(klines);

  // Determine market state
  const bbWidth = bollinger.width;
  const ma5ma20Diff = Math.abs(ma.ma5 - ma.ma20) / (ma.ma20 || 1);

  let marketState: 'ranging' | 'trending_up' | 'trending_down';

  if (bbWidth < 0.08 && ma5ma20Diff < 0.02) {
    marketState = 'ranging';
  } else if (price > bollinger.upper || (ma.ma5 > ma.ma20 && price > ma.ma5)) {
    marketState = 'trending_up';
  } else if (price < bollinger.lower || (ma.ma5 < ma.ma20 && price < ma.ma5)) {
    marketState = 'trending_down';
  } else {
    marketState = 'ranging';
  }

  // Determine recommendation and confidence
  let recommendation: 'grid' | 'condition';
  let confidence: number;
  let gridParams: AnalysisResult['gridParams'];
  let conditionParams: AnalysisResult['conditionParams'];

  if (forceMode) {
    recommendation = forceMode;
    confidence = 80;
  } else if (marketState === 'ranging') {
    recommendation = 'grid';
    confidence = Math.max(0, Math.min(100, (1 - bbWidth / 0.15) * 100));
  } else {
    // trending_up or trending_down
    recommendation = 'condition';
    const maDiff = Math.abs(ma.ma5 - ma.ma20) / (ma.ma20 || 1);
    confidence = Math.min(maDiff * 500, 95);
  }

  // Build strategy params
  if (recommendation === 'grid') {
    const stepPercent = Math.max(0.3, (atr / price) * 1.5 * 100);
    gridParams = {
      basePrice: price,
      stepPercent: Math.round(stepPercent * 100) / 100,
      gridCount: 4,
      lotPerGrid: 100,
    };
  } else {
    conditionParams = {
      buyTriggerPrice: support,
      sellTriggerPrice: resistance,
      buyLot: 100,
      sellLot: 100,
    };
  }

  return {
    marketState,
    bollinger,
    atr,
    ma,
    support,
    resistance,
    recommendation,
    confidence: Math.round(confidence * 100) / 100,
    gridParams,
    conditionParams,
  };
}
