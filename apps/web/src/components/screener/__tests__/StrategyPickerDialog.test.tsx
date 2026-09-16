// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenerStrategySummary } from '@/lib/api';
import StrategyPickerDialog from '../StrategyPickerDialog';

const STRATEGIES: ScreenerStrategySummary[] = [
  { id: 'breakout', name: '箱体突破', description: '突破前高并放量', horizon: 'short', includeLimitUp: false },
  { id: 'vcp', name: 'VCP 波动收缩', description: '缩量整理观察池', horizon: 'medium', includeLimitUp: false },
  { id: 'long', name: '长周期趋势', description: '站上长期均线', horizon: 'long', includeLimitUp: false },
  { id: 'limit', name: '涨停观察', description: '次日观察池', horizon: 'short', includeLimitUp: true },
];

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

afterEach(cleanup);

describe('StrategyPickerDialog', () => {
  it('filters strategies by search text and horizon', () => {
    render(
      <StrategyPickerDialog open strategies={STRATEGIES} selectedIds={[]} onToggle={() => {}} onClose={() => {}} />,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索策略' }), { target: { value: 'VCP' } });
    expect(screen.getByRole('button', { name: /VCP 波动收缩/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /箱体突破/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索策略' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '长线' }));
    expect(screen.getByRole('button', { name: /长周期趋势/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /箱体突破/ })).not.toBeInTheDocument();
  });

  it('reports selection and prevents a fourth strategy', () => {
    const onToggle = vi.fn();
    render(
      <StrategyPickerDialog
        open
        strategies={STRATEGIES}
        selectedIds={['breakout', 'vcp', 'long']}
        onToggle={onToggle}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('已选择 3 个策略')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /涨停观察/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /VCP 波动收缩/ }));
    expect(onToggle).toHaveBeenCalledWith('vcp');
  });

  it('supports explicit close actions', () => {
    const onClose = vi.fn();
    render(
      <StrategyPickerDialog open strategies={STRATEGIES} selectedIds={[]} onToggle={() => {}} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
