'use client';

import { useState } from 'react';
import StockInput from '@/components/StockInput';
import StrategySettings from '@/components/StrategySettings';
import AnalysisResult from '@/components/AnalysisResult';
import ConfigPreview from '@/components/ConfigPreview';
import { analyzeStock } from '@/lib/api';
import type { AnalyzeResponse } from '@trade/shared';

export default function Home() {
  const [mode, setMode] = useState<'auto' | 'grid' | 'condition'>('auto');
  const [capital, setCapital] = useState('100000');
  const [isT0, setIsT0] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);

  const handleSearch = async (code: string) => {
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
    } catch (err: any) {
      setError(err.message || '分析失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

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
          <AnalysisResult data={data} />
          <ConfigPreview config={data.config} />
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
            <p className="text-base text-[var(--color-text-secondary)]">输入股票代码开始分析</p>
          </div>
        )
      )}

      {/* Loading State (when no data yet) */}
      {loading && !data && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)] py-20">
          <svg className="mb-4 h-8 w-8 animate-spin text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-[var(--color-text-secondary)]">正在分析...</p>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-[var(--color-text-secondary)]">
        数据来源：腾讯财经 | 仅供学习参考，不构成投资建议
      </footer>
    </div>
  );
}
