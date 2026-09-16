import { describe, expect, it } from 'vitest';
import type { KLine } from '@trade/shared';
import { buildTechnicalSeries, summarizeTimeframe } from '../technical-workspace';

function makeBars(direction: 1 | -1, length = 80): KLine[] {
  return Array.from({ length }, (_, index) => {
    const close = 100 + direction * index;
    return {
      date: `2026-01-${String(index + 1).padStart(2, '0')}`,
      open: close - direction * 0.3,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000 + index * 10,
    };
  });
}

describe('technical workspace model', () => {
  it('builds aligned indicator series', () => {
    const points = buildTechnicalSeries(makeBars(1));
    expect(points).toHaveLength(80);
    expect(points[18].ma20).toBeNull();
    expect(points[19].ma20).not.toBeNull();
    expect(points.at(-1)?.rsi).toBe(100);
    expect(points.at(-1)?.bollUpper).toBeGreaterThan(points.at(-1)?.bollMiddle ?? 0);
  });

  it('summarizes a rising timeframe as bullish', () => {
    const summary = summarizeTimeframe('daily', makeBars(1));
    expect(summary?.trend).toBe('bullish');
    expect(summary?.momentum).toBe('bullish');
    expect(summary?.overall).toBe('bullish');
    expect(summary?.support).toBeLessThan(summary?.resistance ?? 0);
  });

  it('summarizes a falling timeframe as bearish', () => {
    const summary = summarizeTimeframe('weekly', makeBars(-1));
    expect(summary?.trend).toBe('bearish');
    expect(summary?.momentum).toBe('bearish');
    expect(summary?.overall).toBe('bearish');
  });
});
