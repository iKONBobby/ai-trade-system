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
      className="group cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 transition-all hover:border-[var(--color-primary)] hover:shadow-md"
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
            title={result.aiReview ? `综合得分: ${result.score}` : `量化匹配得分: ${result.score}`}
          >
            {result.score}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(result.code);
            }}
            className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:h-8 sm:w-8 ${
              isFavorited ? 'text-amber-400' : 'text-gray-300 hover:text-amber-300'
            }`}
            title={isFavorited ? '取消收藏' : '加入候选池'}
            aria-label={isFavorited ? `取消收藏 ${result.name}` : `收藏 ${result.name}`}
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
          换手 {result.turnoverAvailable === false ? '—' : `${result.turnover.toFixed(1)}%`}
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

      {result.aiReview && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3">
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 font-medium text-[var(--color-primary)]">
              AI 复核
            </span>
            <span className="tabular-nums text-[var(--color-text-secondary)]">
              量化 {result.quantScore} · AI {result.aiReview.score} · 可信度 {result.aiReview.confidence}%
            </span>
          </div>
          <p className="text-xs leading-5 text-[var(--color-text-primary)]">{result.aiReview.thesis}</p>
          {result.aiReview.risks[0] && (
            <p className="mt-1 text-xs leading-5 text-amber-500">风险：{result.aiReview.risks[0]}</p>
          )}
        </div>
      )}
    </div>
  );
}
