import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearScreenerSession,
  loadScreenerSession,
  saveScreenerSession,
} from '../screener-recovery';

const SESSION = {
  jobIds: ['job_1'],
  selectedIds: ['ma_bullish'],
  market: 'all',
  includeGEM: false,
  includeSTAR: true,
  useAIReview: true,
  activeTab: 'ma_bullish',
  progress: { job_1: { scanned: 42, total: 100, failed: 2 } },
};

beforeEach(() => localStorage.clear());

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('screener session recovery', () => {
  it('restores the active job metadata and latest progress', () => {
    saveScreenerSession(SESSION);

    expect(loadScreenerSession()).toMatchObject(SESSION);
  });

  it('clears a session after the server job TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T00:00:00Z'));
    saveScreenerSession(SESSION);
    vi.setSystemTime(new Date('2026-09-08T00:10:00Z'));

    expect(loadScreenerSession()).toBeNull();
    expect(localStorage.getItem('screener:active-session')).toBeNull();
  });

  it('rejects malformed session data', () => {
    localStorage.setItem('screener:active-session', JSON.stringify({ jobIds: ['job_1'] }));

    expect(loadScreenerSession()).toBeNull();
    expect(localStorage.getItem('screener:active-session')).toBeNull();
  });

  it('can explicitly clear the active session', () => {
    saveScreenerSession(SESSION);
    clearScreenerSession();

    expect(loadScreenerSession()).toBeNull();
  });
});
