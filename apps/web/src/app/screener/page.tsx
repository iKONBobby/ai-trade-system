'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ScreenerResult } from '@trade/shared';
import {
  fetchStrategies,
  runScreener,
  fetchProgress,
  cancelScreenerJob,
  getLocalStats,
  recordScan,
} from '@/lib/api';
import ScreenerCard from '@/components/ScreenerCard';
import WatchlistPanel, { loadFavorites, saveFavorites } from '@/components/WatchlistPanel';

export default function ScreenerPage() {
  const [strategies, setStrategies] = useState<{ id: string; name: string; description: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [market, setMarket] = useState('all');
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<Record<string, { scanned: number; total: number }>>({});
  const [results, setResults] = useState<Record<string, ScreenerResult[]>>({});
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [activeTab, setActiveTab] = useState<string>('');
  const [favorites, setFavorites] = useState<ScreenerResult[]>([]);
  const [error, setError] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchStrategies()
      .then(setStrategies)
      .catch(() => setError('加载策略列表失败'));
    setFavorites(loadFavorites());
  }, []);

  // Poll progress
  useEffect(() => {
    if (jobIds.length === 0) return;

    let stopped = false;
    const poll = async () => {
      let allDone = true;
      const newProgress: Record<string, { scanned: number; total: number }> = {};
      const newResults: Record<string, ScreenerResult[]> = {};

      for (const jid of jobIds) {
        try {
          const p = await fetchProgress(jid);
          newProgress[jid] = p.progress;
          if (p.status === 'done') {
            newResults[jid] = p.results ?? [];
          } else if (p.status === 'error') {
            setError(p.error ?? '扫描失败');
            setStatus('error');
            return;
          } else if (p.status === 'cancelled') {
            allDone = false;
          } else {
            allDone = false;
          }
        } catch {
          allDone = false;
        }
      }

      if (!stopped) {
        setProgress(newProgress);
        if (Object.keys(newResults).length > 0) {
          setResults((prev) => ({ ...prev, ...newResults }));
        }
        if (allDone) {
          setStatus('done');
          selectedIds.forEach((sid) => {
            const jid = jobIds[0]; // single job for multiple strategies
            const r = newResults[jid];
            if (r) recordScan(sid, r.length);
          });
        }
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 500);

    return () => {
      stopped = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
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

    try {
      const { jobIds: ids } = await runScreener(selectedIds, market);
      setJobIds(ids);
      setActiveTab(selectedIds[0]);
    } catch (e: any) {
      setError(e.message ?? '启动失败');
      setStatus('error');
    }
  }, [selectedIds, market]);

  const handleCancel = useCallback(async () => {
    for (const jid of jobIds) {
      await cancelScreenerJob(jid).catch(() => {});
    }
    setStatus('idle');
    setJobIds([]);
  }, [jobIds]);

  const toggleFavorite = useCallback(
    (code: string) => {
      setFavorites((prev) => {
        const exists = prev.find((f) => f.code === code);
        let next: ScreenerResult[];
        if (exists) {
          next = prev.filter((f) => f.code !== code);
        } else {
          if (prev.length >= 50) return prev;
          const stock = Object.values(results)
            .flat()
            .find((r) => r.code === code);
          if (!stock) return prev;
          next = [...prev, stock];
        }
        saveFavorites(next);
        return next;
      });
    },
    [results],
  );

  const handleRemoveFavorite = useCallback((code: string) => {
    setFavorites((prev) => {
      const next = prev.filter((f) => f.code !== code);
      saveFavorites(next);
      return next;
    });
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

  // Compute overlap results (stocks appearing in 2+ strategies)
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
  const overallPct = totalTotal > 0 ? Math.round((totalProgress / (totalTotal * jobIds.length || 1)) * 100) : 0;

  const stats = getLocalStats();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Strategy selector */}
      <div className="mb-6">
        <h1 className="mb-1 text-xl font-bold">智能选股</h1>
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
          选择策略，扫描全市场符合条件的股票
        </p>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {strategies.map((s) => {
            const sel = selectedIds.includes(s.id);
            const stat = stats.get(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggleStrategy(s.id)}
                disabled={status === 'running'}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  sel
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-primary)]/50'
                } ${status === 'running' ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{s.name}</span>
                  <input type="checkbox" checked={sel} readOnly className="pointer-events-none" />
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{s.description}</p>
                {stat && stat.scans > 0 && (
                  <p className="mt-1 text-[10px] text-[var(--color-text-secondary)]">
                    已扫 {stat.scans} 次 | 最近 {stat.results} 只入选
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {/* Market filter + actions */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            disabled={status === 'running'}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1.5 text-sm"
          >
            <option value="all">全部 A 股</option>
            <option value="sh">上海 (6xxxxx)</option>
            <option value="sz">深圳 (0xxxxx/3xxxxx)</option>
          </select>

          {status !== 'running' ? (
            <button
              onClick={handleStart}
              disabled={selectedIds.length === 0}
              className="rounded-md bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              开始扫描
            </button>
          ) : (
            <button
              onClick={handleCancel}
              className="rounded-md border border-red-400 px-4 py-1.5 text-sm font-medium text-red-400"
            >
              取消扫描
            </button>
          )}

          {status === 'done' && (
            <button
              onClick={exportCSV}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
            >
              导出 CSV
            </button>
          )}

          {selectedIds.length === 3 && (
            <span className="text-xs text-[var(--color-text-secondary)]">已达上限 (3个策略)</span>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 rounded-md border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Progress bar */}
      {status === 'running' && (
        <div className="mb-6">
          <div className="mb-1 flex justify-between text-xs text-[var(--color-text-secondary)]">
            <span>扫描中...</span>
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

      {/* Favorites panel */}
      <WatchlistPanel
        favorites={favorites}
        onRemove={handleRemoveFavorite}
        onClick={(code) => window.open(`/trade?code=${code}`, '_self')}
      />

      {/* Empty state */}
      {status === 'idle' && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)] py-24">
          <svg className="mb-5 h-16 w-16 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-sm text-[var(--color-text-secondary)]">选择策略后点击"开始扫描"</p>
        </div>
      )}

      {/* Results tabs */}
      {status === 'done' && (
        <div>
          {/* Tabs */}
          <div className="mb-4 flex gap-2 border-b border-[var(--color-border)]">
            {selectedIds.map((sid) => {
              const s = strategies.find((x) => x.id === sid);
              const count = results[jobIds[0]]?.length ?? 0;
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

          {/* Tab content */}
          {(() => {
            let displayResults: ScreenerResult[];
            if (activeTab === '_overlap') {
              displayResults = overlapResults;
            } else {
              displayResults = results[jobIds[0]] ?? [];
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
                    isFavorited={favorites.some((f) => f.code === r.code)}
                    onToggleFavorite={toggleFavorite}
                    onClick={(code) => window.open(`/trade?code=${code}`, '_self')}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
