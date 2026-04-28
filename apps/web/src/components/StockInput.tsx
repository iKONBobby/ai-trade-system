'use client';

import { useState } from 'react';

interface StockInputProps {
  onSearch: (code: string) => void;
  loading: boolean;
}

export default function StockInput({ onSearch, loading }: StockInputProps) {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6 && /^\d{6}$/.test(code)) {
      onSearch(code);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(val);
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <input
        type="text"
        inputMode="numeric"
        placeholder="输入股票代码（6位数字）"
        value={code}
        onChange={handleChange}
        maxLength={6}
        className="flex-1 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] px-4 py-3 text-base text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] outline-none transition-colors focus:border-[var(--color-accent)]"
      />
      <button
        type="submit"
        disabled={code.length !== 6 || loading}
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
  );
}
