import { describe, expect, it } from 'vitest';
import { analyzeShape, generateAgentRun, parseNumberList } from '../number-agent';

function seededRandom(seed = 42) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

describe('number agent', () => {
  it('parses, de-duplicates and bounds number input', () => {
    expect(parseNumberList('01 2, 2 / 34 -1 8', 33)).toEqual([1, 2, 8]);
  });

  it('calculates explainable shape metrics', () => {
    expect(analyzeShape([2, 7, 14, 21, 28, 33], 33)).toEqual({
      odd: 3,
      even: 3,
      low: 3,
      high: 3,
      span: 31,
      sum: 105,
      adjacentPairs: 0,
      thirds: [2, 2, 2],
    });
  });

  it('returns valid, unique and filtered samples', () => {
    const run = generateAgentRun({
      kind: 'dlt',
      quantity: 5,
      previous: '01 05 11 19 28',
      hot: '02 06 12 20 30',
      contextMode: 'calendar',
      drawLabel: '2026108',
      inspiration: '一次可解释的随机实验',
    }, seededRandom());

    expect(run.picks).toHaveLength(5);
    run.picks.forEach((pick) => {
      expect(pick.front).toHaveLength(5);
      expect(new Set(pick.front).size).toBe(5);
      expect(pick.front.every((number) => number >= 1 && number <= 35)).toBe(true);
      expect(pick.back).toHaveLength(2);
      expect(new Set(pick.back).size).toBe(2);
      expect(pick.crowdingScore).toBeLessThanOrEqual(60);
      expect(pick.shape.thirds.every((count) => count > 0)).toBe(true);
    });
  });
});

