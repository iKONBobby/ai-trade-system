import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { MarketIndex } from '@trade/shared';
import HeroBar from '../HeroBar';

afterEach(() => cleanup());

describe('HeroBar — 大盘指数', () => {
  it('真实数据 (value>0) 显示点位 + 涨跌幅', () => {
    const indices: MarketIndex[] = [
      { label: '上证指数', value: 3245.67, changePct: 0.83 },
      { label: '深证成指', value: 9856.12, changePct: 1.15 },
      { label: '创业板指', value: 1927.84, changePct: -0.21 },
    ];
    render(<HeroBar indices={indices} />);
    expect(screen.getByText('上证指数')).toBeInTheDocument();
    expect(screen.getByText('3,245.67')).toBeInTheDocument();
    expect(screen.getByText(/\+0\.83%/)).toBeInTheDocument();
    expect(screen.getByText('1,927.84')).toBeInTheDocument();
    expect(screen.getByText(/−0\.21%/)).toBeInTheDocument();
  });

  it('未传 indices → 占位骨架显示 "—" 而非假数字', () => {
    render(<HeroBar />);
    expect(screen.getByText('上证指数')).toBeInTheDocument();
    expect(screen.getByText('深证成指')).toBeInTheDocument();
    expect(screen.getByText('创业板指')).toBeInTheDocument();
    // 占位: 3 个 "—", 不出现旧的写死假数字
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.queryByText('3,245.67')).not.toBeInTheDocument();
  });

  it('value=0 (拉取失败 fallback) 显示 "—", 不显示 changePct', () => {
    const indices: MarketIndex[] = [
      { label: '上证指数', value: 0, changePct: 0 },
      { label: '深证成指', value: 9856.12, changePct: 1.15 },
      { label: '创业板指', value: 0, changePct: 0 },
    ];
    render(<HeroBar indices={indices} />);
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getByText('9,856.12')).toBeInTheDocument();
    // 失败项不渲染 0.00% 误导
    expect(screen.queryByText(/0\.00%/)).not.toBeInTheDocument();
  });

  it('涨用 --up, 跌用 --down (A 股惯例)', () => {
    const indices: MarketIndex[] = [
      { label: '上证指数', value: 3245.67, changePct: 0.83 },
      { label: '创业板指', value: 1927.84, changePct: -0.21 },
    ];
    render(<HeroBar indices={indices} />);
    const up = screen.getByText(/\+0\.83%/);
    const down = screen.getByText(/−0\.21%/);
    expect(up).toHaveStyle({ color: 'var(--up)' });
    expect(down).toHaveStyle({ color: 'var(--down)' });
  });
});
