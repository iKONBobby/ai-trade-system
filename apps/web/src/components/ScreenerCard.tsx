'use client';

import type { ScreenerResult } from '@trade/shared';
import SparklineSVG from './SparklineSVG';

export default function ScreenerCard({
  result,
  isFavorited,
  onToggleFavorite,
  onClick,
}: {
  result: ScreenerResult;
  isFavorited: boolean;
  onToggleFavorite: (code: string) => void;
  onClick: (code: string) => void;
}) {
  const changeColor = result.change >= 0 ? 'text-red-500' : 'text-green-500';
  const changeSign = result.change >= 0 ? '+' : '';

  const scoreColor =
    result.score >= 80 ? 'bg-red-500' : result.score >= 60 ? 'bg-amber-500' : 'bg-gray-400';

  return (
    <div
      onClick={() => onClick(result.code)}
      className="group cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 transition-all hover:border-[var(--color-primary)] hover:shadow-md"
    >
      {/* Top row: name + code + score */}
      <div className="mb-2 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold" title={result.name}>
            {result.name}
          </h3>
          <span className="text-xs text-[var(--color-text-secondary)]">{result.code}</span>
        </div>
        <div className="ml-2 flex items-center gap-2">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${scoreColor}`}
            title={`匹配得分: ${result.score}`}
          >
            {result.score}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(result.code);
            }}
            className={`text-lg transition-colors ${
              isFavorited ? 'text-amber-400' : 'text-gray-300 hover:text-amber-300'
            }`}
            title={isFavorited ? '取消收藏' : '加入候选池'}
          >
            ★
          </button>
        </div>
      </div>

      {/* Price row */}
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-lg font-bold tabular-nums">{result.price.toFixed(2)}</span>
        <span className={`text-xs font-medium tabular-nums ${changeColor}`}>
          {changeSign}{result.change.toFixed(2)}%
        </span>
        <span className="text-xs text-[var(--color-text-secondary)]">
          换手 {result.turnover.toFixed(1)}%
        </span>
      </div>

      {/* Sparkline */}
      <div className="mb-2 flex justify-center">
        <SparklineSVG data={result.klineSnapshot} />
      </div>

      {/* Triggered factors */}
      <div className="flex flex-wrap gap-1">
        {result.triggeredFactors
          .filter((f) => f.passed)
          .map((f) => (
            <span
              key={f.id}
              className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] text-[var(--color-primary)]"
            >
              {f.name}
            </span>
          ))}
      </div>
    </div>
  );
}
