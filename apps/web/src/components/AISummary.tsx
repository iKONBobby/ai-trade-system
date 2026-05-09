'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { MarketData, AnalysisResult, AIAnalysisResult, IcebreakerConfig } from '@trade/shared';
import { fetchAIAnalysis } from '@/lib/api';

interface AISummaryProps {
  market: MarketData;
  analysis: AnalysisResult;
  totalCapital?: number;
  isT0Mode?: boolean;
  strategyId?: string;
  onConfigUpdate?: (config: IcebreakerConfig) => void;
}

const levelCfg: Record<string, { icon: string; bg: string; border: string; text: string }> = {
  risk: { icon: '⚠️', bg: 'bg-red-950/50', border: 'border-red-800/60', text: 'text-red-400' },
  opportunity: { icon: '💡', bg: 'bg-emerald-950/50', border: 'border-emerald-800/60', text: 'text-emerald-400' },
  info: { icon: '📌', bg: 'bg-blue-950/50', border: 'border-blue-800/60', text: 'text-blue-400' },
};

type Stage = 'connecting' | 'analyzing' | 'done' | 'error';

export default function AISummary({ market, analysis, totalCapital, isT0Mode, strategyId, onConfigUpdate }: AISummaryProps) {
  const [result, setResult] = useState<AIAnalysisResult | null>(null);
  const [stage, setStage] = useState<Stage>('connecting');
  const [retryKey, setRetryKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStage('connecting');
    // Small delay so user sees "connecting" before it jumps to "analyzing"
    const stageTimer = setTimeout(() => setStage('analyzing'), 800);

    try {
      const { aiResult, config: adjustedConfig } = await fetchAIAnalysis(
        market, analysis,
        totalCapital != null ? { totalCapital, isT0Mode, strategyId } : undefined,
        controller.signal,
      );
      clearTimeout(stageTimer);
      if (!controller.signal.aborted) {
        if (aiResult) {
          setResult(aiResult);
          setStage('done');
          if (adjustedConfig && onConfigUpdate) {
            onConfigUpdate(adjustedConfig);
          }
        } else {
          setStage('error');
        }
      }
    } catch {
      clearTimeout(stageTimer);
      if (!controller.signal.aborted) {
        setStage('error');
      }
    }
  }, [market.code, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [load]);

  if (stage === 'connecting' || stage === 'analyzing') {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
          <div>
            <span className="text-sm text-[var(--color-text-secondary)]">
              {stage === 'connecting' ? '正在连接 DeepSeek...' : 'AI 正在分析 15 个指标...'}
            </span>
          </div>
        </div>
        {/* Progress bar hint */}
        <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
          <div
            className={`h-full rounded-full bg-[var(--color-accent)] transition-all duration-[${stage === 'analyzing' ? '60000' : '2000'}ms] ${
              stage === 'connecting' ? 'w-1/4' : 'w-3/4'
            }`}
          />
        </div>
      </div>
    );
  }

  if (stage === 'error') {
    return (
      <div className="rounded-xl border border-red-900/40 bg-[var(--color-bg-card)] px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-amber-400">⚠️</span>
            <span className="text-sm text-[var(--color-text-secondary)]">
              AI 分析暂时不可用，DeepSeek 可能响应超时
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
            className="rounded-lg bg-[var(--color-accent-dim)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-black"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const { summary } = result;

  return (
    <div className="rounded-xl border border-[var(--color-accent-dim)] bg-[var(--color-bg-card)] p-5">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--color-accent)]">AI 综合分析</span>
        <span className="rounded-full bg-[var(--color-accent-dim)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent)]">
          DeepSeek V4
        </span>
      </div>

      {/* Main text */}
      <p className="text-sm leading-relaxed text-[var(--color-text-primary)]">
        {summary.text}
      </p>

      {/* Signal tags */}
      {summary.signals.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.signals.map((s, i) => {
            const cfg = levelCfg[s.level] ?? levelCfg.info;
            return (
              <div
                key={i}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${cfg.bg} ${cfg.border}`}
              >
                <span className="text-xs">{cfg.icon}</span>
                <span className={`text-xs font-medium ${cfg.text}`}>{s.indicator}</span>
                {s.message && (
                  <span className="text-xs text-[var(--color-text-secondary)]">{s.message}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Strategy adjustments */}
      {summary.adjustments && summary.adjustments.length > 0 && (
        <div className="mt-4 border-t border-[var(--color-border)] pt-3">
          <div className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
            AI 参数调整建议
          </div>
          <div className="space-y-1.5">
            {summary.adjustments.map((adj, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg bg-[var(--color-bg-primary)] px-3 py-2 text-xs"
              >
                <span className="mt-0.5 text-amber-400">↗</span>
                <div>
                  <span className="font-medium text-[var(--color-text-primary)]">{adj.field}</span>
                  <span className="text-[var(--color-text-secondary)]">
                    {' '}
                    {adj.before} →{' '}
                  </span>
                  <span className="font-medium text-[var(--color-accent)]">{adj.after}</span>
                  <div className="mt-0.5 text-[var(--color-text-secondary)]">{adj.reason}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
