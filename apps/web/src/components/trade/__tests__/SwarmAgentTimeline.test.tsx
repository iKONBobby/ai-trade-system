import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { AgentRuntime, BullOutput, PortfolioManagerOutput } from '@trade/shared';
import SwarmAgentTimeline from '../SwarmAgentTimeline';

afterEach(() => cleanup());

function mkAgent(overrides: Partial<AgentRuntime> & { id: AgentRuntime['id'] }): AgentRuntime {
  return {
    role: '看多研究员',
    state: 'pending',
    streamedText: '',
    ...overrides,
  } as AgentRuntime;
}

describe('SwarmAgentTimeline', () => {
  it('渲染 5 个 agent block', () => {
    render(
      <SwarmAgentTimeline
        agents={[
          mkAgent({ id: 'bull_advocate', role: '看多研究员', state: 'pending' }),
          mkAgent({ id: 'bear_advocate', role: '看空研究员', state: 'pending' }),
          mkAgent({ id: 'risk_officer', role: '首席风险官', state: 'pending' }),
          mkAgent({ id: 'portfolio_manager', role: '投资经理', state: 'pending' }),
          mkAgent({ id: 'synthesizer', role: '中立总结者', state: 'pending' }),
        ]}
      />,
    );
    expect(screen.getByTestId('swarm-agent-bull_advocate')).toBeInTheDocument();
    expect(screen.getByTestId('swarm-agent-bear_advocate')).toBeInTheDocument();
    expect(screen.getByTestId('swarm-agent-risk_officer')).toBeInTheDocument();
    expect(screen.getByTestId('swarm-agent-portfolio_manager')).toBeInTheDocument();
    expect(screen.getByTestId('swarm-agent-synthesizer')).toBeInTheDocument();
  });

  it('单字徽章正确 (多/空/险/决/总)', () => {
    render(
      <SwarmAgentTimeline
        agents={[
          mkAgent({ id: 'bull_advocate', role: '看多研究员' }),
          mkAgent({ id: 'bear_advocate', role: '看空研究员' }),
          mkAgent({ id: 'risk_officer', role: '首席风险官' }),
          mkAgent({ id: 'portfolio_manager', role: '投资经理' }),
          mkAgent({ id: 'synthesizer', role: '中立总结者' }),
        ]}
      />,
    );
    expect(screen.getByText('多')).toBeInTheDocument();
    expect(screen.getByText('空')).toBeInTheDocument();
    expect(screen.getByText('险')).toBeInTheDocument();
    expect(screen.getByText('决')).toBeInTheDocument();
    expect(screen.getByText('总')).toBeInTheDocument();
  });

  it('data-state 反映 agent.state, 用于样式 hook', () => {
    render(
      <SwarmAgentTimeline
        agents={[
          mkAgent({ id: 'bull_advocate', role: '看多研究员', state: 'streaming' }),
          mkAgent({ id: 'bear_advocate', role: '看空研究员', state: 'done' }),
          mkAgent({ id: 'risk_officer', role: '首席风险官', state: 'failed', errorMessage: 'x' }),
        ]}
      />,
    );
    expect(screen.getByTestId('swarm-agent-bull_advocate')).toHaveAttribute('data-state', 'streaming');
    expect(screen.getByTestId('swarm-agent-bear_advocate')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('swarm-agent-risk_officer')).toHaveAttribute('data-state', 'failed');
  });

  it('streaming 状态隐藏原始文字, 显示分析中骨架 (D1 A 方案)', () => {
    render(
      <SwarmAgentTimeline
        agents={[
          mkAgent({
            id: 'bull_advocate',
            role: '看多研究员',
            state: 'streaming',
            streamedText: '{"thesis_bullets":["原始 JSON 不该展示',
          }),
        ]}
      />,
    );
    expect(screen.queryByText(/thesis_bullets/)).not.toBeInTheDocument();
    expect(screen.getByTestId('swarm-analyzing')).toBeInTheDocument();
    expect(screen.getByText(/看多研究员 正在分析…/)).toBeInTheDocument();
  });

  it('failed 状态显示错误信息 + alert role', () => {
    render(
      <SwarmAgentTimeline
        agents={[
          mkAgent({
            id: 'bull_advocate',
            role: '看多研究员',
            state: 'failed',
            errorMessage: 'JSON 输出格式错误',
          }),
        ]}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('JSON 输出格式错误');
  });

  it('aborted 状态显示占位提示', () => {
    render(
      <SwarmAgentTimeline
        agents={[
          mkAgent({
            id: 'bull_advocate',
            role: '看多研究员',
            state: 'aborted',
          }),
        ]}
      />,
    );
    expect(screen.getByText(/未能完成发言/)).toBeInTheDocument();
  });

  it('done 状态 bull_advocate 展开 thesis_bullets + 信心', () => {
    const output: BullOutput = {
      thesis_bullets: ['趋势强劲', 'MACD 金叉'],
      confidence: 'high',
      key_data_points: [],
    };
    render(
      <SwarmAgentTimeline
        agents={[
          mkAgent({
            id: 'bull_advocate',
            role: '看多研究员',
            state: 'done',
            output,
          }),
        ]}
      />,
    );
    expect(screen.getByText('趋势强劲')).toBeInTheDocument();
    expect(screen.getByText('MACD 金叉')).toBeInTheDocument();
    expect(screen.getByText('信心: high')).toBeInTheDocument();
  });

  it('done 状态 portfolio_manager 展开 verdict + 仓位 + 论点', () => {
    const output: PortfolioManagerOutput = {
      verdict: 'buy',
      confidence: 78,
      position_size_pct: 35,
      key_thesis: '基本面拐点出现',
      risks: ['北向流出'],
      strategy_hint: 'grid',
    };
    render(
      <SwarmAgentTimeline
        agents={[
          mkAgent({
            id: 'portfolio_manager',
            role: '投资经理',
            state: 'done',
            output,
          }),
        ]}
      />,
    );
    expect(screen.getByText(/BUY/)).toBeInTheDocument();
    expect(screen.getByText(/置信度 78%/)).toBeInTheDocument();
    expect(screen.getByText(/仓位 35%/)).toBeInTheDocument();
    expect(screen.getByText('基本面拐点出现')).toBeInTheDocument();
  });

  it('a11y: role="list" + role="listitem" + aria-label on badge', () => {
    render(
      <SwarmAgentTimeline
        agents={[mkAgent({ id: 'bull_advocate', role: '看多研究员', state: 'pending' })]}
      />,
    );
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toBeInTheDocument();
    expect(screen.getByLabelText('看多研究员徽章')).toBeInTheDocument();
    expect(screen.getByLabelText(/状态: 等待中/)).toBeInTheDocument();
  });

  it('streaming 分析中骨架带 aria-live="polite"', () => {
    render(
      <SwarmAgentTimeline
        agents={[
          mkAgent({
            id: 'bull_advocate',
            role: '看多研究员',
            state: 'streaming',
            streamedText: '正在生成',
          }),
        ]}
      />,
    );
    expect(screen.getByTestId('swarm-analyzing')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });
});
