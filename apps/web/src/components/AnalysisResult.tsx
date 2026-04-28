'use client';

import type { AnalyzeResponse } from '@trade/shared';

interface AnalysisResultProps {
  data: AnalyzeResponse;
}

function formatVolume(v: number): string {
  if (v >= 100_000_000) {
    return (v / 100_000_000).toFixed(2) + '亿';
  }
  if (v >= 10_000) {
    return (v / 10_000).toFixed(2) + '万';
  }
  return v.toFixed(2);
}

function formatPercent(v: number): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function marketStateLabel(state: string): string {
  const map: Record<string, string> = {
    ranging: '震荡',
    trending_up: '上涨趋势',
    trending_down: '下跌趋势',
  };
  return map[state] || state;
}

export default function AnalysisResult({ data }: AnalysisResultProps) {
  const { market, analysis } = data;
  const isUp = market.change >= 0;

  return (
    <div className="space-y-5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-lg font-bold text-[var(--color-text-primary)]">
            {market.name}
            <span className="ml-2 text-sm font-normal text-[var(--color-text-secondary)]">
              {market.code}
            </span>
          </h3>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ color: isUp ? 'var(--color-danger)' : 'var(--color-accent)' }}>
            {market.price.toFixed(2)}
          </div>
          <div
            className="text-sm font-medium"
            style={{ color: isUp ? 'var(--color-danger)' : 'var(--color-accent)' }}
          >
            {isUp ? '+' : ''}
            {market.change.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* 3-column: Volume, Turnover, ATR */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="成交量" value={formatVolume(market.volume)} />
        <MetricCard label="换手率" value={`${market.turnover.toFixed(2)}%`} />
        <MetricCard label="ATR" value={analysis.atr.toFixed(2)} />
      </div>

      {/* 2x2 Grid: Bollinger & Support/Resistance */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-[var(--color-bg-primary)] p-3">
          <div className="mb-1 text-xs text-[var(--color-text-secondary)]">布林上轨</div>
          <div className="font-mono text-sm text-[var(--color-text-primary)]">
            {analysis.bollinger.upper.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg bg-[var(--color-bg-primary)] p-3">
          <div className="mb-1 text-xs text-[var(--color-text-secondary)]">布林下轨</div>
          <div className="font-mono text-sm text-[var(--color-text-primary)]">
            {analysis.bollinger.lower.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg bg-[var(--color-bg-primary)] p-3">
          <div className="mb-1 text-xs text-[var(--color-text-secondary)]">支撑位</div>
          <div className="font-mono text-sm text-[var(--color-accent)]">
            {analysis.support.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg bg-[var(--color-bg-primary)] p-3">
          <div className="mb-1 text-xs text-[var(--color-text-secondary)]">阻力位</div>
          <div className="font-mono text-sm text-[var(--color-danger)]">
            {analysis.resistance.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Recommendation Badge */}
      <div className="flex items-center justify-between rounded-lg bg-[var(--color-bg-primary)] p-3">
        <div>
          <span className="text-xs text-[var(--color-text-secondary)]">策略建议</span>
          <div className="mt-1">
            <span
              className={`inline-block rounded px-2.5 py-0.5 text-sm font-semibold ${
                analysis.recommendation === 'grid'
                  ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                  : 'bg-blue-900 text-blue-400'
              }`}
            >
              {analysis.recommendation === 'grid' ? '网格交易' : '条件单'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs text-[var(--color-text-secondary)]">市场状态</span>
          <div className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
            {marketStateLabel(analysis.marketState)}
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs text-[var(--color-text-secondary)]">置信度</span>
          <div className="mt-1 text-sm font-semibold text-[var(--color-accent)]">
            {(analysis.confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--color-bg-primary)] p-3 text-center">
      <div className="mb-1 text-xs text-[var(--color-text-secondary)]">{label}</div>
      <div className="font-mono text-sm font-medium text-[var(--color-text-primary)]">{value}</div>
    </div>
  );
}
