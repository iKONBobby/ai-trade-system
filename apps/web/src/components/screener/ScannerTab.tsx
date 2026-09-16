'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ScreenerResult, FavoriteEntry, BackupBundle, JobProgress, RealtimeSourcePreference } from '@trade/shared';
import {
  fetchStrategies,
  runScreener,
  fetchProgress,
  ScreenerJobExpiredError,
  cancelScreenerJob,
  fetchFavorites,
  addFavorite,
  deleteFavorite,
  updateFavorite,
  bulkImportFavorites,
  exportBackup,
  importBackup,
  reviewSnapshotWithAI,
  type ScreenerStrategySummary,
} from '@/lib/api';
import {
  clearScreenerSession,
  loadScreenerSession,
  saveScreenerSession,
} from '@/lib/screener-recovery';
import ScreenerCard from '@/components/ScreenerCard';
import WatchlistPanel from '@/components/WatchlistPanel';
import FavoriteEditDialog from '@/components/FavoriteEditDialog';
import StockDetailDialog from '@/components/StockDetailDialog';
import MarketSourceSwitch from '@/components/MarketSourceSwitch';
import { readRealtimeSource, saveRealtimeSource } from '@/lib/market-source';
import AIReviewAction from '@/components/screener/AIReviewAction';
import StrategyPickerDialog from '@/components/screener/StrategyPickerDialog';

const LOCALSTORAGE_FAVORITES_KEY = 'screener_favorites';

export default function ScannerTab() {
  const [strategies, setStrategies] = useState<ScreenerStrategySummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [strategyPickerOpen, setStrategyPickerOpen] = useState(false);
  const [market, setMarket] = useState('all');
  const [includeGEM, setIncludeGEM] = useState(false);
  const [includeSTAR, setIncludeSTAR] = useState(false);
  const [useAIReview, setUseAIReview] = useState(false);
  const [realtimeSource, setRealtimeSource] = useState<RealtimeSourcePreference>('auto');
  const [aiReviewStatus, setAIReviewStatus] = useState<JobProgress['aiReviewStatus']>('not_requested');
  const [aiReviewedAt, setAIReviewedAt] = useState<string | undefined>();
  const [reviewingResults, setReviewingResults] = useState(false);
  const [scanPhase, setScanPhase] = useState<JobProgress['phase']>('scanning');
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<Record<string, JobProgress['progress']>>({});
  const [results, setResults] = useState<Record<string, ScreenerResult[]>>({});
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [activeTab, setActiveTab] = useState<string>('');
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [editingFavorite, setEditingFavorite] = useState<FavoriteEntry | null>(null);
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reconnect to an in-flight server job after navigating away and back.
  useEffect(() => {
    const saved = loadScreenerSession();
    if (!saved) return;
    setSelectedIds(saved.selectedIds);
    setMarket(saved.market);
    setIncludeGEM(saved.includeGEM);
    setIncludeSTAR(saved.includeSTAR);
    setUseAIReview(saved.useAIReview);
    setRealtimeSource(saved.realtimeSource ?? readRealtimeSource());
    setActiveTab(saved.activeTab);
    setProgress(
      Object.fromEntries(
        Object.entries(saved.progress).map(([id, value]) => [
          id,
          { ...value, failed: value.failed ?? 0 },
        ]),
      ),
    );
    setStatus('running');
    setJobIds(saved.jobIds);
  }, []);

  // Persist the latest visible progress so returning to the page has no reset flash.
  useEffect(() => {
    if (status !== 'running' || jobIds.length === 0) return;
    saveScreenerSession({
      jobIds,
      selectedIds,
      market,
      includeGEM,
      includeSTAR,
      useAIReview,
      realtimeSource,
      activeTab,
      progress,
    });
  }, [activeTab, includeGEM, includeSTAR, jobIds, market, progress, realtimeSource, selectedIds, status, useAIReview]);

  useEffect(() => {
    if (!loadScreenerSession()) setRealtimeSource(readRealtimeSource());
  }, []);

  const handleRealtimeSourceChange = useCallback((source: RealtimeSourcePreference) => {
    setRealtimeSource(source);
    saveRealtimeSource(source);
  }, []);

  // Initial load: strategies + favorites (with one-shot localStorage migration)
  useEffect(() => {
    void (async () => {
      try {
        const strats = await fetchStrategies();
        setStrategies(strats);
      } catch {
        setError('加载策略列表失败');
      }

      try {
        let serverFavs = await fetchFavorites();
        if (serverFavs.length === 0 && typeof window !== 'undefined') {
          const raw = window.localStorage.getItem(LOCALSTORAGE_FAVORITES_KEY);
          if (raw) {
            try {
              const localFavs = JSON.parse(raw) as ScreenerResult[];
              if (Array.isArray(localFavs) && localFavs.length > 0) {
                const result = await bulkImportFavorites(localFavs);
                window.localStorage.removeItem(LOCALSTORAGE_FAVORITES_KEY);
                console.log(`[迁移] ${result.added} 条收藏 localStorage → 服务端 (${result.skipped} 跳过)`);
                serverFavs = await fetchFavorites();
              }
            } catch {
              // malformed localStorage: ignore, do not clear so user can manually inspect
            }
          }
        }
        setFavorites(serverFavs);
      } catch {
        // server unavailable: ignore so the rest of the page works
      }
    })();
  }, []);

  // Poll progress
  useEffect(() => {
    if (jobIds.length === 0) return;

    let stopped = false;
    const stop = () => {
      stopped = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const poll = async () => {
      let allDone = true;
      const newProgress: Record<string, JobProgress['progress']> = {};
      const newResults: Record<string, ScreenerResult[]> = {};

      for (const jid of jobIds) {
        try {
          const p = await fetchProgress(jid);
          newProgress[jid] = p.progress;
          setScanPhase(p.phase);
          setAIReviewStatus(p.aiReviewStatus);
          setAIReviewedAt(p.aiReviewedAt);
          if (p.aiReviewError) setInfo(p.aiReviewError);
          if (p.status === 'done') {
            if (p.resultsByStrategy) {
              Object.assign(newResults, p.resultsByStrategy);
            } else if (p.strategyId) {
              newResults[p.strategyId] = p.results ?? [];
            }
          } else if (p.status === 'error') {
            clearScreenerSession();
            setError(p.error ?? '扫描失败');
            setStatus('error');
            stop();
            return;
          } else if (p.status === 'cancelled') {
            clearScreenerSession();
            setJobIds([]);
            setStatus('idle');
            stop();
            return;
          } else {
            allDone = false;
          }
        } catch (err) {
          if (err instanceof ScreenerJobExpiredError) {
            clearScreenerSession();
            setJobIds([]);
            setStatus('idle');
            setError('上次扫描任务已过期，请重新开始');
            stop();
            return;
          }
          allDone = false;
        }
      }

      if (stopped) return;
      setProgress(newProgress);
      if (Object.keys(newResults).length > 0) {
        setResults((prev) => ({ ...prev, ...newResults }));
      }
      if (allDone) {
        setStatus('done');
        clearScreenerSession();
        stop(); // halt the interval once everything is done
      }
    };

    void poll();
    intervalRef.current = setInterval(() => void poll(), 500);

    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobIds]);

  const handleStart = useCallback(async () => {
    if (selectedIds.length === 0) {
      setError('请至少选择一个策略');
      return;
    }
    setError('');
    setResults({});
    setProgress({});
    setStatus('running');
    setScanPhase('scanning');
    setAIReviewStatus(useAIReview ? 'running' : 'not_requested');
    setAIReviewedAt(undefined);

    try {
      const { jobIds: ids } = await runScreener(selectedIds, market, {
        includeGEM,
        includeSTAR,
        useAIReview,
        realtimeSource,
      });
      setJobIds(ids);
      setActiveTab(selectedIds[0]);
    } catch (e: unknown) {
      clearScreenerSession();
      setError(e instanceof Error ? e.message : '启动失败');
      setStatus('error');
    }
  }, [selectedIds, market, includeGEM, includeSTAR, useAIReview, realtimeSource]);

  const handlePostScanReview = useCallback(async () => {
    const jobId = jobIds[0];
    if (!jobId) return;
    setReviewingResults(true);
    setError('');
    setInfo('');
    try {
      const snapshot = await reviewSnapshotWithAI(jobId);
      setResults(snapshot.results);
      setAIReviewStatus(snapshot.aiReviewStatus ?? 'not_requested');
      setAIReviewedAt(snapshot.aiReviewedAt);
      if (snapshot.aiReviewStatus === 'done') {
        setInfo('AI 复核完成，结果与排序已写入本次历史记录');
      } else {
        setError(snapshot.aiReviewError ?? 'AI 复核暂时不可用，请稍后重试');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'AI 复核失败，请稍后重试');
    } finally {
      setReviewingResults(false);
    }
  }, [jobIds]);

  const handleCancel = useCallback(async () => {
    for (const jid of jobIds) {
      await cancelScreenerJob(jid).catch(() => {});
    }
    setStatus('idle');
    setJobIds([]);
    clearScreenerSession();
  }, [jobIds]);

  const toggleFavorite = useCallback(
    async (code: string) => {
      const existing = favorites.find((f) => f.stock.code === code);
      if (existing) {
        await deleteFavorite(code).catch(() => {});
        setFavorites((prev) => prev.filter((f) => f.stock.code !== code));
        return;
      }
      if (favorites.length >= 50) {
        setError('候选池已满（50 只上限）');
        return;
      }
      const stock = Object.values(results).flat().find((r) => r.code === code);
      if (!stock) return;
      try {
        const updated = await addFavorite(stock);
        setFavorites(updated);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '添加失败');
      }
    },
    [favorites, results],
  );

  const handleRemoveFavorite = useCallback(async (code: string) => {
    await deleteFavorite(code).catch(() => {});
    setFavorites((prev) => prev.filter((f) => f.stock.code !== code));
  }, []);

  const handleEditFavorite = useCallback(
    (code: string) => {
      const fav = favorites.find((f) => f.stock.code === code);
      if (fav) setEditingFavorite(fav);
    },
    [favorites],
  );

  const handleSaveFavorite = useCallback(
    async (code: string, patch: { tags: string[]; note: string }) => {
      const updated = await updateFavorite(code, patch);
      setFavorites((prev) => prev.map((f) => (f.stock.code === code ? updated : f)));
    },
    [],
  );

  const handleExportBackup = useCallback(async () => {
    try {
      const bundle = await exportBackup();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-trade-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setInfo(`已导出：history ${bundle.history.length} 条、favorites ${bundle.favorites.length} 条`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '导出失败');
    }
  }, []);

  const handleImportBackup = useCallback(async (file: File) => {
    if (!confirm(`将用 "${file.name}" 替换当前 favorites 并合并 history，确定？`)) return;
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as BackupBundle;
      const result = await importBackup(bundle);
      setFavorites(await fetchFavorites());
      setInfo(`已导入：history ${result.historyCount} 条、favorites ${result.favoritesCount} 条`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '导入失败');
    }
  }, []);

  const exportCSV = useCallback(() => {
    const allResults = Object.values(results).flat();
    const unique = Array.from(new Map(allResults.map((r) => [r.code, r])).values());
    const header = '代码,名称,现价,涨跌幅,换手率,得分,触发因子';
    const rows = unique.map((r) =>
      [
        r.code,
        r.name,
        r.price,
        r.change,
        r.turnover,
        r.score,
        r.triggeredFactors.filter((f) => f.passed).map((f) => f.name).join(';'),
      ].join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screener_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const toggleStrategy = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev,
    );
  };

  const overlapResults = (() => {
    const codeCount = new Map<string, number>();
    for (const arr of Object.values(results)) {
      for (const r of arr) {
        codeCount.set(r.code, (codeCount.get(r.code) ?? 0) + 1);
      }
    }
    const overlapCodes = new Set<string>();
    for (const [code, count] of codeCount) {
      if (count >= 2) overlapCodes.add(code);
    }
    return Object.values(results)
      .flat()
      .filter((r) => overlapCodes.has(r.code))
      .filter((r, i, arr) => arr.findIndex((x) => x.code === r.code) === i)
      .sort((a, b) => b.score - a.score);
  })();

  const totalProgress = Object.values(progress).reduce((s, p) => s + p.scanned, 0);
  const totalTotal = Object.values(progress).reduce((s, p) => s + p.total, 0);
  const totalFailed = Object.values(progress).reduce((s, p) => s + (p.failed ?? 0), 0);
  const overallPct = totalTotal > 0 ? Math.round((totalProgress / totalTotal) * 100) : 0;

  const favoriteCodes = new Set(favorites.map((f) => f.stock.code));
  const selectedStrategies = selectedIds.flatMap((id) => {
    const strategy = strategies.find((item) => item.id === id);
    return strategy ? [strategy] : [];
  });

  return (
    <>
      {/* Header with backup actions */}
      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
        <div>
          <h1 className="mb-1 text-xl font-bold">智能选股</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            选择策略，扫描全市场符合条件的股票。每次扫描会自动归档到历史。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportBackup}
            className="min-h-10 rounded-md border border-[var(--color-border)] px-3 text-xs sm:min-h-9"
            title="导出全部历史 + 收藏 JSON 备份"
          >
            备份
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="min-h-10 rounded-md border border-[var(--color-border)] px-3 text-xs sm:min-h-9"
            title="从 JSON 备份恢复"
          >
            恢复
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportBackup(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <section className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4" aria-labelledby="strategy-combination-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="strategy-combination-title" className="text-sm font-semibold">策略组合</h2>
              <span className="text-xs tabular-nums text-[var(--color-text-secondary)]">{selectedIds.length}/3</span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">只显示已选策略，完整策略库按需打开。</p>
          </div>
          <button
            type="button"
            onClick={() => setStrategyPickerOpen(true)}
            disabled={status === 'running'}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm font-medium transition-colors hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            {selectedIds.length === 0 ? '选择策略' : '调整策略'}
          </button>
        </div>

        <div className="mt-3 flex min-h-11 flex-wrap items-center gap-2" aria-live="polite">
          {selectedStrategies.length > 0 ? selectedStrategies.map((strategy) => (
            <button
              key={strategy.id}
              type="button"
              onClick={() => toggleStrategy(strategy.id)}
              disabled={status === 'running'}
              aria-label={`移除策略：${strategy.name}`}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 px-3 text-xs font-medium transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {strategy.name}
              <svg aria-hidden="true" className="h-3.5 w-3.5 text-[var(--color-text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )) : (
            <span className="text-sm text-[var(--color-text-secondary)]">尚未选择策略</span>
          )}
        </div>
      </section>

      <StrategyPickerDialog
        open={strategyPickerOpen}
        strategies={strategies}
        selectedIds={selectedIds}
        onToggle={toggleStrategy}
        onClose={() => setStrategyPickerOpen(false)}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value)}
          disabled={status === 'running'}
          aria-label="股票市场范围"
          className="min-h-11 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 text-sm"
        >
          <option value="all">沪深主板</option>
          <option value="sh">仅上海主板 (600/601/603/605)</option>
          <option value="sz">仅深圳主板 (000/001/002)</option>
        </select>

        <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={includeGEM}
            onChange={(e) => setIncludeGEM(e.target.checked)}
            disabled={status === 'running'}
            className="cursor-pointer"
          />
          含创业板 (300)
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={includeSTAR}
            onChange={(e) => setIncludeSTAR(e.target.checked)}
            disabled={status === 'running'}
            className="cursor-pointer"
          />
          含科创板 (688)
        </label>

        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)]/50">
          <input
            type="checkbox"
            checked={useAIReview}
            onChange={(e) => setUseAIReview(e.target.checked)}
            disabled={status === 'running'}
            className="cursor-pointer"
            aria-describedby="ai-review-help"
          />
          <span>
            <span className="block font-medium text-[var(--color-text-primary)]">AI 复核</span>
            <span id="ai-review-help" className="block text-[10px]">复核各策略量化前 20 名</span>
          </span>
        </label>

        <MarketSourceSwitch
          value={realtimeSource}
          onChange={handleRealtimeSourceChange}
          disabled={status === 'running'}
        />

        {status !== 'running' ? (
          <button
            onClick={handleStart}
            disabled={selectedIds.length === 0}
            className="min-h-11 cursor-pointer rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            开始扫描
          </button>
        ) : (
          <button
            onClick={handleCancel}
            className="min-h-11 cursor-pointer rounded-md border border-red-400 px-4 text-sm font-medium text-red-400 transition-colors hover:bg-red-400/5"
          >
            取消扫描
          </button>
        )}

        {status === 'done' && (
          <button
            onClick={exportCSV}
            className="min-h-11 cursor-pointer rounded-md border border-[var(--color-border)] px-3 text-sm transition-colors hover:border-[var(--color-primary)]/50"
          >
            导出 CSV
          </button>
        )}

      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-red-400">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-xs underline">关闭</button>
        </div>
      )}

      {info && (
        <div className="mb-4 rounded-md border border-emerald-400/30 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-500">
          {info}
          <button onClick={() => setInfo('')} className="ml-2 text-xs underline">关闭</button>
        </div>
      )}

      {status === 'running' && (
        <div className="mb-6">
          <div className="mb-1 flex justify-between text-xs text-[var(--color-text-secondary)]">
            <span aria-live="polite">
              {scanPhase === 'market_sync'
                ? '正在同步并缓存历史日线，首次运行会稍慢...'
                : useAIReview && overallPct === 100 && aiReviewStatus === 'running'
                  ? 'AI 正在复核候选...'
                  : '规则扫描中...'}
              {totalFailed > 0 ? ` · ${totalFailed} 只数据获取失败` : ''}
            </span>
            <span>{overallPct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>
      )}

      {status === 'done' && totalFailed > 0 && (
        <div
          role="status"
          className="mb-4 rounded-md border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-400"
        >
          扫描已完成，其中 {totalFailed} 只股票因行情数据不可用未参与评分。
        </div>
      )}

      <WatchlistPanel
        favorites={favorites}
        onRemove={handleRemoveFavorite}
        onClick={(code) => setDetailCode(code)}
        onEdit={handleEditFavorite}
      />

      {status === 'idle' && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)] py-24">
          <svg className="mb-5 h-16 w-16 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-sm text-[var(--color-text-secondary)]">选择策略后点击"开始扫描"</p>
        </div>
      )}

      {status === 'done' && (
        <div>
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">扫描结果复核</div>
              <div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                AI 将复核每个策略量化排名前 20 的候选，并保存评分、结论和风险。
              </div>
            </div>
            <AIReviewAction
              status={aiReviewStatus}
              reviewedAt={aiReviewedAt}
              loading={reviewingResults}
              onReview={() => void handlePostScanReview()}
            />
          </div>
          <div className="mb-4 flex gap-2 border-b border-[var(--color-border)]">
            {selectedIds.map((sid) => {
              const s = strategies.find((x) => x.id === sid);
              const count = results[sid]?.length ?? 0;
              return (
                <button
                  key={sid}
                  onClick={() => setActiveTab(sid)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    activeTab === sid
                      ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                      : 'text-[var(--color-text-secondary)]'
                  }`}
                >
                  {s?.name ?? sid}
                  <span className="ml-1 text-xs">({count})</span>
                </button>
              );
            })}
            {selectedIds.length > 1 && overlapResults.length > 0 && (
              <button
                onClick={() => setActiveTab('_overlap')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === '_overlap'
                    ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text-secondary)]'
                }`}
              >
                重叠信号
                <span className="ml-1 text-xs">({overlapResults.length})</span>
              </button>
            )}
          </div>

          {(() => {
            let displayResults: ScreenerResult[];
            if (activeTab === '_overlap') {
              displayResults = overlapResults;
            } else {
              displayResults = results[activeTab] ?? [];
            }

            if (displayResults.length === 0) {
              return (
                <div className="py-12 text-center text-sm text-[var(--color-text-secondary)]">
                  当前无股票符合该策略条件
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {displayResults.map((r) => (
                  <ScreenerCard
                    key={r.code}
                    result={r}
                    isFavorited={favoriteCodes.has(r.code)}
                    onToggleFavorite={toggleFavorite}
                    onClick={(code) => setDetailCode(code)}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {editingFavorite && (
        <FavoriteEditDialog
          favorite={editingFavorite}
          onClose={() => setEditingFavorite(null)}
          onSave={(patch) => handleSaveFavorite(editingFavorite.stock.code, patch)}
        />
      )}

      {detailCode && (() => {
        // Look up metadata from current scan results OR favorites
        const fromResults = Object.values(results).flat().find((r) => r.code === detailCode);
        const fromFavs = favorites.find((f) => f.stock.code === detailCode);
        const stock = fromResults ?? fromFavs?.stock;
        return (
          <StockDetailDialog
            code={detailCode}
            initialMeta={stock ? {
              name: stock.name,
              market: stock.market,
              price: stock.price,
              change: stock.change,
              turnover: stock.turnover,
              turnoverAvailable: stock.turnoverAvailable,
              high: stock.high,
              low: stock.low,
            } : undefined}
            isFavorited={favoriteCodes.has(detailCode)}
            onClose={() => setDetailCode(null)}
            onAddedToFavorite={async () => {
              const updated = await fetchFavorites().catch(() => null);
              if (updated) setFavorites(updated);
            }}
          />
        );
      })()}
    </>
  );
}
