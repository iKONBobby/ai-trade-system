import type { KLine, MarketData, ScreenerResult, JobProgress } from '@trade/shared';

export interface Factor {
  id: string;
  name: string;
  description: string;
  category: 'trend' | 'momentum' | 'volume' | 'volatility' | 'valuation';
  compute: (klines: KLine[], market: MarketData) => number | boolean | null;
  labels?: { true: string; false: string };
}

export interface ScanningJob {
  id: string;
  strategyIds: string[];
  status: 'running' | 'done' | 'error' | 'cancelled';
  progress: { scanned: number; total: number };
  results: Map<string, ScreenerResult[]>; // strategyId → results
  startedAt: number;
  abortController: AbortController;
  error?: string;
}

export function toJobProgress(job: ScanningJob): JobProgress {
  const firstStrategy = job.strategyIds[0];
  return {
    status: job.status,
    progress: job.progress,
    results: firstStrategy ? job.results.get(firstStrategy) : undefined,
    strategyId: firstStrategy ?? '',
    startedAt: new Date(job.startedAt).toISOString(),
    error: job.error,
  };
}
