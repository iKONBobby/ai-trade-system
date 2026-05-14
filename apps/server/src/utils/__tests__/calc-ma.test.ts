import { describe, it, expect } from 'vitest';
import { calcMA } from '@trade/shared';

describe('calcMA (shared) — pure math, returns (number|null)[]', () => {
  it('returns same-length array with first (period-1) entries null', () => {
    const klines = [{ close: 1 }, { close: 2 }, { close: 3 }, { close: 4 }, { close: 5 }];
    const out = calcMA(klines, 3);
    expect(out).toHaveLength(5);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(2); // (1+2+3)/3
    expect(out[3]).toBe(3); // (2+3+4)/3
    expect(out[4]).toBe(4); // (3+4+5)/3
  });

  it('computes period=5 correctly', () => {
    const closes = [10, 11, 12, 13, 14, 15, 16];
    const out = calcMA(closes.map((c) => ({ close: c })), 5);
    expect(out.slice(0, 4)).toEqual([null, null, null, null]);
    expect(out[4]).toBe(12); // (10+11+12+13+14)/5
    expect(out[5]).toBe(13);
    expect(out[6]).toBe(14);
  });

  it('returns all null when klines length < period', () => {
    const out = calcMA([{ close: 1 }, { close: 2 }], 5);
    expect(out).toEqual([null, null]);
  });

  it('returns one value when klines length == period', () => {
    const out = calcMA([{ close: 1 }, { close: 2 }, { close: 3 }], 3);
    expect(out).toEqual([null, null, 2]);
  });

  it('returns all null on period <= 0 (boundary)', () => {
    expect(calcMA([{ close: 1 }, { close: 2 }], 0)).toEqual([null, null]);
    expect(calcMA([{ close: 1 }, { close: 2 }], -1)).toEqual([null, null]);
  });

  it('returns empty on empty input', () => {
    expect(calcMA([], 5)).toEqual([]);
  });

  it('handles decimal closes', () => {
    const out = calcMA([{ close: 1.5 }, { close: 2.5 }, { close: 3.5 }], 2);
    expect(out[0]).toBeNull();
    expect(out[1]).toBe(2); // (1.5+2.5)/2
    expect(out[2]).toBe(3); // (2.5+3.5)/2
  });
});
