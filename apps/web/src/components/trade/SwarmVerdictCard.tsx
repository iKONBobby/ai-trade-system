'use client';

// SwarmVerdictCard: PM 最终决策卡 + feedback 三按钮.
// 设计依据: plan-design-review D2 (A 股本地化色) + D5 (5 状态).
// 颜色规则:
//   buy   → --up (#ef4444 红, A 股看涨)
//   sell  → --down (#22c55e 绿, A 股看跌)
//   hold  → --text-2 (中性灰)
//   avoid → --warning (#f59e0b 橙)

import { useMemo } from 'react';
import type {
  PortfolioManagerOutput,
  SwarmVerdictCode,
  SynthesizerOutput,
} from '@trade/shared';

const VERDICT_COLOR: Record<SwarmVerdictCode, string> = {
  buy: 'var(--up)',
  sell: 'var(--down)',
  hold: 'var(--text-2)',
  avoid: 'var(--warning)',
};

const VERDICT_LABEL: Record<SwarmVerdictCode, string> = {
  buy: 'BUY · 买入',
  sell: 'SELL · 卖出',
  hold: 'HOLD · 观望',
  avoid: 'AVOID · 规避',
};

function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) return '--';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export type FeedbackDecision = 'accept' | 'reject' | 'modify';

export interface SwarmVerdictCardProps {
  verdict: PortfolioManagerOutput;
  synthesis?: SynthesizerOutput;
  durationMs?: number;
  feedbackSent?: FeedbackDecision | null;
  onFeedback?: (decision: FeedbackDecision, modifiedPositionPct?: number) => void;
}

export default function SwarmVerdictCard({
  verdict,
  synthesis,
  durationMs,
  feedbackSent = null,
  onFeedback,
}: SwarmVerdictCardProps) {
  const color = VERDICT_COLOR[verdict.verdict];
  const label = VERDICT_LABEL[verdict.verdict];
  const dur = useMemo(() => formatDuration(durationMs), [durationMs]);

  return (
    <article
      data-testid="swarm-verdict-card"
      role="status"
      aria-live="polite"
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-5)',
        marginTop: 'var(--sp-4)',
      }}
    >
      {/* 顶栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-2)',
          marginBottom: 'var(--sp-4)',
        }}
      >
        <span style={{ fontSize: 'var(--text-h3)', fontWeight: 600, color: 'var(--text-1)' }}>
          AI 投资委员会
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-3)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          辩论时长 {dur}
        </span>
      </div>

      {/* Verdict + Score ring */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 'var(--sp-5)',
          alignItems: 'center',
          marginBottom: 'var(--sp-4)',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div
            data-testid="swarm-verdict-label"
            style={{
              fontSize: 'var(--text-h1)',
              fontWeight: 700,
              color,
              fontFamily: 'var(--font-num)',
              letterSpacing: '0.02em',
              lineHeight: 1.2,
            }}
          >
            {label}
          </div>
          <div
            className="num"
            style={{
              marginTop: 'var(--sp-1)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-2)',
              fontFamily: 'var(--font-num)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            置信度 {verdict.confidence}%
          </div>
        </div>
        <ScoreRing pct={verdict.position_size_pct} color={color} />
      </div>

      {/* 三论点行 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        <ThesisRow
          label="核心论点"
          text={verdict.key_thesis}
          stripeColor="var(--up)"
        />
        {verdict.risks.length > 0 && (
          <ThesisRow
            label="主要风险"
            text={verdict.risks.join('; ')}
            stripeColor="var(--warning)"
          />
        )}
        {synthesis && synthesis.disagreements.length > 0 && (
          <ThesisRow
            label="主要分歧"
            text={synthesis.disagreements.join('; ')}
            stripeColor="var(--text-2)"
          />
        )}
        {synthesis && synthesis.missing_info.length > 0 && (
          <ThesisRow
            label="缺失信息"
            text={synthesis.missing_info.join('; ')}
            stripeColor="var(--info)"
          />
        )}
      </div>

      {/* 策略提示 */}
      {verdict.strategy_hint !== 'none' && (
        <div
          style={{
            marginTop: 'var(--sp-3)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-3)',
          }}
        >
          建议策略: {verdict.strategy_hint === 'grid' ? '网格交易' : '条件单'}
        </div>
      )}

      {/* Feedback 三按钮 */}
      {onFeedback && (
        <div
          data-testid="swarm-feedback-row"
          style={{
            display: 'flex',
            gap: 'var(--sp-2)',
            marginTop: 'var(--sp-5)',
            paddingTop: 'var(--sp-4)',
            borderTop: '1px solid var(--border-1)',
          }}
        >
          <FeedbackButton
            label="采纳"
            primary
            disabled={!!feedbackSent}
            selected={feedbackSent === 'accept'}
            onClick={() => onFeedback('accept')}
          />
          <FeedbackButton
            label="不采纳"
            disabled={!!feedbackSent}
            selected={feedbackSent === 'reject'}
            onClick={() => onFeedback('reject')}
          />
          <FeedbackButton
            label="修改仓位"
            disabled={!!feedbackSent}
            selected={feedbackSent === 'modify'}
            onClick={() => {
              const raw = window.prompt(
                '修改后的仓位百分比 (0-100)?',
                String(verdict.position_size_pct),
              );
              if (raw === null) return;
              const pct = Number(raw);
              if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
                onFeedback('modify', pct);
              }
            }}
          />
        </div>
      )}
    </article>
  );
}

// ---- ScoreRing (36x36 SVG conic-style 进度环) ----

function ScoreRing({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = 15;
  const circumference = 2 * Math.PI * r;
  const dashed = (clamped / 100) * circumference;
  return (
    <div
      data-testid="swarm-score-ring"
      aria-label={`建议仓位 ${clamped}%`}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        gap: 'var(--sp-1)',
      }}
    >
      <svg width="48" height="48" viewBox="0 0 36 36" aria-hidden>
        <circle
          cx="18"
          cy="18"
          r={r}
          stroke="var(--surface-3)"
          strokeWidth="3"
          fill="none"
        />
        <circle
          cx="18"
          cy="18"
          r={r}
          stroke={color}
          strokeWidth="3"
          fill="none"
          strokeDasharray={`${dashed} ${circumference}`}
          strokeDashoffset="0"
          transform="rotate(-90 18 18)"
          strokeLinecap="round"
        />
        <text
          x="18"
          y="20"
          textAnchor="middle"
          fontSize="9"
          fill="var(--text-1)"
          fontFamily="var(--font-num)"
          fontWeight="600"
        >
          {clamped}%
        </text>
      </svg>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>建议仓位</span>
    </div>
  );
}

// ---- ThesisRow (左 3px 色条 + label + text) ----

function ThesisRow({ label, text, stripeColor }: { label: string; text: string; stripeColor: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--sp-3)',
        paddingLeft: 'var(--sp-3)',
        position: 'relative',
        fontSize: 'var(--text-sm)',
        lineHeight: 1.6,
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 2,
          bottom: 2,
          width: 3,
          background: stripeColor,
          borderRadius: 1.5,
        }}
      />
      <span style={{ color: 'var(--text-3)', flexShrink: 0, minWidth: 60 }}>{label}:</span>
      <span style={{ color: 'var(--text-1)' }}>{text}</span>
    </div>
  );
}

// ---- FeedbackButton (复用 .btn 系统的简化 inline 版本) ----

function FeedbackButton({
  label,
  primary,
  disabled,
  selected,
  onClick,
}: {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  selected?: boolean;
  onClick: () => void;
}) {
  const base = {
    flex: 1,
    height: 36,
    borderRadius: 'var(--r-md)',
    fontSize: 'var(--text-body)',
    fontWeight: 500 as const,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all var(--motion-1) var(--ease)',
  };
  const selectedStyle = selected
    ? {
        background: 'var(--accent)',
        color: '#0a0b0d',
        border: '1px solid var(--accent-strong)',
      }
    : primary
      ? {
          background: 'var(--accent)',
          color: '#0a0b0d',
          border: '1px solid var(--accent-strong)',
        }
      : {
          background: 'transparent',
          color: 'var(--text-1)',
          border: '1px solid var(--border-1)',
        };
  return (
    <button
      type="button"
      aria-pressed={selected ? 'true' : undefined}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...base,
        ...selectedStyle,
        opacity: disabled && !selected ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  );
}
