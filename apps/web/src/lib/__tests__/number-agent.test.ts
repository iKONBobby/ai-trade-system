import { describe, expect, it } from 'vitest';
import { analyzeProbabilityLayer, analyzeShape, formatAgentRunForClipboard, generateAgentRun, parseNumberList } from '../number-agent';

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
      mode: 'factor',
      quantity: 5,
      previous: '01 05 11 19 28',
      hot: '02 06 12 20 30',
      contextMode: 'calendar',
      drawLabel: '2026108',
      inspiration: '一次可解释的随机实验',
    }, undefined, seededRandom());

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

  it('keeps fair mode uniform by skipping every factor layer', () => {
    const run = generateAgentRun({
      kind: 'ssq', mode: 'fair', quantity: 3, contextMode: 'signal',
      previous: '01 02 03 04 05 06', hot: '07 08 09 10 11',
      contextText: 'should not affect fair mode', inspiration: 'ignored',
    }, undefined, seededRandom(7));

    expect(run.picks).toHaveLength(3);
    expect(run.attempted).toBe(3);
    expect(run.rejected).toBe(0);
    expect(run.traces.every((trace) => trace.status === 'skipped')).toBe(true);
  });

  it('builds P-layer evidence from real draws and cross-batch picks', () => {
    const layer = analyzeProbabilityLayer(
      { kind: 'ssq', mode: 'factor', quantity: 1, contextMode: 'balanced' },
      [{ issue: '2026100', drawDate: '2026-09-15', front: [1, 2, 3, 4, 5, 6], back: [7] }],
      [{ front: [10, 11, 12, 13, 14, 15], back: [1] }],
    );

    expect(layer.historyCount).toBe(1);
    expect(layer.latest?.issue).toBe('2026100');
    expect(layer.previousFront).toEqual([1, 2, 3, 4, 5, 6]);
    expect(layer.priorPicks).toHaveLength(1);
    expect(layer.trace.summary).toContain('真实开奖');
  });

  it('formats every generated group as copy-ready text', () => {
    const run = generateAgentRun({ kind: 'ssq', mode: 'fair', quantity: 3, contextMode: 'balanced' }, undefined, seededRandom(9));
    const text = formatAgentRunForClipboard(run);
    expect(text.split('\n')).toHaveLength(4);
    expect(text).toMatch(/^双色球｜公平随机｜3组\n01\. \d{2}( \d{2}){5} \+ \d{2}/);
    expect(text).toContain('\n03. ');
  });
});
