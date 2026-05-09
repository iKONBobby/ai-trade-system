'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { searchStocks } from '@/lib/api';
import type { StockSearchItem } from '@trade/shared';

interface StockInputProps {
  onSearch: (code: string) => void;
  loading: boolean;
}

export default function StockInput({ onSearch, loading }: StockInputProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StockSearchItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim() || keyword.trim().length < 1) {
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

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      doSearch(val);
    }, 300);
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
        // Try direct code input: if user typed 6 digits, submit as code
        const digits = query.replace(/\D/g, '');
        if (digits.length === 6) {
          onSearch(digits);
        }
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          selectStock(suggestions[activeIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // If a suggestion is highlighted, select it
    if (isOpen && activeIndex >= 0 && activeIndex < suggestions.length) {
      selectStock(suggestions[activeIndex]);
      return;
    }
    // Otherwise try direct code input
    const digits = query.replace(/\D/g, '');
    if (digits.length === 6) {
      onSearch(digits);
      setIsOpen(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            placeholder="输入股票代码或名称，如 600519 或 贵州茅台"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) setIsOpen(true);
            }}
            autoComplete="off"
            className="w-full rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] px-4 py-3 text-base text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] outline-none transition-colors focus:border-[var(--color-accent)]"
          />
          {/* Search spinner */}
          {searching && (
            <svg
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--color-text-secondary)]"
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
          className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-6 py-3 text-base font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {loading ? '分析中...' : '分析'}
        </button>
      </form>

      {/* Suggestions dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-[88px] top-full z-50 mt-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-lg overflow-hidden">
          {suggestions.map((item, index) => (
            <button
              key={item.code}
              type="button"
              onClick={() => selectStock(item)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                index === activeIndex
                  ? 'bg-[var(--color-accent)]/15'
                  : 'hover:bg-[var(--color-bg-card-hover)]'
              }`}
            >
              <span className="font-mono font-medium text-[var(--color-text-primary)]">
                {item.code}
              </span>
              <span className="text-[var(--color-text-primary)]">{item.name}</span>
              <span className={`ml-auto rounded px-1.5 py-0.5 text-xs font-medium ${
                item.market === 'SH'
                  ? 'bg-red-900/30 text-red-400'
                  : 'bg-green-900/30 text-green-400'
              }`}>
                {item.market === 'SH' ? '沪市' : '深市'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
