import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import type { PortfolioManagerOutput, SynthesizerOutput } from '@trade/shared';
import SwarmVerdictCard from '../SwarmVerdictCard';

afterEach(() => cleanup());

const BUY_VERDICT: PortfolioManagerOutput = {
  verdict: 'buy',
  confidence: 78,
  position_size_pct: 35,
  key_thesis: '基本面拐点出现',
  risks: ['北向连续流出'],
  strategy_hint: 'grid',
};

const SYNTHESIS: SynthesizerOutput = {
  disagreements: ['估值分歧', '量能解读分歧'],
  pm_confidence_offset: -10,
  missing_info: ['北向资金流向'],
};

describe('SwarmVerdictCard — A 股本地化颜色', () => {
  it('buy 用 --up (红, A 股看涨)', () => {
    render(<SwarmVerdictCard verdict={BUY_VERDICT} />);
    const label = screen.getByTestId('swarm-verdict-label');
    expect(label).toHaveStyle({ color: 'var(--up)' });
    expect(label.textContent).toMatch(/BUY/);
    expect(label.textContent).toMatch(/买入/);
  });

  it('sell 用 --down (绿, A 股看跌)', () => {
    render(<SwarmVerdictCard verdict={{ ...BUY_VERDICT, verdict: 'sell' }} />);
    const label = screen.getByTestId('swarm-verdict-label');
    expect(label).toHaveStyle({ color: 'var(--down)' });
    expect(label.textContent).toMatch(/SELL/);
  });

  it('hold 用 --text-2 (中性灰)', () => {
    render(<SwarmVerdictCard verdict={{ ...BUY_VERDICT, verdict: 'hold' }} />);
    const label = screen.getByTestId('swarm-verdict-label');
    expect(label).toHaveStyle({ color: 'var(--text-2)' });
    expect(label.textContent).toMatch(/观望/);
  });

  it('avoid 用 --warning (橙)', () => {
    render(<SwarmVerdictCard verdict={{ ...BUY_VERDICT, verdict: 'avoid' }} />);
    const label = screen.getByTestId('swarm-verdict-label');
    expect(label).toHaveStyle({ color: 'var(--warning)' });
    expect(label.textContent).toMatch(/规避/);
  });
});

describe('SwarmVerdictCard — 核心字段渲染', () => {
  it('置信度 + 仓位 + 论点 + 风险都显示', () => {
    render(<SwarmVerdictCard verdict={BUY_VERDICT} />);
    expect(screen.getByText(/置信度 78%/)).toBeInTheDocument();
    expect(screen.getByText('基本面拐点出现')).toBeInTheDocument();
    expect(screen.getByText(/北向连续流出/)).toBeInTheDocument();
    expect(screen.getByText(/建议策略: 网格交易/)).toBeInTheDocument();
  });

  it('strategy_hint condition 显示条件单', () => {
    render(
      <SwarmVerdictCard verdict={{ ...BUY_VERDICT, strategy_hint: 'condition' }} />,
    );
    expect(screen.getByText(/建议策略: 条件单/)).toBeInTheDocument();
  });

  it('strategy_hint none 不显示策略行', () => {
    render(
      <SwarmVerdictCard
        verdict={{ ...BUY_VERDICT, verdict: 'avoid', strategy_hint: 'none' }}
      />,
    );
    expect(screen.queryByText(/建议策略/)).not.toBeInTheDocument();
  });

  it('风险数组为空时不显示风险行', () => {
    render(<SwarmVerdictCard verdict={{ ...BUY_VERDICT, risks: [] }} />);
    expect(screen.queryByText(/^主要风险:/)).not.toBeInTheDocument();
  });

  it('synthesis 提供时显示分歧 + 缺失信息', () => {
    render(<SwarmVerdictCard verdict={BUY_VERDICT} synthesis={SYNTHESIS} />);
    expect(screen.getByText(/估值分歧; 量能解读分歧/)).toBeInTheDocument();
    expect(screen.getByText(/北向资金流向/)).toBeInTheDocument();
  });

  it('durationMs 格式化', () => {
    const { rerender } = render(
      <SwarmVerdictCard verdict={BUY_VERDICT} durationMs={45_000} />,
    );
    expect(screen.getByText(/45s/)).toBeInTheDocument();
    rerender(<SwarmVerdictCard verdict={BUY_VERDICT} durationMs={83_000} />);
    expect(screen.getByText(/1m 23s/)).toBeInTheDocument();
  });

  it('durationMs 缺失显示 --', () => {
    render(<SwarmVerdictCard verdict={BUY_VERDICT} />);
    expect(screen.getByText(/辩论时长 --/)).toBeInTheDocument();
  });
});

describe('SwarmVerdictCard — Score ring', () => {
  it('ScoreRing 显示仓位 %', () => {
    render(<SwarmVerdictCard verdict={BUY_VERDICT} />);
    const ring = screen.getByTestId('swarm-score-ring');
    expect(ring).toHaveAttribute('aria-label', '建议仓位 35%');
    expect(ring.textContent).toMatch(/35%/);
  });

  it('position_size_pct=0 ScoreRing 不爆', () => {
    render(<SwarmVerdictCard verdict={{ ...BUY_VERDICT, position_size_pct: 0 }} />);
    expect(screen.getByTestId('swarm-score-ring')).toHaveAttribute('aria-label', '建议仓位 0%');
  });

  it('超界 position (110) clamp 到 100', () => {
    render(
      <SwarmVerdictCard verdict={{ ...BUY_VERDICT, position_size_pct: 110 }} />,
    );
    expect(screen.getByTestId('swarm-score-ring')).toHaveAttribute('aria-label', '建议仓位 100%');
  });
});

describe('SwarmVerdictCard — Feedback 按钮', () => {
  it('onFeedback 未提供时不渲染 feedback 行', () => {
    render(<SwarmVerdictCard verdict={BUY_VERDICT} />);
    expect(screen.queryByTestId('swarm-feedback-row')).not.toBeInTheDocument();
  });

  it('onFeedback 提供时渲染 3 按钮 (采纳/不采纳/修改仓位)', () => {
    render(<SwarmVerdictCard verdict={BUY_VERDICT} onFeedback={() => {}} />);
    expect(screen.getByRole('button', { name: '采纳' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '不采纳' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修改仓位' })).toBeInTheDocument();
  });

  it('点 "采纳" 调 onFeedback("accept")', () => {
    const onFeedback = vi.fn();
    render(<SwarmVerdictCard verdict={BUY_VERDICT} onFeedback={onFeedback} />);
    fireEvent.click(screen.getByRole('button', { name: '采纳' }));
    expect(onFeedback).toHaveBeenCalledWith('accept');
  });

  it('点 "不采纳" 调 onFeedback("reject")', () => {
    const onFeedback = vi.fn();
    render(<SwarmVerdictCard verdict={BUY_VERDICT} onFeedback={onFeedback} />);
    fireEvent.click(screen.getByRole('button', { name: '不采纳' }));
    expect(onFeedback).toHaveBeenCalledWith('reject');
  });

  it('点 "修改仓位" 弹 prompt + 调 onFeedback("modify", pct)', () => {
    const onFeedback = vi.fn();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('20');
    render(<SwarmVerdictCard verdict={BUY_VERDICT} onFeedback={onFeedback} />);
    fireEvent.click(screen.getByRole('button', { name: '修改仓位' }));
    expect(promptSpy).toHaveBeenCalled();
    expect(onFeedback).toHaveBeenCalledWith('modify', 20);
    promptSpy.mockRestore();
  });

  it('"修改仓位" prompt cancel 时不调用 onFeedback', () => {
    const onFeedback = vi.fn();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    render(<SwarmVerdictCard verdict={BUY_VERDICT} onFeedback={onFeedback} />);
    fireEvent.click(screen.getByRole('button', { name: '修改仓位' }));
    expect(onFeedback).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it('feedbackSent 非空时所有按钮 disabled, 选中的 aria-pressed=true', () => {
    render(
      <SwarmVerdictCard
        verdict={BUY_VERDICT}
        onFeedback={() => {}}
        feedbackSent="accept"
      />,
    );
    expect(screen.getByRole('button', { name: '采纳' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '不采纳' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '修改仓位' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '采纳' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('SwarmVerdictCard — a11y', () => {
  it('role=status + aria-live=polite (verdict 落地是关键信息)', () => {
    render(<SwarmVerdictCard verdict={BUY_VERDICT} />);
    const card = screen.getByTestId('swarm-verdict-card');
    expect(card).toHaveAttribute('role', 'status');
    expect(card).toHaveAttribute('aria-live', 'polite');
  });
});
