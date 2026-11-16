import { describe, expect, it } from 'vitest';
import { buildTrendRows, type HistoryDraw } from '../lottery-trend';

describe('lottery trend history', () => {
  it('keeps consecutive omissions through slices and across year boundaries', () => {
    const draws: HistoryDraw[] = [
      ['2025150', '2025-12-30', [1, 2, 3, 4, 5, 6], [1]],
      ['2026001', '2026-01-01', [2, 3, 4, 5, 6, 7], [2]],
      ['2026002', '2026-01-04', [2, 3, 4, 5, 6, 8], [2]],
      ['2026003', '2026-01-06', [1, 3, 4, 5, 6, 8], [1]],
    ];
    const rows = buildTrendRows(draws, 'ssq');
    expect(rows.slice(2)[0].misses[0]).toBe(2);
    expect(rows.slice(2)[0].misses[33]).toBe(2);
    expect(rows[3].misses[0]).toBe(0);
    expect(rows[0].misses[0]).toBe(0);
  });

  it('calculates statistics only from front numbers and handles zone boundaries', () => {
    const [row] = buildTrendRows([['2026001', '2026-01-03', [1, 12, 13, 24, 35], [1, 12]]], 'dlt');
    expect(row).toMatchObject({ sum: 85, span: 34, zones: '2:2:1', parity: '3:2' });
    expect(row.misses).toHaveLength(47);
    expect(row.misses[35]).toBe(0);
    expect(row.misses[46]).toBe(0);
  });
});
