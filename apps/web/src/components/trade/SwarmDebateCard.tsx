'use client';

// SwarmDebateCard: AI 委员会辩论组合卡片.
//
// 组合: SwarmAgentTimeline (5 agent 时间线) + SwarmVerdictCard (PM 决策).
// 5 状态 spec (plan-design-review D5):
//   pending  — 未启动, 显示 idle 引导
//   running  — agent 流式发言中, 显示 timeline + cancel
//   done     — 全部 done, 显示 timeline + verdict + feedback
//   partial  — 部分 agent 失败但有 verdict, 显示 timeline + verdict + warning banner
//   error    — 整 swarm 失败 (PM 失败 / 全局 error), 显示 timeline + error banner + 重试
//   aborted  — 用户 cancel 或 TTL, 显示 timeline + aborted banner + 重新召开

import { useState, useCallback } from 'react';
import { useSwarmStream, type SwarmRunInfo } from '@/hooks/useSwarmStream';
import SwarmAgentTimeline from './SwarmAgentTimeline';
import SwarmVerdictCard, { type FeedbackDecision } from './SwarmVerdictCard';

export interface SwarmDebateCardProps {
  /** null 时显示 idle 引导 + "召开委员会" 按钮; 非空时启动订阅. */
  runInfo: SwarmRunInfo | null;
  /** 用户点 "召开委员会" — 由父组件实际调 startSwarmRun. */
  onStart?: () => void;
  /** 已知 stockCode (idle 引导时显示). */
  stockCode?: string;
  /** 提交 feedback. 父组件调 submitSwarmFeedback. */
  onFeedback?: (decision: FeedbackDecision, modifiedPct?: number) => Promise<void> | void;
  /** 已提交 (后端 409 重复) 不再允许 click. */
  feedbackSent?: FeedbackDecision | null;
}

export default function SwarmDebateCard({
  runInfo,
  onStart,
  stockCode,
  onFeedback,
  feedbackSent = null,
}: SwarmDebateCardProps) {
  const { state, cancel } = useSwarmStream(runInfo);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  const handleFeedback = useCallback(
    async (decision: FeedbackDecision, modifiedPct?: number) => {
      if (!onFeedback || feedbackBusy || feedbackSent) return;
      setFeedbackBusy(true);
      try {
        await onFeedback(decision, modifiedPct);
      } finally {
        setFeedbackBusy(false);
      }
    },
    [onFeedback, feedbackBusy, feedbackSent],
  );

  // Idle: 未启动
  if (!runInfo || !state) {
    return <IdleState stockCode={stockCode} onStart={onStart} />;
  }

  const isRunning = state.state === 'running' || state.state === 'pending';
  const showVerdict = state.verdict && (state.state === 'done' || state.state === 'partial');

  return (
    <article
      data-testid="swarm-debate-card"
      data-state={state.state}
      style={{
        background: 'var(--surface-base)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-4)',
        marginTop: 'var(--sp-5)',
      }}
    >
      <Header
        state={state.state}
        canCancel={isRunning}
        onCancel={cancel}
      />

      {/* 状态 banner */}
      {state.state === 'error' && (
        <StateBanner
          tone="danger"
          text="辩论失败 — AI 服务异常或某关键角色发言失败. 可重新召开."
          onAction={onStart}
          actionLabel="重新召开"
        />
      )}
      {state.state === 'aborted' && (
        <StateBanner
          tone="muted"
          text="辩论被中止, 可重新发起一次."
          onAction={onStart}
          actionLabel="重新召开"
        />
      )}
      {state.state === 'partial' && (
        <StateBanner
          tone="warning"
          text="辩论完成, 但有角色发言失败 — 决策仍可参考."
        />
      )}

      <SwarmAgentTimeline agents={state.agents} />

      {showVerdict && state.verdict && (
        <SwarmVerdictCard
          verdict={state.verdict}
          synthesis={state.synthesis}
          durationMs={state.durationMs}
          feedbackSent={feedbackSent}
          onFeedback={onFeedback ? handleFeedback : undefined}
        />
      )}
    </article>
  );
}

// ---- Idle (未启动) ----

function IdleState({ stockCode, onStart }: { stockCode?: string; onStart?: () => void }) {
  return (
    <div
      data-testid="swarm-idle"
      style={{
        background: 'var(--surface-1)',
        border: '1px dashed var(--border-2)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-4)',
        marginTop: 'var(--sp-5)',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 'var(--text-body)', color: 'var(--text-2)', marginBottom: 'var(--sp-1)' }}>
        多角色 AI 辩论 (看多 · 看空 · 风控 · 决策 · 总结)
      </p>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 'var(--sp-4)' }}>
        比单声音更可靠 · 用时 ~1-2 分钟
      </p>
      <button
        type="button"
        onClick={onStart}
        disabled={!onStart}
        style={{
          height: 'var(--control-md)',
          padding: '0 var(--sp-4)',
          borderRadius: 'var(--r-md)',
          background: 'var(--accent)',
          color: 'var(--accent-foreground)',
          border: '1px solid var(--accent-strong)',
          fontWeight: 500,
          cursor: onStart ? 'pointer' : 'not-allowed',
          opacity: onStart ? 1 : 0.5,
        }}
      >
        {stockCode ? `召开委员会 (${stockCode})` : '召开委员会'}
      </button>
    </div>
  );
}

// ---- Header (title + duration + cancel) ----

function Header({
  state,
  canCancel,
  onCancel,
}: {
  state: string;
  canCancel: boolean;
  onCancel: () => Promise<void>;
}) {
  const STATE_TEXT: Record<string, string> = {
    pending: '准备中…',
    running: '辩论中…',
    done: '辩论完成',
    partial: '辩论部分完成',
    error: '辩论失败',
    aborted: '辩论已取消',
  };
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-2)',
        marginBottom: 'var(--sp-4)',
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 'var(--r-sm)',
          background: 'var(--accent)',
          display: 'grid',
          placeItems: 'center',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--accent-foreground)',
        }}
      >
        AI
      </span>
      <span style={{ fontSize: 'var(--text-h3)', fontWeight: 600, color: 'var(--text-1)' }}>
        AI 投资委员会
      </span>
      <span
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-3)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        · {STATE_TEXT[state] ?? state}
      </span>
      {canCancel && (
        <button
          type="button"
          data-testid="swarm-cancel-btn"
          onClick={() => void onCancel()}
          style={{
            marginLeft: 'auto',
            height: 30,
            padding: '0 var(--sp-3)',
            borderRadius: 'var(--r-md)',
            background: 'transparent',
            color: 'var(--text-2)',
            border: '1px solid var(--border-1)',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
          }}
        >
          取消
        </button>
      )}
    </header>
  );
}

// ---- StateBanner ----

function StateBanner({
  tone,
  text,
  onAction,
  actionLabel,
}: {
  tone: 'danger' | 'warning' | 'muted';
  text: string;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const TONE: Record<typeof tone, { bg: string; color: string; border: string }> = {
    danger: { bg: 'var(--danger-bg)', color: 'var(--danger)', border: 'var(--up-dim)' },
    warning: { bg: 'var(--warning-bg)', color: 'var(--warning)', border: 'var(--warning)' },
    muted: { bg: 'var(--surface-2)', color: 'var(--text-2)', border: 'var(--border-1)' },
  };
  const t = TONE[tone];
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        padding: 'var(--sp-2) var(--sp-3)',
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 'var(--r-md)',
        marginBottom: 'var(--sp-3)',
        fontSize: 'var(--text-sm)',
        color: t.color,
      }}
    >
      <span style={{ flex: 1 }}>{text}</span>
      {onAction && actionLabel && (
        <button
          type="button"
          onClick={onAction}
          style={{
            height: 28,
            padding: '0 var(--sp-3)',
            borderRadius: 'var(--r-md)',
            background: 'transparent',
            color: t.color,
            border: `1px solid ${t.border}`,
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
