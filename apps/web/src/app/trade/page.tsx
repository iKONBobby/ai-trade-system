'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalyzeResponse, AIAnalysisResult, IcebreakerConfig } from '@trade/shared';
import { analyzeStock, fetchAIAnalysis } from '@/lib/api';
import HeroBar from '@/components/trade/HeroBar';
import InputBar, { type StrategyMode } from '@/components/trade/InputBar';
import HistoryRail, { type HistoryItem } from '@/components/trade/HistoryRail';
import StockHeader from '@/components/trade/StockHeader';
import ChartCard from '@/components/trade/ChartCard';
import IndicatorGrid from '@/components/trade/IndicatorGrid';
import RecoPanel from '@/components/trade/RecoPanel';
import AISummaryCard from '@/components/trade/AISummaryCard';
import ConfigPreview from '@/components/trade/ConfigPreview';

function readDemoFlag(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('demo') === 'ai-loading';
}

export default function TradePage() {
  const [mode, setMode] = useState<StrategyMode>('auto');
  const [capital, setCapital] = useState('100000');
  const [isT0, setIsT0] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [adjustedConfig, setAdjustedConfig] = useState<IcebreakerConfig | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [favorited, setFavorited] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);

  // Dev preview: ?demo=ai-loading forces a stubbed analysis + AI loading state
  // so the AI-loading visual can be reviewed without hitting the upstream API.
  useEffect(() => {
    if (!readDemoFlag()) return;
    setData({
      market: {
        code: '600519',
        name: '贵州茅台',
        price: 1340.07,
        change: -1.67,
        volume: 9_500_000,
        turnover: 0.21,
        open: 1359.5,
        high: 1359.5,
        low: 1339.0,
        preClose: 1362.85,
      },
      analysis: {
        marketState: 'ranging',
        bollinger: { upper: 1477.4, middle: 1408.7, lower: 1339.94, width: 0.1023 },
        atr: 26.5,
        ma: { ma5: 1395.2, ma20: 1408.7, ma60: 1402.1 },
        support: 1339,
        resistance: 1477,
        recommendation: 'condition',
        confidence: 78,
        conditionParams: { buyTriggerPrice: 1340.0, sellTriggerPrice: 1477.41, buyLot: 100, sellLot: 100 },
        advanced: {
          rsi: { value: 30.1, signal: 'oversold' },
          macd: { dif: -10.2, dea: 3.17, histogram: -13.37, signal: 'death_cross' },
          kdj: { k: 11.6, d: 16.8, j: 1.2, signal: 'oversold' },
          wr: { value: 88, signal: 'oversold' },
          amplitude: 1.5,
          volumeRatio: 1.45,
          limitDistance: { up: 8.0, down: 8.0 },
          maArrangement: 'crossed',
        },
      },
      config: { lines: ['# preview stub'], summary: 'preview' },
    } as AnalyzeResponse);
    setAdjustedConfig({ lines: ['# preview stub'], summary: 'preview' });
    setAiLoading(true);
    setAiResult(null);
  }, []);

  const triggerAI = useCallback(
    async (resp: AnalyzeResponse) => {
      if (!useAI) {
        setAiResult(null);
        setAdjustedConfig(null);
        return;
      }
      aiAbortRef.current?.abort();
      const ctrl = new AbortController();
      aiAbortRef.current = ctrl;
      setAiLoading(true);
      try {
        const { aiResult: ai, config: adjusted } = await fetchAIAnalysis(
          resp.market,
          resp.analysis,
          { totalCapital: Number(capital) || 100000, isT0Mode: isT0, strategyId: resp.market.code },
          ctrl.signal,
        );
        if (!ctrl.signal.aborted) {
          setAiResult(ai ?? null);
          setAdjustedConfig(adjusted ?? null);
        }
      } catch {
        if (!ctrl.signal.aborted) setAiResult(null);
      } finally {
        if (!ctrl.signal.aborted) setAiLoading(false);
      }
    },
    [useAI, capital, isT0],
  );

  const handleSearch = useCallback(
    async (code: string) => {
      setLoading(true);
      setError(null);
      setData(null);
      setAiResult(null);
      setAdjustedConfig(null);
      setFavorited(false);
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
          return [item, ...filtered].slice(0, 8);
        });
        // Fire-and-forget AI on top of the synchronous analysis
        triggerAI(result);
      } catch (err: any) {
        setError(err.message || '分析失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    },
    [capital, mode, isT0, useAI, triggerAI],
  );

  const handleHistorySelect = useCallback((item: HistoryItem) => {
    setData(item.data);
    setAiResult(null);
    setAdjustedConfig(null);
    setError(null);
  }, []);

  // Re-run AI when the toggle flips on after a result exists
  useEffect(() => {
    if (useAI && data && !aiResult && !aiLoading) {
      triggerAI(data);
    }
    if (!useAI) {
      aiAbortRef.current?.abort();
      setAiResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useAI]);

  const activeConfig = adjustedConfig ?? data?.config ?? null;

  return (
    <div style={{ padding: 'var(--sp-6) var(--sp-8) var(--sp-10)', maxWidth: 1280 }}>
      <HeroBar
        favorited={favorited}
        onToggleFavorite={() => setFavorited((v) => !v)}
        onRefresh={() => {
          if (data) handleSearch(data.market.code);
        }}
      />

      <InputBar
        onSearch={handleSearch}
        loading={loading}
        mode={mode}
        onModeChange={setMode}
        capital={capital}
        onCapitalChange={setCapital}
        isT0={isT0}
        onT0Change={setIsT0}
        useAI={useAI}
        onAIChange={setUseAI}
      />

      {error && (
        <div
          style={{
            marginBottom: 'var(--sp-5)',
            padding: 'var(--sp-3) var(--sp-4)',
            background: 'var(--danger-bg)',
            border: '1px solid var(--up-dim)',
            borderRadius: 'var(--r-md)',
            color: 'var(--danger)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {error}
        </div>
      )}

      <div
        className="trade-split"
        style={{
          display: 'grid',
          gridTemplateColumns: '260px 1fr',
          gap: 'var(--sp-5)',
          alignItems: 'flex-start',
        }}
      >
        <HistoryRail items={history} activeCode={data?.market.code} onSelect={handleHistorySelect} />

        <div style={{ minWidth: 0 }}>
          {data && activeConfig ? (
            <>
              <StockHeader market={data.market} analysis={data.analysis} />
              <ChartCard stockCode={data.market.code} />
              <IndicatorGrid market={data.market} analysis={data.analysis} />
              <RecoPanel
                analysis={data.analysis}
                config={activeConfig}
                stockCode={data.market.code}
              />
              {useAI && (
                <AISummaryCard
                  summary={aiResult?.summary ?? null}
                  loading={aiLoading}
                />
              )}
              <ConfigPreview config={activeConfig} mode={data.analysis.recommendation} />
            </>
          ) : loading ? (
            <EmptyState mode="loading" />
          ) : (
            <EmptyState mode="idle" />
          )}
        </div>
      </div>

      <footer
        style={{
          marginTop: 'var(--sp-12)',
          textAlign: 'center',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-3)',
        }}
      >
        数据来源：腾讯财经 · 仅供学习参考，不构成投资建议
      </footer>

      <style jsx>{`
        @media (max-width: 1024px) {
          .trade-split {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function EmptyState({ mode }: { mode: 'idle' | 'loading' }) {
  return (
    <div
      style={{
        marginTop: 'var(--sp-6)',
        padding: 'var(--sp-16) var(--sp-6)',
        textAlign: 'center',
        background: 'var(--surface-1)',
        border: '1px dashed var(--border-2)',
        borderRadius: 'var(--r-lg)',
      }}
    >
      {mode === 'loading' ? (
        <>
          <svg
            className="animate-spin"
            width={56}
            height={56}
            viewBox="0 0 24 24"
            fill="none"
            style={{ margin: '0 auto var(--sp-4)', color: 'var(--accent)' }}
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <h3 style={{ color: 'var(--text-2)', fontSize: 'var(--text-h3)', marginBottom: 'var(--sp-2)' }}>
            正在分析…
          </h3>
          <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
            拉取行情 · 计算指标 · 生成策略
          </p>
        </>
      ) : (
        <>
          <svg
            width={56}
            height={56}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
            style={{ margin: '0 auto var(--sp-4)', color: 'var(--text-3)', opacity: 0.4 }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <h3 style={{ color: 'var(--text-2)', fontSize: 'var(--text-h3)', marginBottom: 'var(--sp-2)' }}>
            输入股票代码开始分析
          </h3>
          <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
            支持 6 位代码（600519）或名称（贵州茅台）
          </p>
        </>
      )}
    </div>
  );
}
