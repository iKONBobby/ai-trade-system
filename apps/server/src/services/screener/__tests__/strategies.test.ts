import { describe, expect, it } from 'vitest';
import { getAllStrategies, getStrategy, listStrategies } from '../strategies.js';
import { getFactor } from '../factors.js';

describe('screener strategies', () => {
  it('registers the first community-research strategy batch', () => {
    expect(getStrategy('vcp_setup')).toMatchObject({ horizon: 'medium', lookbackDays: 260 });
    expect(getStrategy('range_breakout')).toMatchObject({ horizon: 'short', lookbackDays: 80 });
    expect(getStrategy('low_vol_momentum')).toMatchObject({ horizon: 'medium', lookbackDays: 260 });
    expect(getStrategy('relative_strength')).toMatchObject({ horizon: 'medium', lookbackDays: 260 });
  });

  it('only references registered factors and uses 100-point weights', () => {
    for (const strategy of getAllStrategies()) {
      expect(strategy.factors.reduce((sum, factor) => sum + factor.weight, 0)).toBe(100);
      for (const factor of strategy.factors) {
        expect(getFactor(factor.factorId), `${strategy.id}: ${factor.factorId}`).toBeDefined();
      }
    }
  });

  it('exposes the new strategies through the API summary list', () => {
    const ids = listStrategies().map((strategy) => strategy.id);
    expect(ids).toEqual(expect.arrayContaining(['vcp_setup', 'range_breakout', 'low_vol_momentum', 'relative_strength']));
  });
});
