'use client';

import { useState, useCallback } from 'react';
import StockInput from '@/components/StockInput';
import StrategySettings from '@/components/StrategySettings';
import AnalysisResult from '@/components/AnalysisResult';
import { analyzeStock } from '@/lib/api';
import type { AnalyzeResponse } from '@trade/shared';

interface HistoryItem {
  name: string;
  code: string;
  price: number;
  change: number;
  data: AnalyzeResponse;
}

export default function Home() {
  const [mode, setMode] = useState<'auto' | 'grid' | 'condition'>('auto');
  const [capital, setCapital] = useState('100000');
  const [isT0, setIsT0] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [adjustedConfig, setAdjustedConfig] = useState<any>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const handleSearch = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const result = await analyzeStock({
        stockCode: code,
        totalCapital: Number(capital) || 100000,
        mode,
        isT0Mode: isT0,
        useAI,
      });
      setData(result);
      setHistory((prev) => {
        const item: HistoryItem = {
          name: result.market.name,
          code: result.market.code,
          price: result.market.price,
          change: result.market.change,
          data: result,
        };
        const filtered = prev.filter((h) => h.code !== item.code);
        return [item, ...filtered].slice(0, 5);
      });
    } catch (err: any) {
      setError(err.message || '分析失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [capital, mode, isT0, useAI]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* Header */}
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">AI 交易系统</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          智能分析股票行情，生成最优交易配置
        </p>
      </header>

      {/* Search + Settings */}
      <section className="mb-6">
        <StockInput onSearch={handleSearch} loading={loading} />
      </section>

      <section className="mb-6">
        <StrategySettings
          mode={mode}
          onModeChange={setMode}
          capital={capital}
          onCapitalChange={setCapital}
          isT0={isT0}
          onT0Change={setIsT0}
          useAI={useAI}
          onAIChange={setUseAI}
        />
      </section>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {/* Results or Empty State */}
      {data ? (
        <div className="space-y-6">
          <AnalysisResult
            data={data}
            showAI={useAI}
            totalCapital={Number(capital) || 100000}
            isT0Mode={isT0}
            onConfigUpdate={setAdjustedConfig}
          />
        </div>
      ) : (
        !loading && (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)] py-20">
            <svg
              className="mb-4 h-16 w-16 text-[var(--color-text-secondary)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <p className="text-base text-[var(--color-text-secondary)]">输入股票代码或名称开始分析</p>
          </div>
        )
      )}

      {/* Loading State */}
      {loading && !data && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)] py-20">
          <svg className="mb-4 h-8 w-8 animate-spin text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-[var(--color-text-secondary)]">正在分析...</p>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">最近分析</h2>
          <div className="space-y-1.5">
            {history.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setData(item.data)}
                className={`flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-bg-card)] ${
                  data?.market.code === item.code
                    ? 'bg-[var(--color-bg-card)] border border-[var(--color-accent-dim)]'
                    : 'bg-[var(--color-bg-primary)] border border-transparent'
                }`}
              >
                <div>
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {item.name}
                  </span>
                  <span className="ml-2 text-xs text-[var(--color-text-secondary)]">
                    {item.code}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-mono text-[var(--color-text-primary)]">
                    {item.price.toFixed(2)}
                  </span>
                  <span
                    className="ml-2 text-xs font-medium"
                    style={{ color: item.change >= 0 ? 'var(--color-danger)' : 'var(--color-accent)' }}
                  >
                    {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-[var(--color-text-secondary)]">
        数据来源：腾讯财经 | 仅供学习参考，不构成投资建议
      </footer>
    </div>
  );
}
