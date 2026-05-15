import { describe, it, expect } from 'vitest';
import type {
  SwarmEvent,
  SwarmRuntimeState,
  BullOutput,
  PortfolioManagerOutput,
} from '@trade/shared';
import { swarmReducer, initialSwarmState } from '../useSwarmStream';

const BULL: BullOutput = {
  thesis_bullets: ['趋势强'],
  confidence: 'high',
  key_data_points: [],
};

const VERDICT: PortfolioManagerOutput = {
  verdict: 'buy',
  confidence: 78,
  position_size_pct: 35,
  key_thesis: '基本面拐点',
  risks: [],
  strategy_hint: 'grid',
};

function apply(state: SwarmRuntimeState, events: SwarmEvent[]): SwarmRuntimeState {
  return events.reduce(swarmReducer, state);
}

describe('initialSwarmState', () => {
  it('返回 pending state + 空 agents', () => {
    const s = initialSwarmState('swr_x', 1000);
    expect(s).toEqual({
      runId: 'swr_x',
      presetId: '',
      startedAt: 1000,
      agents: [],
      state: 'pending',
    });
  });
});

describe('swarmReducer', () => {
  const init = initialSwarmState('swr_x', 1000);

  it('swarm_started 填充 agents + 转 running', () => {
    const next = swarmReducer(init, {
      type: 'swarm_started',
      runId: 'swr_x',
      presetId: 'investment_committee',
      agentIds: ['bull_advocate', 'bear_advocate'],
    });
    expect(next.state).toBe('running');
    expect(next.presetId).toBe('investment_committee');
    expect(next.agents).toHaveLength(2);
    expect(next.agents[0]).toMatchObject({
      id: 'bull_advocate',
      role: '看多研究员',
      state: 'pending',
      streamedText: '',
    });
  });

  it('agent_started 把对应 agent 变 streaming + 清 streamedText', () => {
    const after = apply(init, [
      {
        type: 'swarm_started',
        runId: 'swr_x',
        presetId: 'p',
        agentIds: ['bull_advocate'],
      },
      { type: 'agent_started', agentId: 'bull_advocate', index: 0 },
    ]);
    expect(after.agents[0].state).toBe('streaming');
  });

  it('agent_chunk 累积 streamedText', () => {
    const after = apply(init, [
      {
        type: 'swarm_started',
        runId: 'swr_x',
        presetId: 'p',
        agentIds: ['bull_advocate'],
      },
      { type: 'agent_started', agentId: 'bull_advocate', index: 0 },
      { type: 'agent_chunk', agentId: 'bull_advocate', text: 'hello ', done: false },
      { type: 'agent_chunk', agentId: 'bull_advocate', text: 'world', done: false },
    ]);
    expect(after.agents[0].streamedText).toBe('hello world');
  });

  it('agent_chunk 未知 agentId 时 noop', () => {
    const after = swarmReducer(
      {
        ...init,
        state: 'running',
        agents: [{ id: 'bull_advocate', role: '看多研究员', state: 'streaming', streamedText: 'x' }],
      },
      { type: 'agent_chunk', agentId: 'bear_advocate', text: 'late', done: false },
    );
    expect(after.agents[0].streamedText).toBe('x');
  });

  it('agent_completed 设 state=done + output', () => {
    const after = apply(init, [
      {
        type: 'swarm_started',
        runId: 'swr_x',
        presetId: 'p',
        agentIds: ['bull_advocate'],
      },
      { type: 'agent_started', agentId: 'bull_advocate', index: 0 },
      { type: 'agent_chunk', agentId: 'bull_advocate', text: 'x', done: false },
      { type: 'agent_completed', agentId: 'bull_advocate', output: BULL },
    ]);
    expect(after.agents[0].state).toBe('done');
    expect(after.agents[0].output).toEqual(BULL);
    expect(after.agents[0].streamedText).toBe('x'); // 保留 chunks
  });

  it('agent_failed 设 state=failed + errorMessage', () => {
    const after = apply(init, [
      {
        type: 'swarm_started',
        runId: 'swr_x',
        presetId: 'p',
        agentIds: ['bull_advocate'],
      },
      { type: 'agent_failed', agentId: 'bull_advocate', message: 'JSON 损坏' },
    ]);
    expect(after.agents[0].state).toBe('failed');
    expect(after.agents[0].errorMessage).toBe('JSON 损坏');
  });

  it('swarm_completed 全部 done → state=done + verdict', () => {
    const after = apply(init, [
      {
        type: 'swarm_started',
        runId: 'swr_x',
        presetId: 'p',
        agentIds: ['bull_advocate', 'portfolio_manager'],
      },
      { type: 'agent_completed', agentId: 'bull_advocate', output: BULL },
      { type: 'agent_completed', agentId: 'portfolio_manager', output: VERDICT },
      {
        type: 'swarm_completed',
        runId: 'swr_x',
        verdict: VERDICT,
        durationMs: 100,
      },
    ]);
    expect(after.state).toBe('done');
    expect(after.verdict).toEqual(VERDICT);
    expect(after.durationMs).toBe(100);
  });

  it('swarm_completed 但有 agent failed → state=partial', () => {
    const after = apply(init, [
      {
        type: 'swarm_started',
        runId: 'swr_x',
        presetId: 'p',
        agentIds: ['bull_advocate', 'bear_advocate', 'portfolio_manager'],
      },
      { type: 'agent_failed', agentId: 'bear_advocate', message: 'x' },
      { type: 'agent_completed', agentId: 'bull_advocate', output: BULL },
      { type: 'agent_completed', agentId: 'portfolio_manager', output: VERDICT },
      {
        type: 'swarm_completed',
        runId: 'swr_x',
        verdict: VERDICT,
        durationMs: 100,
      },
    ]);
    expect(after.state).toBe('partial');
    expect(after.verdict).toEqual(VERDICT);
  });

  it('swarm_error 全局 → state=error', () => {
    const after = apply(init, [
      {
        type: 'swarm_started',
        runId: 'swr_x',
        presetId: 'p',
        agentIds: ['bull_advocate'],
      },
      { type: 'swarm_error', message: '服务挂了' },
    ]);
    expect(after.state).toBe('error');
  });

  it('swarm_error 带 agentId → 标记该 agent failed', () => {
    const after = apply(init, [
      {
        type: 'swarm_started',
        runId: 'swr_x',
        presetId: 'p',
        agentIds: ['bull_advocate', 'portfolio_manager'],
      },
      {
        type: 'swarm_error',
        agentId: 'portfolio_manager',
        message: 'PM JSON 损坏',
      },
    ]);
    expect(after.state).toBe('error');
    const pm = after.agents.find((a) => a.id === 'portfolio_manager');
    expect(pm?.state).toBe('failed');
    expect(pm?.errorMessage).toBe('PM JSON 损坏');
  });

  it('swarm_aborted → state=aborted, pending/streaming agent 转 aborted', () => {
    const after = apply(init, [
      {
        type: 'swarm_started',
        runId: 'swr_x',
        presetId: 'p',
        agentIds: ['bull_advocate', 'bear_advocate', 'portfolio_manager'],
      },
      { type: 'agent_completed', agentId: 'bull_advocate', output: BULL },
      { type: 'agent_started', agentId: 'bear_advocate', index: 1 },
      { type: 'swarm_aborted', reason: 'user_cancel' },
    ]);
    expect(after.state).toBe('aborted');
    expect(after.agents.find((a) => a.id === 'bull_advocate')?.state).toBe('done');
    expect(after.agents.find((a) => a.id === 'bear_advocate')?.state).toBe('aborted');
    expect(after.agents.find((a) => a.id === 'portfolio_manager')?.state).toBe('aborted');
  });
});
