import { describe, expect, it } from 'vitest';
import { __percentileRanksForTest } from '../engine.js';

describe('cross-sectional percentile ranks', () => {
  it('ranks the weakest at 0 and strongest at 100', () => {
    const ranks = __percentileRanksForTest([
      { code: 'A', value: -5 },
      { code: 'B', value: 2 },
      { code: 'C', value: 10 },
    ]);

    expect(ranks.get('A')).toBe(0);
    expect(ranks.get('B')).toBe(50);
    expect(ranks.get('C')).toBe(100);
  });

  it('gives tied returns the same midpoint percentile', () => {
    const ranks = __percentileRanksForTest([
      { code: 'A', value: 1 },
      { code: 'B', value: 2 },
      { code: 'C', value: 2 },
      { code: 'D', value: 4 },
    ]);

    expect(ranks.get('B')).toBe(50);
    expect(ranks.get('C')).toBe(50);
  });

  it('handles a one-stock universe', () => {
    expect(__percentileRanksForTest([{ code: 'A', value: 1 }]).get('A')).toBe(100);
  });
});
