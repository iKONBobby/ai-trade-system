'use client';

import { useEffect, useState } from 'react';
import type { KLine, KlinePeriod } from '@trade/shared';
import { fetchKLineDetail } from '@/lib/api';

export type KLineFetchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface UseKLineDataResult {
  data: KLine[];
  status: KLineFetchStatus;
  error: string;
  /** Call to re-trigger the fetch (used by error-state retry button). */
  refetch: () => void;
}

/**
 * Fetch K-line data with AbortController-based race protection.
 *
 *   period change ──▶ cleanup: controller.abort()
 *                 ──▶ new controller
 *                 ──▶ status=loading
 *                 ──▶ fetch
 *                      ├─ ok       ──▶ status=success | empty
 *                      ├─ aborted  ──▶ silent (user moved on)
 *                      └─ error    ──▶ status=error
 */
export function useKLineData(
  code: string,
  period: KlinePeriod,
  days: number = 120,
): UseKLineDataResult {
  const [data, setData] = useState<KLine[]>([]);
  const [status, setStatus] = useState<KLineFetchStatus>('idle');
  const [error, setError] = useState('');
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!code) return;
    const controller = new AbortController();
    setStatus('loading');
    setError('');

    fetchKLineDetail(code, period, days, controller.signal)
      .then((klines) => {
        if (controller.signal.aborted) return;
        setData(klines);
        setStatus(klines.length === 0 ? 'empty' : 'success');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return; // silent on cancel
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : '加载失败');
        setStatus('error');
      });

    return () => controller.abort();
  }, [code, period, days, retryToken]);

  return { data, status, error, refetch: () => setRetryToken((n) => n + 1) };
}
