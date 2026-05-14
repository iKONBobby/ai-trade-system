'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { searchStocks } from '@/lib/api';
import type { StockSearchItem } from '@trade/shared';

export type StrategyMode = 'auto' | 'grid' | 'condition';

interface InputBarProps {
  onSearch: (code: string) => void;
  loading: boolean;
  mode: StrategyMode;
  onModeChange: (mode: StrategyMode) => void;
  capital: string;
  onCapitalChange: (val: string) => void;
  isT0: boolean;
  onT0Change: (val: boolean) => void;
  useAI: boolean;
  onAIChange: (val: boolean) => void;
}

const MODES: { value: StrategyMode; label: string }[] = [
  { value: 'auto', label: '自动判断' },
  { value: 'grid', label: '网格交易' },
  { value: 'condition', label: '条件单' },
];

function formatCapital(s: string): string {
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('en-US');
}

export default function InputBar({
  onSearch,
  loading,
  mode,
  onModeChange,
  capital,
  onCapitalChange,
  isT0,
  onT0Change,
  useAI,
  onAIChange,
}: InputBarProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StockSearchItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    setSearching(true);
    try {
      const results = await searchStocks(keyword.trim());
      setSuggestions(results.slice(0, 8));
      setIsOpen(results.length > 0);
      setActiveIndex(-1);
    } catch {
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const selectStock = (item: StockSearchItem) => {
    setQuery(`${item.name} (${item.code})`);
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    onSearch(item.code);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const digits = query.replace(/\D/g, '');
        if (digits.length === 6) onSearch(digits);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < suggestions.length) selectStock(suggestions[activeIndex]);
        break;
      case 'Escape':
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isOpen && activeIndex >= 0 && activeIndex < suggestions.length) {
      selectStock(suggestions[activeIndex]);
      return;
    }
    const digits = query.replace(/\D/g, '');
    if (digits.length === 6) {
      onSearch(digits);
      setIsOpen(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-3)',
        marginBottom: 'var(--sp-5)',
      }}
    >
      {/* Primary row: search + analyze */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'stretch' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 'var(--sp-4)',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-3)',
              pointerEvents: 'none',
              display: 'inline-flex',
            }}
          >
            <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            placeholder="输入 6 位股票代码或名称（如 600519 / 贵州茅台）"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) setIsOpen(true);
            }}
            autoComplete="off"
            className="num"
            style={{
              width: '100%',
              height: 44,
              padding: '0 var(--sp-4) 0 var(--sp-12)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border-1)',
              color: 'var(--text-1)',
              borderRadius: 'var(--r-md)',
              fontSize: 'var(--text-h2)',
              fontWeight: 500,
              letterSpacing: '-0.01em',
              outline: 'none',
              transition: `all var(--motion-1) var(--ease)`,
            }}
            onBlur={(e) => {
              e.currentTarget.style.background = 'var(--surface-2)';
              e.currentTarget.style.borderColor = 'var(--border-1)';
            }}
            onFocusCapture={(e) => {
              e.currentTarget.style.background = 'var(--surface-1)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
          />
          {searching && (
            <svg
              className="animate-spin"
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }}
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            height: 44,
            padding: '0 var(--sp-6)',
            background: 'var(--accent)',
            border: '1px solid var(--accent)',
            color: '#0a0b0d',
            borderRadius: 'var(--r-md)',
            fontFamily: 'inherit',
            fontSize: 'var(--text-h3)',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--sp-2)',
            transition: `all var(--motion-1) var(--ease)`,
          }}
        >
          {loading ? (
            <svg className="animate-spin" width={14} height={14} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg width={14} height={14} fill="currentColor" viewBox="0 0 24 24">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
          {loading ? '分析中…' : '开始分析'}
        </button>
      </form>

      {/* Secondary row: params */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-2)',
          marginTop: 'var(--sp-3)',
          paddingTop: 'var(--sp-3)',
          borderTop: '1px solid var(--border-1)',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-tiny)',
            color: 'var(--text-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginRight: 'var(--sp-1)',
          }}
        >
          策略参数
        </span>

        <ParamChip>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>本金</span>
          <input
            value={formatCapital(capital)}
            onChange={(e) => onCapitalChange(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="100,000"
            className="num"
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--text-1)',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              padding: 0,
              outline: 'none',
              width: 64,
            }}
          />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>元</span>
        </ParamChip>

        <ParamChip>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>模式</span>
          <select
            value={mode}
            onChange={(e) => onModeChange(e.target.value as StrategyMode)}
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--text-1)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              padding: '0 var(--sp-3) 0 0',
              cursor: 'pointer',
              outline: 'none',
              fontFamily: 'inherit',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              appearance: 'none',
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='none' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' d='M1 1l4 4 4-4'/></svg>\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0 center',
            }}
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </ParamChip>

        <ChipSwitch checked={isT0} onChange={onT0Change}>
          T+0 做T
        </ChipSwitch>
        <ChipSwitch checked={useAI} onChange={onAIChange}>
          AI 优化
        </ChipSwitch>
      </div>

      {/* Suggestions dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 'var(--sp-3)',
            right: 'calc(var(--sp-3) + 132px)',
            top: 'calc(var(--sp-3) + 44px + 4px)',
            zIndex: 50,
            background: 'var(--surface-2)',
            border: '1px solid var(--border-1)',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--elev-2)',
            overflow: 'hidden',
          }}
        >
          {suggestions.map((item, index) => (
            <button
              key={item.code}
              type="button"
              onClick={() => selectStock(item)}
              onMouseEnter={() => setActiveIndex(index)}
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                gap: 'var(--sp-3)',
                padding: '10px var(--sp-4)',
                textAlign: 'left',
                fontSize: 'var(--text-sm)',
                background: index === activeIndex ? 'var(--accent-bg)' : 'transparent',
                color: 'var(--text-1)',
                border: 0,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span className="num" style={{ fontWeight: 600 }}>{item.code}</span>
              <span>{item.name}</span>
              <span
                style={{
                  marginLeft: 'auto',
                  padding: '2px 6px',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 'var(--text-tiny)',
                  fontWeight: 600,
                  background: item.market === 'SH' ? 'var(--up-bg)' : 'var(--down-bg)',
                  color: item.market === 'SH' ? 'var(--up)' : 'var(--down)',
                }}
              >
                {item.market === 'SH' ? '沪市' : '深市'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ParamChip({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-2)',
        height: 30,
        padding: '0 var(--sp-3)',
        background: 'var(--surface-2)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--r-pill)',
        transition: `border-color var(--motion-1) var(--ease)`,
      }}
    >
      {children}
    </label>
  );
}

function ChipSwitch({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-2)',
        height: 30,
        padding: '0 var(--sp-3)',
        background: 'var(--surface-2)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--r-pill)',
        fontSize: 'var(--text-sm)',
        color: checked ? 'var(--text-1)' : 'var(--text-2)',
        cursor: 'pointer',
        userSelect: 'none',
        transition: `all var(--motion-1) var(--ease)`,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ display: 'none' }}
      />
      <span
        aria-hidden
        style={{
          width: 28,
          height: 16,
          background: checked ? 'var(--accent)' : 'var(--surface-3)',
          borderRadius: 'var(--r-pill)',
          position: 'relative',
          transition: `background var(--motion-1) var(--ease)`,
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 14 : 2,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: checked ? '#0a0b0d' : 'var(--text-2)',
            transition: `all var(--motion-1) var(--ease)`,
          }}
        />
      </span>
      {children}
    </label>
  );
}
