'use client';

import { useState, useCallback } from 'react';
import type { KlinePeriod, ScreenerResult } from '@trade/shared';
import { useKLineData } from '@/hooks/useKLineData';
import { addFavorite } from '@/lib/api';
import KLineChart from './KLineChart';
import Modal from './ui/Modal';
import { Button, Icon } from './ui/primitives';

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
    turnoverAvailable?: boolean;
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
        turnoverAvailable: initialMeta.turnoverAvailable,
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
  const changeColor = change >= 0 ? 'tone-bullish' : 'tone-bearish';
  const changeSign = change >= 0 ? '+' : '';

  return (
    <Modal
      open
      onOpenChange={(next) => { if (!next) onClose(); }}
      size="xl"
      title={initialMeta?.name ?? code}
      description={`${code}${initialMeta?.market ? ` · ${initialMeta.market}` : ''} · 行情快照与多周期 K 线`}
      footer={(
        <>
          <div className="text-xs text-[var(--danger)]" role={actionError ? 'alert' : undefined}>{actionError}</div>
          <Button variant="ghost" size="lg" onClick={handleAddFavorite} disabled={adding || isFavorited}>
            <Icon name="star" size={16} />
            {isFavorited ? '已收藏' : adding ? '加入中…' : '加入收藏'}
          </Button>
          <Button variant="secondary" size="lg" onClick={handleOpenSwarm} title="召开 5 角色 AI 投资委员会">
            <Icon name="chart" size={16} /> AI 委员会
          </Button>
          <Button variant="primary" size="lg" onClick={handleOpenTrade}>
            查看完整分析 <Icon name="arrow-up-right" size={16} />
          </Button>
        </>
      )}
    >
      <div className="stock-dialog__quote num">
        {initialMeta?.price !== undefined && <strong>{initialMeta.price.toFixed(2)}</strong>}
        <span className={changeColor}>{changeSign}{change.toFixed(2)}%</span>
        {initialMeta?.turnover !== undefined && (
          <span>换手 {initialMeta.turnoverAvailable === false ? '—' : `${initialMeta.turnover.toFixed(2)}%`}</span>
        )}
        {initialMeta?.high !== undefined && initialMeta?.low !== undefined && (
          <span>今日高 / 低 {initialMeta.high.toFixed(2)} / {initialMeta.low.toFixed(2)}</span>
        )}
      </div>

        <div className="stock-dialog__toolbar">
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                aria-pressed={period === p.value}
                className={`stock-dialog__period ${
                  period === p.value
                    ? 'stock-dialog__period--active'
                    : ''
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

        <div className="stock-dialog__chart">
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
              <Button onClick={refetch} variant="ghost" size="md" className="mt-2">
                重试
              </Button>
            </div>
          )}
          {/* Always render chart container so its instance is preserved; opacity hides during non-success */}
          <div className={status === 'success' ? '' : 'invisible'}>
            <KLineChart data={data} showMA={showMA} height={400} />
          </div>
        </div>

    </Modal>
  );
}
