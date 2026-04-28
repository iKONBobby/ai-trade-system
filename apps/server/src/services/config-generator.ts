import type { MarketData, AnalysisResult, IcebreakerConfig } from '@trade/shared';

interface GenerateParams {
  strategyId: string;
  market: MarketData;
  analysis: AnalysisResult;
  totalCapital: number;
  isT0Mode: boolean;
  mode: 'grid' | 'condition';
}

/**
 * Calculate lots based on capital and price.
 * T0 mode uses 50% of capital; floor to 100-share lots.
 */
export function calcLots(totalCapital: number, price: number, isT0Mode: boolean): number {
  const effectiveCapital = isT0Mode ? totalCapital * 0.5 : totalCapital;
  const shares = Math.floor(effectiveCapital / price);
  const lots = Math.floor(shares / 100);
  return Math.max(lots, 1);
}

/**
 * Generate simple 破冰号 config (core fields only).
 */
export function generateSimple(params: GenerateParams): IcebreakerConfig {
  const { strategyId, market, analysis, totalCapital, isT0Mode, mode } = params;
  const { price } = market;
  const baseLots = calcLots(totalCapital, price, isT0Mode);

  const lines: string[] = [];

  if (mode === 'grid' && analysis.gridParams) {
    const gp = analysis.gridParams;
    const lots = isT0Mode ? baseLots : gp.lotPerGrid;
    const line = [
      strategyId,
      '0',
      '0',
      String(lots),
      '',
      '',
      '3',
      '0',
      market.code,
      gp.basePrice.toFixed(2),
      '',
      '0',
      '1',
      '1',
      '0',
      '1#09:00:00#1#21:00:00',
      '1#15:14:59#1#23:59:59',
      '0',
      '',
      '',
      '',
      '',
      `${gp.gridCount}#1#${gp.stepPercent}#1#1#0`,
    ].join(',');
    lines.push(line);
  } else if (mode === 'condition' && analysis.conditionParams) {
    const cp = analysis.conditionParams;
    // Buy order line
    const buyLine = [
      strategyId,
      '0',
      '0',
      String(baseLots),
      '',
      '',
      '4',
      '0',
      market.code,
      cp.buyTriggerPrice.toFixed(2),
      '',
      '0',
      '1',
      '1',
      '0',
      '1#09:00:00#1#21:00:00',
      '1#15:14:59#1#23:59:59',
      '0',
      '',
      '',
      '',
      '',
      '',
      '',
    ].join(',');
    lines.push(buyLine);

    // Sell order line
    const sellLine = [
      strategyId,
      '1',
      '1',
      String(baseLots),
      '',
      '',
      '4',
      '0',
      market.code,
      cp.sellTriggerPrice.toFixed(2),
      '',
      '0',
      '1',
      '1',
      '0',
      '1#09:00:00#1#21:00:00',
      '1#15:14:59#1#23:59:59',
      '0',
      '',
      '',
      '',
      '',
      '',
      '',
    ].join(',');
    lines.push(sellLine);
  }

  // Build summary
  const lotsInfo = isT0Mode ? `T0 mode (50% capital, ${baseLots} lots)` : `${baseLots} lots`;
  const summary = [
    `[${market.name}(${market.code})] ${mode === 'grid' ? '网格' : '条件'}`,
    `price: ${price.toFixed(2)}, confidence: ${analysis.confidence}%`,
    `${lotsInfo}, capital: ${totalCapital}`,
    isT0Mode ? '(includes T+0 rotation)' : '',
  ]
    .filter(Boolean)
    .join(' | ');

  return { lines, summary };
}

/**
 * Generate full 破冰号 config with all 23 fields per spec.
 */
export function generateFull(params: GenerateParams): IcebreakerConfig {
  const { strategyId, market, analysis, totalCapital, isT0Mode, mode } = params;
  const { price } = market;
  const baseLots = calcLots(totalCapital, price, isT0Mode);

  const lines: string[] = [];

  if (mode === 'grid' && analysis.gridParams) {
    const gp = analysis.gridParams;
    const lots = isT0Mode ? baseLots : gp.lotPerGrid;
    const gridSpecific = `${gp.gridCount}#1#${gp.stepPercent}#1#1#0`;
    const line = [
      strategyId,
      '0',    // direction (buy)
      '0',    // offset (open)
      String(lots),
      '3',    // tradeType (grid)
      '0',    // triggerType
      market.code,
      gp.basePrice.toFixed(2),
      '',
      '0',
      '1',
      '1',
      '0',
      '1#09:00:00#1#21:00:00',
      '1#15:14:59#1#23:59:59',
      '0',
      '',
      '',
      '',
      '',
      '',
      gridSpecific,
    ].join(',');
    lines.push(line);
  } else if (mode === 'condition' && analysis.conditionParams) {
    const cp = analysis.conditionParams;
    // Buy order
    const buyLine = [
      strategyId,
      '0',
      '0',
      String(baseLots),
      '4',
      '0',
      market.code,
      cp.buyTriggerPrice.toFixed(2),
      '',
      '0',
      '1',
      '1',
      '0',
      '1#09:00:00#1#21:00:00',
      '1#15:14:59#1#23:59:59',
      '0',
      '',
      '',
      '',
      '',
      '',
      '',
    ].join(',');
    lines.push(buyLine);
    // Sell order
    const sellLine = [
      strategyId,
      '1',
      '1',
      String(baseLots),
      '4',
      '0',
      market.code,
      cp.sellTriggerPrice.toFixed(2),
      '',
      '0',
      '1',
      '1',
      '0',
      '1#09:00:00#1#21:00:00',
      '1#15:14:59#1#23:59:59',
      '0',
      '',
      '',
      '',
      '',
      '',
      '',
    ].join(',');
    lines.push(sellLine);
  }

  const lotsInfo = isT0Mode ? `T0 mode (50% capital, ${baseLots} lots)` : `${baseLots} lots`;
  const summary = [
    `[${market.name}(${market.code})] ${mode === 'grid' ? '网格' : '条件'} (full)`,
    `price: ${price.toFixed(2)}, confidence: ${analysis.confidence}%`,
    `${lotsInfo}, capital: ${totalCapital}`,
    isT0Mode ? '(includes T+0 rotation)' : '',
  ]
    .filter(Boolean)
    .join(' | ');

  return { lines, summary };
}
