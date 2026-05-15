'use client';

import { useEffect, useState, useCallback } from 'react';
import type { KlinePeriod, ScreenerResult } from '@trade/shared';
import { useKLineData } from '@/hooks/useKLineData';
import { addFavorite } from '@/lib/api';
import KLineChart from './KLineChart';

const PERIODS: { value: KlinePeriod; label: string }[] = [
  { value: 'daily', label: '日 K' },
  { value: 'weekly', label: '周 K' },
  { value: 'monthly', label: '月 K' },
  { value: '60min', label: '60 分' },
  { value: '30min', label: '30 分' },
  { value: '15min', label: '15 分' },
  { value: '5min', label: '5 分' },
];

const DAYS_PER_PERIOD: Record<KlinePeriod, number> = {
  daily: 120,
  weekly: 120,
  monthly: 60,
  '60min': 240, // ~10 trading days × 24 hourly bars
  '30min': 240,
  '15min': 240,
  '5min': 240,
};

export interface StockDetailDialogProps {
  /** 6-digit stock code. */
  code: string;
  /** Known metadata to avoid extra fetchRealtime. Optional. */
  initialMeta?: Pick<ScreenerResult, 'name' | 'market'> & {
    price?: number;
    change?: number;
    turnover?: number;
    high?: number;
    low?: number;
  };
  /** Default period, 'daily' by default. */
  defaultPeriod?: KlinePeriod;
  /** Whether this code is currently in the favorites list (controls CTA label). */
  isFavorited?: boolean;
  /** Close callback. */
  onClose: () => void;
  /** Optional callback after the user adds the stock to favorites. */
  onAddedToFavorite?: (code: string) => void;
}

export default function StockDetailDialog({
  code,
  initialMeta,
  defaultPeriod = 'daily',
  isFavorited = false,
  onClose,
  onAddedToFavorite,
}: StockDetailDialogProps) {
  const [period, setPeriod] = useState<KlinePeriod>(defaultPeriod);
  const [showMA, setShowMA] = useState(true);
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data, status, error, refetch } = useKLineData(code, period, DAYS_PER_PERIOD[period]);

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleAddFavorite = useCallback(async () => {
    if (!initialMeta || initialMeta.price === undefined) {
      setActionError('缺少行情信息，无法加入收藏');
      return;
    }
    setAdding(true);
    setActionError('');
    try {
      const stockShape: ScreenerResult = {
        code,
        name: initialMeta.name,
        market: initialMeta.market,
        price: initialMeta.price,
        change: initialMeta.change ?? 0,
        open: 0,
        high: initialMeta.high ?? 0,
        low: initialMeta.low ?? 0,
        preClose: 0,
        volume: 0,
        turnover: initialMeta.turnover ?? 0,
        score: 0,
        triggeredFactors: [],
        klineSnapshot: data.slice(-20).map((k) => k.close),
      };
      await addFavorite(stockShape);
      onAddedToFavorite?.(code);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : '加入失败');
    } finally {
      setAdding(false);
    }
  }, [code, initialMeta, data, onAddedToFavorite]);

  const handleOpenTrade = useCallback(() => {
    window.open(`/trade?code=${code}`, '_blank');
  }, [code]);

  const handleOpenSwarm = useCallback(() => {
    window.open(`/trade?code=${code}&ai=swarm&auto=1`, '_blank');
  }, [code]);

  const change = initialMeta?.change ?? 0;
  const changeColor = change >= 0 ? 'text-red-500' : 'text-green-500';
  const changeSign = change >= 0 ? '+' : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              {initialMeta?.name ?? code}
              <span className="ml-2 text-xs font-normal text-[var(--color-text-secondary)]">
                {code} · {initialMeta?.market ?? ''}
              </span>
            </h2>
            <div className="mt-1 flex items-baseline gap-3 text-sm tabular-nums">
              {initialMeta?.price !== undefined && (
                <span className="text-lg font-bold">{initialMeta.price.toFixed(2)}</span>
              )}
              <span className={`${changeColor} font-medium`}>
                {changeSign}
                {change.toFixed(2)}%
              </span>
              {initialMeta?.turnover !== undefined && (
                <span className="text-xs text-[var(--color-text-secondary)]">
                  换手 {initialMeta.turnover.toFixed(2)}%
                </span>
              )}
              {initialMeta?.high !== undefined && initialMeta?.low !== undefined && (
                <span className="text-xs text-[var(--color-text-secondary)]">
                  今 {initialMeta.high.toFixed(2)} / {initialMeta.low.toFixed(2)}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-400" title="关闭 (ESC)">
            ✕
          </button>
        </div>

        {/* Period control + MA toggle */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-2">
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${
                  period === p.value
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
            <input
              type="checkbox"
              checked={showMA}
              onChange={(e) => setShowMA(e.target.checked)}
              className="cursor-pointer"
            />
            MA5/10/20
          </label>
        </div>

        {/* Chart area */}
        <div className="relative flex-1 px-5 py-3" style={{ minHeight: 420 }}>
          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--color-text-secondary)]">
              加载中…
            </div>
          )}
          {status === 'empty' && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--color-text-secondary)]">
              本周期无 K 线数据
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-sm text-red-400">
              <span>{error || '加载失败'}</span>
              <button
                onClick={refetch}
                className="mt-2 rounded border border-[var(--color-border)] px-3 py-1 text-xs"
              >
                重试
              </button>
            </div>
          )}
          {/* Always render chart container so its instance is preserved; opacity hides during non-success */}
          <div className={status === 'success' ? '' : 'invisible'}>
            <KLineChart data={data} showMA={showMA} height={400} />
          </div>
        </div>

        {/* Footer CTA */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
          <div className="text-xs text-red-400">{actionError}</div>
          <div className="flex gap-2">
            <button
              onClick={handleAddFavorite}
              disabled={adding || isFavorited}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isFavorited
                  ? 'border border-amber-400/50 bg-amber-400/10 text-amber-400'
                  : 'border border-[var(--color-border)] hover:border-amber-400'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {isFavorited ? '★ 已收藏' : adding ? '加入中...' : '☆ 加入收藏'}
            </button>
            <button
              onClick={handleOpenSwarm}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
              title="召开 5 角色 AI 投资委员会"
            >
              🏛 AI 委员会
            </button>
            <button
              onClick={handleOpenTrade}
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white"
            >
              → 跳详情分析
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
