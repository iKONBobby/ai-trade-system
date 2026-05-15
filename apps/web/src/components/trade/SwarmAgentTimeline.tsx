'use client';

// SwarmAgentTimeline: 垂直时间线渲染 5 个 agent block.
// 设计依据: plan-design-review D3 (垂直 + 单字徽章 + DESIGN.md §三 Card 规范).
// 颜色: 多=--up 空=--down 险=--warning 决=--accent 总=--text-2.

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
  streaming: '生成中…',
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
    </ol>
  );
}

function AgentBlock({ agent }: { agent: AgentRuntime }) {
  const visual = AGENT_VISUAL[agent.id];
  const stColor = stateColor(agent.state);
  const isStreaming = agent.state === 'streaming';
  const isFailed = agent.state === 'failed';

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
          marginBottom: agent.streamedText || agent.output || agent.errorMessage ? 'var(--sp-2)' : 0,
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
          <span
            style={{
              marginLeft: 'var(--sp-2)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-3)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {agent.id}
          </span>
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
              animation: isStreaming ? 'swarm-agent-pulse 1.2s ease-in-out infinite' : 'none',
            }}
          />
          {STATE_LABEL[agent.state]}
        </span>
      </div>

      {/* 内容: 流式 text / done output / error message */}
      {isFailed && agent.errorMessage && (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            color: 'var(--danger)',
          }}
        >
          ❌ {agent.errorMessage}
        </p>
      )}

      {!isFailed && agent.state === 'aborted' && (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
          (此角色未能完成发言)
        </p>
      )}

      {!isFailed && agent.streamedText && agent.state !== 'aborted' && (
        <p
          aria-live="polite"
          aria-atomic="false"
          style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            color: 'var(--text-2)',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {agent.streamedText}
        </p>
      )}

      {/* done state: 渲染结构化 output 摘要 */}
      {agent.state === 'done' && agent.output && (
        <AgentOutputSummary agentId={agent.id} output={agent.output} />
      )}

      <style jsx>{`
        @keyframes swarm-agent-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-testid^='swarm-agent-'] span {
            animation: none !important;
          }
        }
      `}</style>
    </li>
  );
}

// ---- 输出 summary (按 agent 类型展开关键字段) ----

function AgentOutputSummary({ agentId, output }: { agentId: AgentId; output: AgentOutput }) {
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
    items.push(`${output.verdict.toUpperCase()} · 置信度 ${output.confidence}% · 仓位 ${output.position_size_pct}%`);
    items.push(output.key_thesis);
  } else if (agentId === 'synthesizer' && 'disagreements' in output) {
    items.push(...output.disagreements);
    items.push(`PM 信心调整: ${output.pm_confidence_offset > 0 ? '+' : ''}${output.pm_confidence_offset}`);
  }

  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-2)',
            lineHeight: 1.6,
          }}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
