'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HistoryDateGroup, ScanSnapshot, SnapshotDiff, HistoryRange, ScanSnapshotMeta } from '@trade/shared';
import { fetchHistory, fetchSnapshot, fetchSnapshotDiff, fetchStrategies } from '@/lib/api';

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: 'today', label: '今天' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: 'all', label: '全部' },
];

export default function HistoryTab() {
  const [range, setRange] = useState<HistoryRange>('30d');
  const [groups, setGroups] = useState<HistoryDateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ScanSnapshot | null>(null);

  const [diffFromId, setDiffFromId] = useState<string | null>(null);
  const [diffStrategyId, setDiffStrategyId] = useState<string | null>(null);
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);

  const [strategies, setStrategies] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    void fetchStrategies().then(setStrategies).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchHistory(range)
      .then((g) => setGroups(g))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => {
    if (!selectedId) {
      setSnapshot(null);
      return;
    }
    void fetchSnapshot(selectedId).then(setSnapshot).catch(() => setSnapshot(null));
  }, [selectedId]);

  // Compute diff when both ends + strategy chosen
  useEffect(() => {
    if (!selectedId || !diffFromId || !diffStrategyId) {
      setDiff(null);
      return;
    }
    void fetchSnapshotDiff(diffFromId, selectedId, diffStrategyId)
      .then(setDiff)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '对比失败'));
  }, [selectedId, diffFromId, diffStrategyId]);

  const allSnapshotsFlat = useMemo(() => groups.flatMap((g) => g.snapshots), [groups]);
  const sharedStrategies = useMemo(() => {
    if (!snapshot || !diffFromId) return [];
    const from = allSnapshotsFlat.find((s) => s.id === diffFromId);
    if (!from) return [];
    return from.strategyIds.filter((sid) => snapshot.strategyIds.includes(sid));
  }, [snapshot, diffFromId, allSnapshotsFlat]);

  const strategyName = (id: string) => strategies.find((s) => s.id === id)?.name ?? id;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-xl font-bold">选股历史</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            按日期归档的每一次扫描，可两两对比看哪些新进、哪些跌出。
          </p>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`rounded-md px-3 py-1.5 text-xs ${
                range === r.value
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'border border-[var(--color-border)] text-[var(--color-text-secondary)]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px,1fr]">
        {/* Timeline */}
        <div>
          {loading && <p className="text-sm text-[var(--color-text-secondary)]">加载中...</p>}
          {!loading && groups.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-[var(--color-border)] py-12 text-center text-sm text-[var(--color-text-secondary)]">
              暂无{RANGES.find((r) => r.value === range)?.label}的扫描记录
            </div>
          )}
          {groups.map((g) => (
            <div key={g.date} className="mb-4">
              <h2 className="mb-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">{g.date}</h2>
              <div className="space-y-1">
                {g.snapshots.map((snap) => (
                  <SnapshotRow
                    key={snap.id}
                    snap={snap}
                    isSelected={selectedId === snap.id}
                    isDiffSource={diffFromId === snap.id}
                    strategyName={strategyName}
                    onSelect={() => {
                      setSelectedId(snap.id);
                      if (diffFromId === snap.id) {
                        setDiffFromId(null);
                        setDiff(null);
                      }
                    }}
                    onCompare={() => {
                      if (diffFromId === snap.id) {
                        setDiffFromId(null);
                        setDiff(null);
                      } else {
                        setDiffFromId(snap.id);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div>
          {!selectedId && (
            <div className="rounded-xl border-2 border-dashed border-[var(--color-border)] py-24 text-center text-sm text-[var(--color-text-secondary)]">
              点击左侧"查看"看快照详情，或点"对比"标记起点再选第二个快照
            </div>
          )}

          {selectedId && diffFromId && diffFromId !== selectedId && (
            <DiffView
              fromMeta={allSnapshotsFlat.find((s) => s.id === diffFromId)}
              toMeta={allSnapshotsFlat.find((s) => s.id === selectedId)}
              sharedStrategies={sharedStrategies}
              currentStrategyId={diffStrategyId}
              onStrategyChange={setDiffStrategyId}
              strategyName={strategyName}
              diff={diff}
            />
          )}

          {selectedId && (!diffFromId || diffFromId === selectedId) && snapshot && (
            <SnapshotDetail snapshot={snapshot} strategyName={strategyName} />
          )}
        </div>
      </div>
    </>
  );
}

function SnapshotRow({
  snap,
  isSelected,
  isDiffSource,
  strategyName,
  onSelect,
  onCompare,
}: {
  snap: ScanSnapshotMeta;
  isSelected: boolean;
  isDiffSource: boolean;
  strategyName: (id: string) => string;
  onSelect: () => void;
  onCompare: () => void;
}) {
  const time = new Date(snap.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return (
    <div
      className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
        isSelected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
          : isDiffSource
          ? 'border-amber-400 bg-amber-400/5'
          : 'border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-primary)]/50'
      }`}
    >
      <button onClick={onSelect} className="flex-1 text-left">
        <div className="text-xs text-[var(--color-text-secondary)]">{time}</div>
        <div className="truncate text-xs font-medium">
          {snap.strategyIds.map(strategyName).join(' · ')}
        </div>
        <div className="text-[10px] text-[var(--color-text-secondary)]">
          {snap.marketFilter} · {snap.totalResults} 命中
        </div>
      </button>
      <button
        onClick={onCompare}
        className={`ml-2 rounded px-2 py-1 text-[10px] ${
          isDiffSource ? 'bg-amber-400 text-black' : 'border border-[var(--color-border)]'
        }`}
        title={isDiffSource ? '取消对比起点' : '设为对比起点'}
      >
        {isDiffSource ? '取消' : '对比'}
      </button>
    </div>
  );
}

function SnapshotDetail({
  snapshot,
  strategyName,
}: {
  snapshot: ScanSnapshot;
  strategyName: (id: string) => string;
}) {
  const [activeStrategy, setActiveStrategy] = useState(snapshot.strategyIds[0]);
  const results = snapshot.results[activeStrategy] ?? [];
  return (
    <div>
      <div className="mb-3 text-sm text-[var(--color-text-secondary)]">
        快照 {snapshot.id} · {new Date(snapshot.timestamp).toLocaleString('zh-CN')} · 耗时 {(snapshot.durationMs / 1000).toFixed(1)}s
      </div>
      <div className="mb-3 flex gap-2 border-b border-[var(--color-border)]">
        {snapshot.strategyIds.map((sid) => (
          <button
            key={sid}
            onClick={() => setActiveStrategy(sid)}
            className={`px-3 py-2 text-sm transition-colors ${
              activeStrategy === sid
                ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)]'
            }`}
          >
            {strategyName(sid)}
            <span className="ml-1 text-xs">({snapshot.results[sid]?.length ?? 0})</span>
          </button>
        ))}
      </div>
      {results.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--color-text-secondary)]">无符合条件的股票</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
          {results.map((r) => (
            <li key={r.code} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-[var(--color-bg-card)]">
              <button onClick={() => window.open(`/trade?code=${r.code}`, '_self')} className="flex-1 text-left">
                <span className="font-medium">{r.name}</span>
                <span className="ml-2 text-xs text-[var(--color-text-secondary)]">{r.code}</span>
              </button>
              <span className={`text-xs ${r.change >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {r.change >= 0 ? '+' : ''}{r.change.toFixed(2)}%
              </span>
              <span className="ml-3 text-xs font-bold">{r.score}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DiffView({
  fromMeta,
  toMeta,
  sharedStrategies,
  currentStrategyId,
  onStrategyChange,
  strategyName,
  diff,
}: {
  fromMeta?: ScanSnapshotMeta;
  toMeta?: ScanSnapshotMeta;
  sharedStrategies: string[];
  currentStrategyId: string | null;
  onStrategyChange: (id: string) => void;
  strategyName: (id: string) => string;
  diff: SnapshotDiff | null;
}) {
  const [tab, setTab] = useState<'newcomers' | 'dropouts' | 'retained'>('newcomers');

  useEffect(() => {
    if (sharedStrategies.length > 0 && !sharedStrategies.includes(currentStrategyId ?? '')) {
      onStrategyChange(sharedStrategies[0]);
    }
  }, [sharedStrategies, currentStrategyId, onStrategyChange]);

  if (!fromMeta || !toMeta) {
    return <p className="text-sm text-[var(--color-text-secondary)]">缺失快照信息</p>;
  }

  if (sharedStrategies.length === 0) {
    return (
      <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-4 text-sm">
        两次扫描没有共同的策略，无法对比。点左侧"对比"按钮取消起点重选。
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 text-xs">
        <div>
          <span className="text-amber-400">起点：</span>
          {fromMeta.timestamp.slice(0, 16).replace('T', ' ')} ({fromMeta.totalResults} 命中)
        </div>
        <div>
          <span className="text-[var(--color-primary)]">对比到：</span>
          {toMeta.timestamp.slice(0, 16).replace('T', ' ')} ({toMeta.totalResults} 命中)
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[var(--color-text-secondary)]">策略：</span>
          <select
            value={currentStrategyId ?? ''}
            onChange={(e) => onStrategyChange(e.target.value)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
          >
            {sharedStrategies.map((sid) => (
              <option key={sid} value={sid}>{strategyName(sid)}</option>
            ))}
          </select>
        </div>
      </div>

      {!diff && <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">加载对比...</p>}

      {diff && (
        <>
          <div className="mb-3 flex gap-2 border-b border-[var(--color-border)]">
            <DiffTab label="新进" count={diff.newcomers.length} color="text-red-500" active={tab === 'newcomers'} onClick={() => setTab('newcomers')} />
            <DiffTab label="跌出" count={diff.dropouts.length} color="text-green-500" active={tab === 'dropouts'} onClick={() => setTab('dropouts')} />
            <DiffTab label="留存" count={diff.retained.length} color="text-[var(--color-primary)]" active={tab === 'retained'} onClick={() => setTab('retained')} />
          </div>

          {tab === 'newcomers' && <StockList stocks={diff.newcomers} />}
          {tab === 'dropouts' && <StockList stocks={diff.dropouts} dimmed />}
          {tab === 'retained' && (
            <ul className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
              {diff.retained.map((r) => (
                <li key={r.stock.code} className="flex items-center justify-between px-3 py-2 text-sm">
                  <button onClick={() => window.open(`/trade?code=${r.stock.code}`, '_self')} className="flex-1 text-left">
                    <span className="font-medium">{r.stock.name}</span>
                    <span className="ml-2 text-xs text-[var(--color-text-secondary)]">{r.stock.code}</span>
                  </button>
                  <span className={`text-xs ${r.scoreDelta > 0 ? 'text-red-500' : r.scoreDelta < 0 ? 'text-green-500' : 'text-[var(--color-text-secondary)]'}`}>
                    得分 Δ {r.scoreDelta > 0 ? '+' : ''}{r.scoreDelta}
                  </span>
                </li>
              ))}
              {diff.retained.length === 0 && <li className="px-3 py-6 text-center text-sm text-[var(--color-text-secondary)]">无留存</li>}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function DiffTab({ label, count, color, active, onClick }: { label: string; count: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm transition-colors ${active ? `border-b-2 border-current font-medium ${color}` : 'text-[var(--color-text-secondary)]'}`}
    >
      {label}
      <span className="ml-1 text-xs">({count})</span>
    </button>
  );
}

function StockList({ stocks, dimmed }: { stocks: { code: string; name: string; change: number; score: number }[]; dimmed?: boolean }) {
  if (stocks.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--color-text-secondary)]">无变化</p>;
  }
  return (
    <ul className={`divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)] ${dimmed ? 'opacity-70' : ''}`}>
      {stocks.map((s) => (
        <li key={s.code} className="flex items-center justify-between px-3 py-2 text-sm">
          <button onClick={() => window.open(`/trade?code=${s.code}`, '_self')} className="flex-1 text-left">
            <span className={`font-medium ${dimmed ? 'line-through' : ''}`}>{s.name}</span>
            <span className="ml-2 text-xs text-[var(--color-text-secondary)]">{s.code}</span>
          </button>
          <span className={`text-xs ${s.change >= 0 ? 'text-red-500' : 'text-green-500'}`}>
            {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%
          </span>
          <span className="ml-3 text-xs font-bold">{s.score}</span>
        </li>
      ))}
    </ul>
  );
}
