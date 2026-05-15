// Runtime: sequential 编排 — 逐 agent 调 worker, 注入 upstream context, emit SSE events.
//
// MVP: sequential only (plan-eng-review/CEO 削减 parallel/consensus).

import type {
  MarketData,
  AnalysisResult,
  SwarmEvent,
  AgentId,
  AgentOutput,
  PortfolioManagerOutput,
  SynthesizerOutput,
} from '@trade/shared';
import type { PresetSpec } from './types.js';
import { buildGrounding } from './grounding.js';
import { executeAgent } from './worker.js';

export interface RunSwarmArgs {
  preset: PresetSpec;
  market: MarketData;
  analysis: AnalysisResult;
  runId: string;
  signal: AbortSignal;
  emit: (event: SwarmEvent) => void;
  /**
   * 可选: emit 前调一次, 通知 caller 更新 last-heartbeat (C1 TTL 防御).
   * API route 注入 `() => runRegistry.heartbeat(runId)`. 测试不传.
   */
  onHeartbeat?: () => void;
  /** 测试 hook: 覆盖默认 worker (注入 mock). */
  agentExecutor?: typeof executeAgent;
}

function abortReason(signal: AbortSignal): 'user_cancel' | 'ttl_timeout' {
  const reason = signal.reason;
  if (reason instanceof Error && reason.message === 'ttl_timeout') return 'ttl_timeout';
  return 'user_cancel';
}

export async function runSwarm(args: RunSwarmArgs): Promise<void> {
  const {
    preset,
    market,
    analysis,
    runId,
    signal,
    emit: rawEmit,
    onHeartbeat,
    agentExecutor = executeAgent,
  } = args;

  const emit = (event: SwarmEvent) => {
    onHeartbeat?.();
    rawEmit(event);
  };

  const grounding = buildGrounding(market, analysis);
  const upstreamOutputs = new Map<AgentId, AgentOutput>();
  const upstreamFailures = new Set<AgentId>();

  emit({
    type: 'swarm_started',
    runId,
    presetId: preset.name,
    agentIds: preset.agents.map((a) => a.id),
  });

  const startedAt = Date.now();

  for (let i = 0; i < preset.agents.length; i++) {
    if (signal.aborted) {
      emit({ type: 'swarm_aborted', reason: abortReason(signal) });
      return;
    }
    const agent = preset.agents[i];
    emit({ type: 'agent_started', agentId: agent.id, index: i });

    const result = await agentExecutor({
      agent,
      grounding,
      upstreamOutputs,
      upstreamFailures,
      signal,
      emit,
    });

    if (signal.aborted) {
      emit({ type: 'swarm_aborted', reason: abortReason(signal) });
      return;
    }

    if (result.kind === 'ok') {
      upstreamOutputs.set(agent.id, result.output);
      emit({ type: 'agent_completed', agentId: agent.id, output: result.output });
    } else {
      upstreamFailures.add(agent.id);
      emit({ type: 'agent_failed', agentId: agent.id, message: result.message });
      if (agent.id === 'portfolio_manager') {
        emit({ type: 'swarm_error', agentId: agent.id, message: result.message });
        return;
      }
      // 其他 agent 失败 → 继续, 下游 injectUpstream 走占位串
    }
  }

  const pmOutput = upstreamOutputs.get('portfolio_manager') as PortfolioManagerOutput | undefined;
  if (!pmOutput) {
    emit({ type: 'swarm_error', message: 'portfolio_manager 未产出 verdict' });
    return;
  }

  const synthesis = upstreamOutputs.get('synthesizer') as SynthesizerOutput | undefined;

  emit({
    type: 'swarm_completed',
    runId,
    verdict: pmOutput,
    synthesis,
    durationMs: Date.now() - startedAt,
  });
}
