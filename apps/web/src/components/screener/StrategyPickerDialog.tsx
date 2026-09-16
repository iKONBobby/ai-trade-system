'use client';

import { useMemo, useRef, useState } from 'react';
import type { ScreenerStrategySummary } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import { Icon } from '@/components/ui/primitives';

type HorizonFilter = 'all' | ScreenerStrategySummary['horizon'];

interface StrategyPickerDialogProps {
  open: boolean;
  strategies: ScreenerStrategySummary[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}

const FILTERS: Array<{ id: HorizonFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'short', label: '短线' },
  { id: 'medium', label: '中线' },
  { id: 'long', label: '长线' },
];

const HORIZON_LABEL: Record<ScreenerStrategySummary['horizon'], string> = {
  short: '短线',
  medium: '中线',
  long: '长线',
};

export default function StrategyPickerDialog({
  open,
  strategies,
  selectedIds,
  onToggle,
  onClose,
}: StrategyPickerDialogProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [horizon, setHorizon] = useState<HorizonFilter>('all');

  const visibleStrategies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    return strategies.filter((strategy) => {
      if (horizon !== 'all' && strategy.horizon !== horizon) return false;
      if (!normalizedQuery) return true;
      return `${strategy.name} ${strategy.description}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery);
    });
  }, [horizon, query, strategies]);

  return (
    <Modal
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      size="lg"
      title={(
        <span className="flex items-center gap-2">
          选择策略
          <span className="ui-badge ui-badge--neutral num">{selectedIds.length}/3</span>
        </span>
      )}
      description="最多组合 3 个策略；结果会分别展示，并标记重复命中的股票。"
      initialFocus={(event) => {
        event.preventDefault();
        searchRef.current?.focus();
      }}
      footer={(
        <>
          <span className="text-xs text-[var(--color-text-secondary)]" aria-live="polite">
            已选择 {selectedIds.length} 个策略
          </span>
          <button type="button" onClick={onClose} className="ui-button ui-button--primary ui-button--lg">
            完成
          </button>
        </>
      )}
    >
        <div className="strategy-picker__tools">
          <label htmlFor="strategy-search" className="sr-only">搜索策略</label>
          <div className="relative">
            <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={searchRef}
              id="strategy-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称或条件"
              className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
          <div className="strategy-picker__filters" role="group" aria-label="按持有周期筛选">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={horizon === filter.id}
                onClick={() => setHorizon(filter.id)}
                className={`strategy-picker__filter ${
                  horizon === filter.id
                    ? 'strategy-picker__filter--active'
                    : ''
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="strategy-picker__list">
          {visibleStrategies.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visibleStrategies.map((strategy) => {
                const selected = selectedIds.includes(strategy.id);
                const selectionLocked = selectedIds.length >= 3 && !selected;
                return (
                  <button
                    key={strategy.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={selectionLocked}
                    onClick={() => onToggle(strategy.id)}
                    className={`strategy-picker__option ${
                      selected
                        ? 'strategy-picker__option--selected'
                        : ''
                    }`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{strategy.name}</span>
                          <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
                            {HORIZON_LABEL[strategy.horizon]}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-[var(--color-text-secondary)]">
                          {strategy.description}
                        </span>
                      </span>
                      <span aria-hidden="true" className={`strategy-picker__check ${selected ? 'strategy-picker__check--selected' : ''}`}>
                        {selected && <Icon name="check" size={14} />}
                      </span>
                    </span>
                    {strategy.includeLimitUp && (
                      <span className="mt-2 inline-flex rounded-full border border-red-400/30 bg-red-400/5 px-2 py-0.5 text-[10px] text-red-400">
                        保留涨停股
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-[var(--color-text-secondary)]">
              没有匹配的策略，请更换关键词或周期。
            </div>
          )}
        </div>

    </Modal>
  );
}
