import { describe, it, expect } from 'vitest';
import type { StockListItem } from '@trade/shared';
import { isGEM, isSTAR } from '@trade/shared';
import { filterByBoards } from '../engine.js';

function mk(code: string): StockListItem {
  return { code, name: `s-${code}`, market: code.startsWith('6') ? 'SH' : 'SZ' };
}

const MIXED_LIST: StockListItem[] = [
  mk('600519'), // 沪市主板
  mk('601318'), // 沪市主板
  mk('688981'), // 科创板
  mk('000001'), // 深市主板
  mk('002415'), // 深市主板
  mk('300750'), // 创业板
  mk('301236'), // 创业板（30 开头）
];

describe('isGEM / isSTAR — board classifiers', () => {
  it('isGEM: 300xxx and 301xxx return true', () => {
    expect(isGEM('300750')).toBe(true);
    expect(isGEM('301236')).toBe(true);
  });

  it('isGEM: main-board / STAR / unrelated return false', () => {
    expect(isGEM('600519')).toBe(false);
    expect(isGEM('000001')).toBe(false);
    expect(isGEM('688981')).toBe(false);
    expect(isGEM('002415')).toBe(false); // 中小板，深市主板
  });

  it('isSTAR: 688xxx returns true', () => {
    expect(isSTAR('688981')).toBe(true);
    expect(isSTAR('688001')).toBe(true);
  });

  it('isSTAR: main-board / GEM / 600xxx return false', () => {
    expect(isSTAR('600519')).toBe(false);
    expect(isSTAR('300750')).toBe(false);
    expect(isSTAR('689999')).toBe(false);
  });
});

describe('filterByBoards — default excludes 创业板 + 科创板', () => {
  it('default (no opts) keeps only main-board codes', () => {
    const result = filterByBoards(MIXED_LIST, {});
    const codes = result.map((s) => s.code).sort();
    expect(codes).toEqual(['000001', '002415', '600519', '601318']);
  });

  it('includeGEM=true keeps 300xxx + 301xxx but still drops 688', () => {
    const result = filterByBoards(MIXED_LIST, { includeGEM: true });
    const codes = result.map((s) => s.code).sort();
    expect(codes).toEqual(['000001', '002415', '300750', '301236', '600519', '601318']);
    expect(codes).not.toContain('688981');
  });

  it('includeSTAR=true keeps 688 but still drops 300', () => {
    const result = filterByBoards(MIXED_LIST, { includeSTAR: true });
    const codes = result.map((s) => s.code).sort();
    expect(codes).toEqual(['000001', '002415', '600519', '601318', '688981']);
    expect(codes).not.toContain('300750');
  });

  it('both flags true returns the original list unchanged', () => {
    const result = filterByBoards(MIXED_LIST, { includeGEM: true, includeSTAR: true });
    expect(result).toHaveLength(MIXED_LIST.length);
    expect(result.map((s) => s.code).sort()).toEqual(MIXED_LIST.map((s) => s.code).sort());
  });

  it('handles empty input', () => {
    expect(filterByBoards([], {})).toEqual([]);
  });

  it('preserves order (no re-sort)', () => {
    const result = filterByBoards(MIXED_LIST, { includeGEM: true, includeSTAR: true });
    expect(result.map((s) => s.code)).toEqual(MIXED_LIST.map((s) => s.code));
  });
});
