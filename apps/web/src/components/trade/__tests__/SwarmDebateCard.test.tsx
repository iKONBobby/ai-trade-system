import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import type { SwarmEvent, PortfolioManagerOutput } from '@trade/shared';
import SwarmDebateCard from '../SwarmDebateCard';

// ---- Mock EventSource (jsdom 不自带) ----

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  readyState = 1;
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  close(): void {
    this.readyState = 2;
  }
  emit(event: SwarmEvent): void {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  static last(): MockEventSource | undefined {
    return this.instances[this.instances.length - 1];
  }
  static reset(): void {
    this.instances = [];
  }
}

let originalEventSource: unknown;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  originalEventSource = globalThis.EventSource;
  // @ts-expect-error — test polyfill
  globalThis.EventSource = MockEventSource;
  MockEventSource.reset();
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  // @ts-expect-error — restore
  globalThis.EventSource = originalEventSource;
  vi.restoreAllMocks();
});

// ---- Fixtures ----

const RUN_INFO = { runId: 'swr_test_1', streamUrl: '/api/swarm/runs/swr_test_1/events' };

const PM_VERDICT: PortfolioManagerOutput = {
  verdict: 'buy',
  confidence: 78,
  position_size_pct: 35,
  key_thesis: '基本面拐点',
  risks: ['北向流出'],
  strategy_hint: 'grid',
};

function emitAll(events: SwarmEvent[]) {
  const es = MockEventSource.last();
  if (!es) throw new Error('no EventSource instance');
  for (const e of events) {
    act(() => es.emit(e));
  }
}

// ---- Tests ----

describe('SwarmDebateCard — idle state', () => {
  it('runInfo=null 显示 idle 引导', () => {
    const onStart = vi.fn();
    render(<SwarmDebateCard runInfo={null} onStart={onStart} stockCode="600519" />);
    expect(screen.getByTestId('swarm-idle')).toBeInTheDocument();
    expect(screen.getByText(/多角色 AI 辩论/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /召开委员会.*600519/ })).toBeInTheDocument();
  });

  it('点 "召开委员会" 调 onStart', () => {
    const onStart = vi.fn();
    render(<SwarmDebateCard runInfo={null} onStart={onStart} />);
    fireEvent.click(screen.getByRole('button', { name: /召开委员会/ }));
    expect(onStart).toHaveBeenCalled();
  });

  it('无 onStart 时按钮 disabled', () => {
    render(<SwarmDebateCard runInfo={null} />);
    expect(screen.getByRole('button', { name: /召开委员会/ })).toBeDisabled();
  });
});

describe('SwarmDebateCard — running state', () => {
  it('runInfo 提供时 mount EventSource', () => {
    render(<SwarmDebateCard runInfo={RUN_INFO} />);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.last()?.url).toBe(RUN_INFO.streamUrl);
  });

  it('收到 swarm_started 渲染 5 个 agent', () => {
    render(<SwarmDebateCard runInfo={RUN_INFO} />);
    emitAll([
      {
        type: 'swarm_started',
        runId: 'swr_test_1',
        presetId: 'investment_committee',
        agentIds: ['bull_advocate', 'bear_advocate', 'risk_officer', 'portfolio_manager', 'synthesizer'],
      },
    ]);
    expect(screen.getByTestId('swarm-agent-bull_advocate')).toBeInTheDocument();
    expect(screen.getByTestId('swarm-agent-synthesizer')).toBeInTheDocument();
  });

  it('running 时显示 cancel 按钮, 点击调 fetch /abort', async () => {
    render(<SwarmDebateCard runInfo={RUN_INFO} />);
    emitAll([
      {
        type: 'swarm_started',
        runId: 'swr_test_1',
        presetId: 'p',
        agentIds: ['bull_advocate'],
      },
    ]);
    const cancelBtn = screen.getByTestId('swarm-cancel-btn');
    expect(cancelBtn).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(cancelBtn);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/swarm/runs/swr_test_1/abort',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('agent_chunk 累积流式文字', () => {
    render(<SwarmDebateCard runInfo={RUN_INFO} />);
    emitAll([
      {
        type: 'swarm_started',
        runId: 'swr_test_1',
        presetId: 'p',
        agentIds: ['bull_advocate'],
      },
      { type: 'agent_started', agentId: 'bull_advocate', index: 0 },
      { type: 'agent_chunk', agentId: 'bull_advocate', text: '看多 ', done: false },
      { type: 'agent_chunk', agentId: 'bull_advocate', text: '理由', done: false },
    ]);
    expect(screen.getByText('看多 理由')).toBeInTheDocument();
  });
});

describe('SwarmDebateCard — completed state', () => {
  it('swarm_completed 后渲染 verdict 卡 + 隐藏 cancel', () => {
    render(<SwarmDebateCard runInfo={RUN_INFO} />);
    emitAll([
      {
        type: 'swarm_started',
        runId: 'swr_test_1',
        presetId: 'p',
        agentIds: ['portfolio_manager'],
      },
      { type: 'agent_completed', agentId: 'portfolio_manager', output: PM_VERDICT },
      {
        type: 'swarm_completed',
        runId: 'swr_test_1',
        verdict: PM_VERDICT,
        durationMs: 80_000,
      },
    ]);
    expect(screen.getByTestId('swarm-verdict-card')).toBeInTheDocument();
    expect(screen.queryByTestId('swarm-cancel-btn')).not.toBeInTheDocument();
    expect(screen.getByText(/1m 20s/)).toBeInTheDocument();
  });

  it('done state 时 onFeedback callback 转发到 VerdictCard', async () => {
    const onFeedback = vi.fn().mockResolvedValue(undefined);
    render(<SwarmDebateCard runInfo={RUN_INFO} onFeedback={onFeedback} />);
    emitAll([
      {
        type: 'swarm_started',
        runId: 'swr_test_1',
        presetId: 'p',
        agentIds: ['portfolio_manager'],
      },
      { type: 'agent_completed', agentId: 'portfolio_manager', output: PM_VERDICT },
      {
        type: 'swarm_completed',
        runId: 'swr_test_1',
        verdict: PM_VERDICT,
        durationMs: 100,
      },
    ]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '采纳' }));
    });
    expect(onFeedback).toHaveBeenCalledWith('accept', undefined);
  });

  it('feedbackSent 提供时按钮 disabled', () => {
    render(
      <SwarmDebateCard
        runInfo={RUN_INFO}
        onFeedback={() => {}}
        feedbackSent="accept"
      />,
    );
    emitAll([
      {
        type: 'swarm_started',
        runId: 'swr_test_1',
        presetId: 'p',
        agentIds: ['portfolio_manager'],
      },
      { type: 'agent_completed', agentId: 'portfolio_manager', output: PM_VERDICT },
      {
        type: 'swarm_completed',
        runId: 'swr_test_1',
        verdict: PM_VERDICT,
        durationMs: 100,
      },
    ]);
    expect(screen.getByRole('button', { name: '采纳' })).toBeDisabled();
  });
});

describe('SwarmDebateCard — partial state', () => {
  it('部分 agent failed + swarm_completed → partial banner + verdict', () => {
    render(<SwarmDebateCard runInfo={RUN_INFO} />);
    emitAll([
      {
        type: 'swarm_started',
        runId: 'swr_test_1',
        presetId: 'p',
        agentIds: ['bull_advocate', 'bear_advocate', 'portfolio_manager'],
      },
      { type: 'agent_failed', agentId: 'bear_advocate', message: 'JSON 损坏' },
      { type: 'agent_completed', agentId: 'portfolio_manager', output: PM_VERDICT },
      {
        type: 'swarm_completed',
        runId: 'swr_test_1',
        verdict: PM_VERDICT,
        durationMs: 100,
      },
    ]);
    const card = screen.getByTestId('swarm-debate-card');
    expect(card).toHaveAttribute('data-state', 'partial');
    expect(screen.getByText(/有角色发言失败/)).toBeInTheDocument();
    expect(screen.getByTestId('swarm-verdict-card')).toBeInTheDocument();
  });
});

describe('SwarmDebateCard — error state', () => {
  it('swarm_error → error banner + 重新召开按钮', () => {
    const onStart = vi.fn();
    render(<SwarmDebateCard runInfo={RUN_INFO} onStart={onStart} />);
    emitAll([
      {
        type: 'swarm_started',
        runId: 'swr_test_1',
        presetId: 'p',
        agentIds: ['portfolio_manager'],
      },
      { type: 'swarm_error', agentId: 'portfolio_manager', message: 'PM 失败' },
    ]);
    const card = screen.getByTestId('swarm-debate-card');
    expect(card).toHaveAttribute('data-state', 'error');
    expect(screen.getByText(/AI 服务异常/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新召开' }));
    expect(onStart).toHaveBeenCalled();
  });
});

describe('SwarmDebateCard — aborted state', () => {
  it('swarm_aborted → muted banner + 重新召开', () => {
    render(<SwarmDebateCard runInfo={RUN_INFO} onStart={() => {}} />);
    emitAll([
      {
        type: 'swarm_started',
        runId: 'swr_test_1',
        presetId: 'p',
        agentIds: ['bull_advocate'],
      },
      { type: 'swarm_aborted', reason: 'user_cancel' },
    ]);
    const card = screen.getByTestId('swarm-debate-card');
    expect(card).toHaveAttribute('data-state', 'aborted');
    expect(screen.getByText(/辩论被中止/)).toBeInTheDocument();
  });
});

describe('SwarmDebateCard — cleanup', () => {
  it('runInfo 变 null 时关闭 EventSource', () => {
    const { rerender } = render(<SwarmDebateCard runInfo={RUN_INFO} />);
    const es = MockEventSource.last();
    expect(es?.readyState).toBe(1);
    rerender(<SwarmDebateCard runInfo={null} />);
    expect(es?.readyState).toBe(2);
  });

  it('runInfo runId 变化时重订阅', () => {
    const { rerender } = render(<SwarmDebateCard runInfo={RUN_INFO} />);
    const first = MockEventSource.last();
    expect(MockEventSource.instances).toHaveLength(1);
    rerender(
      <SwarmDebateCard
        runInfo={{ runId: 'swr_test_2', streamUrl: '/api/swarm/runs/swr_test_2/events' }}
      />,
    );
    expect(first?.readyState).toBe(2);
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1].url).toBe('/api/swarm/runs/swr_test_2/events');
  });
});
