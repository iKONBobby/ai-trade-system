import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveLastRun, loadLastRun, clearLastRun, formatAge } from '../swarm-recovery';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('saveLastRun + loadLastRun', () => {
  it('save 后 load 返回相同对象 (含 savedAt)', () => {
    const before = Date.now();
    saveLastRun({ runId: 'swr_1', streamUrl: '/x/swr_1/events', stockCode: '600519' });
    const after = Date.now();
    const loaded = loadLastRun();
    expect(loaded).not.toBeNull();
    expect(loaded?.runId).toBe('swr_1');
    expect(loaded?.streamUrl).toBe('/x/swr_1/events');
    expect(loaded?.stockCode).toBe('600519');
    expect(loaded?.savedAt).toBeGreaterThanOrEqual(before);
    expect(loaded?.savedAt).toBeLessThanOrEqual(after);
  });

  it('empty localStorage → load 返回 null', () => {
    expect(loadLastRun()).toBeNull();
  });

  it('TTL 5 min 过期 → load 返回 null + clear', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    saveLastRun({ runId: 'swr_1', streamUrl: '/x', stockCode: '600519' });
    vi.setSystemTime(new Date('2026-01-01T00:05:01Z')); // 5min + 1s
    expect(loadLastRun()).toBeNull();
    expect(localStorage.getItem('swarm:last-run')).toBeNull();
  });

  it('TTL 边界 4:59 仍返回', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    saveLastRun({ runId: 'swr_1', streamUrl: '/x', stockCode: '600519' });
    vi.setSystemTime(new Date('2026-01-01T00:04:59Z'));
    expect(loadLastRun()?.runId).toBe('swr_1');
  });

  it('损坏 JSON → load 返回 null', () => {
    localStorage.setItem('swarm:last-run', 'not json {{{');
    expect(loadLastRun()).toBeNull();
  });

  it('缺字段 → load 返回 null + clear', () => {
    localStorage.setItem('swarm:last-run', JSON.stringify({ runId: 'swr_1' }));
    expect(loadLastRun()).toBeNull();
    expect(localStorage.getItem('swarm:last-run')).toBeNull();
  });
});

describe('clearLastRun', () => {
  it('clear 后 load 返回 null', () => {
    saveLastRun({ runId: 'swr_1', streamUrl: '/x', stockCode: '600519' });
    clearLastRun();
    expect(loadLastRun()).toBeNull();
  });
});

describe('formatAge', () => {
  it('<60s → "X 秒前"', () => {
    expect(formatAge(1_000_000, 1_030_000)).toBe('30 秒前');
  });

  it('>=60s → "X 分钟前"', () => {
    expect(formatAge(1_000_000, 1_125_000)).toBe('2 分钟前');
  });

  it('刚刚 → "0 秒前"', () => {
    expect(formatAge(1_000_000, 1_000_500)).toBe('1 秒前'); // round
  });
});
