import type { KLine, MarketData, ScreenerResult, JobProgress } from '@trade/shared';

export interface FactorContext {
  /** factor id -> stock code -> 0..100 percentile rank within this scan universe */
  crossSectionRanks?: Map<string, Map<string, number>>;
}

export interface Factor {
  id: string;
  name: string;
  description: string;
  category: 'trend' | 'momentum' | 'volume' | 'volatility' | 'valuation';
  compute: (klines: KLine[], market: MarketData, context?: FactorContext) => number | string | boolean | null;
  labels?: { true: string; false: string };
}

export interface ScanningJob {
  id: string;
  strategyIds: string[];
  status: 'running' | 'done' | 'error' | 'cancelled';
  progress: { scanned: number; total: number; failed: number };
  results: Map<string, ScreenerResult[]>; // strategyId → results
  startedAt: number;
  abortController: AbortController;
  error?: string;
  phase: 'market_sync' | 'scanning' | 'ai_review';
  useAIReview: boolean;
  aiReviewStatus: 'not_requested' | 'running' | 'done' | 'unavailable';
  aiReviewError?: string;
  aiReviewedAt?: string;
}

export function toJobProgress(job: ScanningJob): JobProgress {
  const firstStrategy = job.strategyIds[0];
  return {
    status: job.status,
    progress: job.progress,
    results: firstStrategy ? job.results.get(firstStrategy) : undefined,
    resultsByStrategy: Object.fromEntries(job.results),
    strategyId: firstStrategy ?? '',
    startedAt: new Date(job.startedAt).toISOString(),
    error: job.error,
    phase: job.phase,
    aiReviewStatus: job.aiReviewStatus,
    aiReviewError: job.aiReviewError,
    aiReviewedAt: job.aiReviewedAt,
  };
}
