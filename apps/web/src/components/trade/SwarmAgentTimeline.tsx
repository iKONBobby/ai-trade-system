'use client';

// SwarmAgentTimeline: 垂直时间线渲染 5 个 agent block.
// 设计依据: plan-design-review D3 (垂直 + 单字徽章 + DESIGN.md §三 Card 规范).
// 颜色: 多=--up 空=--down 险=--warning 决=--accent 总=--text-2.
//
// D1 (design-html, A 方案): agent 流式输出的是严格 JSON, 普通用户看不懂.
//   流式期 → 不渲染原始 JSON, 改 "正在分析…" 脉冲骨架 (也盖住推理模型 thinking 死等).
//   done   → 把人话摘要逐条打字浮现 (typewriter), 像委员会在轮流发言.

import { useEffect, useRef, useState } from 'react';
import type { AgentId, AgentRuntime, AgentState, AgentOutput } from '@trade/shared';

interface AgentVisualSpec {
  badge: string;
  color: string; // CSS var
  bg: string; // CSS var (light tint)
}

const AGENT_VISUAL: Record<AgentId, AgentVisualSpec> = {
  bull_advocate: { badge: '多', color: 'var(--up)', bg: 'var(--up-bg)' },
  bear_advocate: { badge: '空', color: 'var(--down)', bg: 'var(--down-bg)' },
  risk_officer: { badge: '险', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  portfolio_manager: { badge: '决', color: 'var(--accent)', bg: 'var(--accent-bg)' },
  synthesizer: { badge: '总', color: 'var(--text-2)', bg: 'var(--surface-2)' },
};

const STATE_LABEL: Record<AgentState, string> = {
  pending: '等待中',
  streaming: '分析中…',
  done: '完成',
  failed: '失败',
  aborted: '已取消',
};

function stateColor(state: AgentState): string {
  if (state === 'failed') return 'var(--danger)';
  if (state === 'aborted') return 'var(--text-3)';
  if (state === 'pending') return 'var(--text-disabled)';
  return 'var(--accent)';
}

// ---- prefers-reduced-motion (SSR 安全, 客户端订阅) ----

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    // matchMedia 不可用 (jsdom / 老环境) → 视作 reduced, 直接出终态
    if (typeof window.matchMedia !== 'function') {
      setReduced(true);
      return;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export default function SwarmAgentTimeline({ agents }: { agents: AgentRuntime[] }) {
  return (
    <ol
      data-testid="swarm-agent-timeline"
      role="list"
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-3)',
      }}
    >
      {agents.map((agent) => (
        <AgentBlock key={agent.id} agent={agent} />
      ))}

      <style jsx global>{`
        @keyframes swarm-agent-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
        @keyframes swarm-shimmer {
          0% {
            background-position: -160px 0;
          }
          100% {
            background-position: 240px 0;
          }
        }
        @keyframes swarm-caret-blink {
          0%,
          45% {
            opacity: 1;
          }
          55%,
          100% {
            opacity: 0;
          }
        }
        @keyframes swarm-line-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-testid^='swarm-agent-'] *,
          [data-testid='swarm-analyzing'] * {
            animation: none !important;
          }
        }
      `}</style>
    </ol>
  );
}

function AgentBlock({ agent }: { agent: AgentRuntime }) {
  const visual = AGENT_VISUAL[agent.id];
  const stColor = stateColor(agent.state);
  const isStreaming = agent.state === 'streaming';
  const isFailed = agent.state === 'failed';
  const reduced = usePrefersReducedMotion();

  const hasBody =
    isStreaming ||
    isFailed ||
    agent.state === 'aborted' ||
    (agent.state === 'done' && !!agent.output);

  return (
    <li
      role="listitem"
      data-testid={`swarm-agent-${agent.id}`}
      data-state={agent.state}
      style={{
        position: 'relative',
        background: 'var(--surface-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-3) var(--sp-4)',
        paddingLeft: 'calc(var(--sp-4) + 3px)',
        opacity: agent.state === 'aborted' ? 0.55 : 1,
      }}
    >
      {/* 左侧 3px 角色色条 */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: visual.color,
          borderTopLeftRadius: 'var(--r-lg)',
          borderBottomLeftRadius: 'var(--r-lg)',
        }}
      />

      {/* 头部: badge + role + status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-3)',
          marginBottom: hasBody ? 'var(--sp-2)' : 0,
        }}
      >
        <span
          aria-label={`${agent.role}徽章`}
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--r-md)',
            background: visual.bg,
            color: visual.color,
            display: 'inline-grid',
            placeItems: 'center',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {visual.badge}
        </span>
        <span
          style={{
            fontSize: 'var(--text-body)',
            fontWeight: 500,
            color: 'var(--text-1)',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {agent.role}
        </span>
        <span
          aria-label={`状态: ${STATE_LABEL[agent.state]}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--sp-1)',
            fontSize: 'var(--text-xs)',
            color: stColor,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: stColor,
              boxShadow: isStreaming ? `0 0 6px ${stColor}` : 'none',
              animation:
                isStreaming && !reduced
                  ? 'swarm-agent-pulse 1.2s ease-in-out infinite'
                  : 'none',
            }}
          />
          {STATE_LABEL[agent.state]}
        </span>
      </div>

      {/* 内容区 */}
      {isFailed && agent.errorMessage && (
        <p
          role="alert"
          style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--danger)' }}
        >
          ❌ {agent.errorMessage}
        </p>
      )}

      {!isFailed && agent.state === 'aborted' && (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
          (此角色未能完成发言)
        </p>
      )}

      {/* 流式期: 不展示原始 JSON, 改脉冲骨架 (也盖住 thinking 死等) */}
      {isStreaming && <AnalyzingSkeleton role={agent.role} reduced={reduced} />}

      {/* done: 人话摘要逐条打字浮现 */}
      {agent.state === 'done' && agent.output && (
        <AgentOutputSummary
          agentId={agent.id}
          output={agent.output}
          animate={!reduced}
        />
      )}
    </li>
  );
}

// ---- 流式期骨架: "XX 正在分析…" + shimmer 条 ----

function AnalyzingSkeleton({ role, reduced }: { role: string; reduced: boolean }) {
  const barBase = {
    height: 9,
    borderRadius: 4,
    background: reduced
      ? 'var(--surface-3)'
      : 'linear-gradient(90deg, var(--surface-3) 0%, var(--surface-2) 40%, var(--surface-3) 80%)',
    backgroundSize: '320px 100%',
    animation: reduced ? 'none' : 'swarm-shimmer 1.3s linear infinite',
  } as const;

  return (
    <div
      data-testid="swarm-analyzing"
      aria-live="polite"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}
    >
      <span
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-3)',
          animation: reduced ? 'none' : 'swarm-agent-pulse 1.4s ease-in-out infinite',
        }}
      >
        {role} 正在分析…
      </span>
      <div style={{ ...barBase, width: '92%' }} aria-hidden />
      <div style={{ ...barBase, width: '78%' }} aria-hidden />
      <div style={{ ...barBase, width: '60%' }} aria-hidden />
    </div>
  );
}

// ---- 输出 summary: 按 agent 类型抽人话 + 逐条打字浮现 ----

function summaryItems(agentId: AgentId, output: AgentOutput): string[] {
  const items: string[] = [];
  if (agentId === 'bull_advocate' && 'thesis_bullets' in output) {
    items.push(...output.thesis_bullets);
    items.push(`信心: ${output.confidence}`);
  } else if (agentId === 'bear_advocate' && 'risk_bullets' in output) {
    items.push(...output.risk_bullets);
    items.push(`严重度: ${output.severity}`);
  } else if (agentId === 'risk_officer' && 'net_risk_assessment' in output) {
    items.push(output.net_risk_assessment);
    items.push(`建议最大仓位: ${output.max_position_pct}%`);
  } else if (agentId === 'portfolio_manager' && 'verdict' in output) {
    items.push(
      `${output.verdict.toUpperCase()} · 置信度 ${output.confidence}% · 仓位 ${output.position_size_pct}%`,
    );
    items.push(output.key_thesis);
  } else if (agentId === 'synthesizer' && 'disagreements' in output) {
    items.push(...output.disagreements);
    items.push(
      `PM 信心调整: ${output.pm_confidence_offset > 0 ? '+' : ''}${output.pm_confidence_offset}`,
    );
  }
  return items.filter((s) => s && s.trim().length > 0);
}

function AgentOutputSummary({
  agentId,
  output,
  animate,
}: {
  agentId: AgentId;
  output: AgentOutput;
  animate: boolean;
}) {
  const items = summaryItems(agentId, output);

  // 逐条打字状态: lineIdx = 当前正在打的行, charLen = 当前行已显示字数.
  const [lineIdx, setLineIdx] = useState(animate ? 0 : items.length);
  const [charLen, setCharLen] = useState(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!animate) return;
    const list = itemsRef.current;
    if (lineIdx >= list.length) return; // 全部打完
    const text = list[lineIdx];
    if (charLen < text.length) {
      // 长行加速, 避免一句话打太久
      const step = text.length > 90 ? 3 : text.length > 45 ? 2 : 1;
      const t = setTimeout(
        () => setCharLen((c) => Math.min(text.length, c + step)),
        16,
      );
      return () => clearTimeout(t);
    }
    // 本行打完 → 停顿后进入下一行
    const t = setTimeout(() => {
      setLineIdx((i) => i + 1);
      setCharLen(0);
    }, 130);
    return () => clearTimeout(t);
  }, [animate, lineIdx, charLen]);

  // 只渲染到 lineIdx 为止 (后面的行还没"浮现")
  const visibleCount = animate ? Math.min(lineIdx + 1, items.length) : items.length;

  return (
    <ul
      aria-live="polite"
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {items.slice(0, visibleCount).map((item, i) => {
        const typing = animate && i === lineIdx;
        const text = typing ? item.slice(0, charLen) : item;
        return (
          <li
            key={i}
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-2)',
              lineHeight: 1.6,
              animation: animate ? 'swarm-line-in 0.22s var(--ease, ease-out)' : 'none',
            }}
          >
            {text}
            {typing && (
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: '0.5em',
                  marginLeft: 1,
                  borderBottom: '2px solid var(--accent)',
                  animation: 'swarm-caret-blink 0.9s steps(1) infinite',
                }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
