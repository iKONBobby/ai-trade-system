import { describe, it, expect } from 'vitest';
import type {
  MarketData,
  AnalysisResult,
  AgentId,
  SwarmEvent,
  PortfolioManagerOutput,
} from '@trade/shared';
import { runSwarm } from '../runtime.js';
import type { PresetSpec, AgentSpec, AgentExecutionResult } from '../types.js';

// ---- Fixtures ----

const SAMPLE_MARKET: MarketData = {
  code: '600519',
  name: '贵州茅台',
  price: 1680,
  change: 1.2,
  volume: 100,
  turnover: 0.5,
  open: 1670,
  high: 1685,
  low: 1668,
  preClose: 1660,
};

const SAMPLE_ANALYSIS: AnalysisResult = {
  marketState: 'trending_up',
  bollinger: { upper: 1700, middle: 1680, lower: 1660, width: 0.02 },
  atr: 25,
  ma: { ma5: 1675, ma20: 1650, ma60: 1620 },
  support: 1650,
  resistance: 1700,
  recommendation: 'grid',
  confidence: 75,
  advanced: {
    rsi: null,
    macd: null,
    kdj: null,
    wr: null,
    amplitude: 1,
    volumeRatio: null,
    limitDistance: { up: 5, down: 10 },
    maArrangement: 'bullish_alignment',
  },
};

function mkAgentSpec(id: AgentId, upstream: AgentId[] = []): AgentSpec {
  return {
    id,
    role: 'test',
    system_prompt: 'sp',
    skills: [],
    upstream_context: upstream,
    max_tokens: 1000,
    temperature: 0.4,
  };
}

const PRESET: PresetSpec = {
  name: 'investment_committee',
  title: '投资委员会',
  description: '多空辩论 → 风控 → PM',
  agents: [
    mkAgentSpec('bull_advocate'),
    mkAgentSpec('bear_advocate'),
    mkAgentSpec('risk_officer', ['bull_advocate', 'bear_advocate']),
    mkAgentSpec('portfolio_manager', ['bull_advocate', 'bear_advocate', 'risk_officer']),
  ],
};

const PM_VERDICT: PortfolioManagerOutput = {
  verdict: 'buy',
  confidence: 78,
  position_size_pct: 35,
  key_thesis: '基本面拐点',
  risks: ['北向'],
  strategy_hint: 'grid',
};

// 返回各 agent id → 固定 mock output 的 executor 工厂
function mkExecutor(
  outputs: Partial<Record<AgentId, AgentExecutionResult>>,
): (ctx: { agent: AgentSpec }) => Promise<AgentExecutionResult> {
  return async (ctx) => {
    const result = outputs[ctx.agent.id];
    if (result) return result;
    // default: 看 id 给个最小合规输出
    if (ctx.agent.id === 'portfolio_manager') {
      return { kind: 'ok', output: PM_VERDICT };
    }
    return {
      kind: 'ok',
      output: {
        thesis_bullets: ['x'],
        confidence: 'medium',
        key_data_points: [],
      },
    };
  };
}

describe('runSwarm', () => {
  it('happy path: 顺序 emit 全部 4 个 agent + swarm_completed 带 verdict', async () => {
    const emitted: SwarmEvent[] = [];
    await runSwarm({
      preset: PRESET,
      market: SAMPLE_MARKET,
      analysis: SAMPLE_ANALYSIS,
      runId: 'swr_test1',
      signal: new AbortController().signal,
      emit: (e) => emitted.push(e),
      agentExecutor: mkExecutor({}),
    });

    const types = emitted.map((e) => e.type);
    expect(types[0]).toBe('swarm_started');
    expect(types[types.length - 1]).toBe('swarm_completed');

    // 每个 agent 都有 started + completed
    const startedIds = emitted
      .filter((e) => e.type === 'agent_started')
      .map((e) => (e as { agentId: AgentId }).agentId);
    expect(startedIds).toEqual([
      'bull_advocate',
      'bear_advocate',
      'risk_officer',
      'portfolio_manager',
    ]);

    const completed = emitted.find((e) => e.type === 'swarm_completed') as
      | { verdict: PortfolioManagerOutput }
      | undefined;
    expect(completed?.verdict.verdict).toBe('buy');
  });

  it('agent 顺序严格按 preset.agents', async () => {
    const order: AgentId[] = [];
    await runSwarm({
      preset: PRESET,
      market: SAMPLE_MARKET,
      analysis: SAMPLE_ANALYSIS,
      runId: 'swr_test2',
      signal: new AbortController().signal,
      emit: () => {},
      agentExecutor: async (ctx) => {
        order.push(ctx.agent.id);
        if (ctx.agent.id === 'portfolio_manager') return { kind: 'ok', output: PM_VERDICT };
        return {
          kind: 'ok',
          output: {
            thesis_bullets: ['x'],
            confidence: 'medium',
            key_data_points: [],
          },
        };
      },
    });
    expect(order).toEqual([
      'bull_advocate',
      'bear_advocate',
      'risk_officer',
      'portfolio_manager',
    ]);
  });

  it('signal 已 aborted → emit swarm_aborted, 不执行任何 agent', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const emitted: SwarmEvent[] = [];
    let executorCalls = 0;
    await runSwarm({
      preset: PRESET,
      market: SAMPLE_MARKET,
      analysis: SAMPLE_ANALYSIS,
      runId: 'swr_abort1',
      signal: ctrl.signal,
      emit: (e) => emitted.push(e),
      agentExecutor: async () => {
        executorCalls++;
        return { kind: 'ok', output: PM_VERDICT };
      },
    });
    expect(executorCalls).toBe(0);
    expect(emitted.some((e) => e.type === 'swarm_aborted')).toBe(true);
  });

  it('TTL abort: signal.reason=ttl_timeout → swarm_aborted reason 正确', async () => {
    const ctrl = new AbortController();
    ctrl.abort(new Error('ttl_timeout'));
    const emitted: SwarmEvent[] = [];
    await runSwarm({
      preset: PRESET,
      market: SAMPLE_MARKET,
      analysis: SAMPLE_ANALYSIS,
      runId: 'swr_ttl',
      signal: ctrl.signal,
      emit: (e) => emitted.push(e),
      agentExecutor: mkExecutor({}),
    });
    const abortEvent = emitted.find((e) => e.type === 'swarm_aborted') as
      | { reason: string }
      | undefined;
    expect(abortEvent?.reason).toBe('ttl_timeout');
  });

  it('非 PM agent 失败 → 继续后续 + agent_failed event', async () => {
    const emitted: SwarmEvent[] = [];
    await runSwarm({
      preset: PRESET,
      market: SAMPLE_MARKET,
      analysis: SAMPLE_ANALYSIS,
      runId: 'swr_fail',
      signal: new AbortController().signal,
      emit: (e) => emitted.push(e),
      agentExecutor: mkExecutor({
        bear_advocate: { kind: 'failed', message: '解析失败' },
      }),
    });
    expect(emitted.some((e) => e.type === 'agent_failed')).toBe(true);
    expect(emitted.some((e) => e.type === 'swarm_completed')).toBe(true);
  });

  it('PM 失败 → swarm_error 提前终止 (无 swarm_completed)', async () => {
    const emitted: SwarmEvent[] = [];
    await runSwarm({
      preset: PRESET,
      market: SAMPLE_MARKET,
      analysis: SAMPLE_ANALYSIS,
      runId: 'swr_pm_fail',
      signal: new AbortController().signal,
      emit: (e) => emitted.push(e),
      agentExecutor: mkExecutor({
        portfolio_manager: { kind: 'failed', message: 'JSON 损坏' },
      }),
    });
    expect(emitted.some((e) => e.type === 'swarm_error')).toBe(true);
    expect(emitted.some((e) => e.type === 'swarm_completed')).toBe(false);
  });

  it('onHeartbeat 每次 emit 触发一次', async () => {
    let beats = 0;
    const emitted: SwarmEvent[] = [];
    await runSwarm({
      preset: PRESET,
      market: SAMPLE_MARKET,
      analysis: SAMPLE_ANALYSIS,
      runId: 'swr_hb',
      signal: new AbortController().signal,
      emit: (e) => emitted.push(e),
      agentExecutor: mkExecutor({}),
      onHeartbeat: () => beats++,
    });
    expect(beats).toBe(emitted.length);
    expect(beats).toBeGreaterThan(0);
  });

  it('runtime 跑完后 signal 才 abort → 仍 emit swarm_completed (race 边界)', async () => {
    const ctrl = new AbortController();
    const emitted: SwarmEvent[] = [];
    await runSwarm({
      preset: PRESET,
      market: SAMPLE_MARKET,
      analysis: SAMPLE_ANALYSIS,
      runId: 'swr_race',
      signal: ctrl.signal,
      emit: (e) => emitted.push(e),
      agentExecutor: mkExecutor({}),
    });
    ctrl.abort();
    expect(emitted.some((e) => e.type === 'swarm_completed')).toBe(true);
  });
});
