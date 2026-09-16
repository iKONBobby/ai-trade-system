import { describe, expect, it } from 'vitest';
import type { ScanningJob } from '../types.js';
import { toJobProgress } from '../types.js';

describe('toJobProgress', () => {
  it('returns results for every selected strategy', () => {
    const job: ScanningJob = {
      id: 'job_1',
      strategyIds: ['ma_bullish', 'volume_breakout'],
      status: 'done',
      progress: { scanned: 100, total: 100, failed: 3 },
      results: new Map([
        ['ma_bullish', []],
        ['volume_breakout', []],
      ]),
      startedAt: 1,
      abortController: new AbortController(),
      phase: 'scanning',
      useAIReview: false,
      aiReviewStatus: 'not_requested',
    };

    const response = toJobProgress(job);

    expect(response.progress.failed).toBe(3);
    expect(response.resultsByStrategy).toEqual({
      ma_bullish: [],
      volume_breakout: [],
    });
  });
});
