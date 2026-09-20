import type {
  AnalyzeRequest,
  AnalyzeResponse,
  StockSearchItem,
  MarketData,
  AnalysisResult,
  AIAnalysisResult,
  JobProgress,
  ScreenerResult,
  FavoriteEntry,
  HistoryRange,
  HistoryDateGroup,
  ScanSnapshot,
  SnapshotDiff,
  BackupBundle,
  KLine,
  KlinePeriod,
  RealtimeSourcePreference,
  LotteryHistoryResponse,
  LotteryKind,
} from '@trade/shared';

const BASE = '/api';

export async function fetchLotteryHistory(
  kind: LotteryKind,
  options: { limit?: number; refresh?: boolean; signal?: AbortSignal } = {},
): Promise<LotteryHistoryResponse> {
  const params = new URLSearchParams({
    kind,
    limit: String(options.limit ?? 100),
    ...(options.refresh ? { refresh: '1' } : {}),
  });
  const res = await fetch(`${BASE}/lottery/history?${params.toString()}`, { signal: options.signal });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || error.error || '获取历史开奖数据失败');
  }
  return res.json();
}

export async function searchStocks(keyword: string): Promise<StockSearchItem[]> {
  const res = await fetch(`${BASE}/stock/search?keyword=${encodeURIComponent(keyword)}`);

  if (!res.ok) {
    throw new Error('搜索失败');
  }

  return res.json();
}

export async function analyzeStock(params: AnalyzeRequest): Promise<AnalyzeResponse> {
  const controller = new AbortController();
  // Server-side retries can take up to ~3 * 8s = 24s, give some headroom
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(`${BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // Prefer server-provided friendly message over the error code
      throw new Error(err.message || err.error || `请求失败 (${res.status})`);
    }

    return res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('请求超时，请重试');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAIAnalysis(
  market: MarketData,
  analysis: AnalysisResult,
  opts?: { totalCapital?: number; isT0Mode?: boolean; strategyId?: string },
  externalSignal?: AbortSignal,
): Promise<{ aiResult: AIAnalysisResult | null; config?: any }> {
  const internal = new AbortController();
  const timeout = setTimeout(() => internal.abort(), 120000);

  const signal = externalSignal
    ? AbortSignal.any([externalSignal, internal.signal])
    : internal.signal;

  try {
    const res = await fetch(`${BASE}/ai-analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market, analysis, ...opts }),
      signal,
    });

    if (!res.ok) return { aiResult: null };

    const data = await res.json();
    return { aiResult: data.aiResult ?? null, config: data.config };
  } catch {
    return { aiResult: null };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Screener API ──────────────────────────────────────────────────

export interface ScreenerStrategySummary {
  id: string;
  name: string;
  description: string;
  horizon: 'short' | 'medium' | 'long';
  includeLimitUp: boolean;
}

export async function fetchStrategies(): Promise<ScreenerStrategySummary[]> {
  const res = await fetch(`${BASE}/screener/strategies`);
  if (!res.ok) throw new Error('获取策略列表失败');
  return res.json();
}

export async function runScreener(
  strategyIds: string[],
  market?: string,
  opts: { includeGEM?: boolean; includeSTAR?: boolean; useAIReview?: boolean; realtimeSource?: RealtimeSourcePreference } = {},
): Promise<{ jobIds: string[] }> {
  const res = await fetch(`${BASE}/screener/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      strategyIds,
      market,
      includeGEM: opts.includeGEM,
      includeSTAR: opts.includeSTAR,
      useAIReview: opts.useAIReview,
      realtimeSource: opts.realtimeSource,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || '启动扫描失败');
  }
  return res.json();
}

export class ScreenerJobExpiredError extends Error {
  constructor() {
    super('Job not found or expired');
    this.name = 'ScreenerJobExpiredError';
  }
}

export async function fetchProgress(jobId: string): Promise<JobProgress> {
  const res = await fetch(`${BASE}/screener/progress/${jobId}`);
  if (!res.ok) {
    if (res.status === 404) throw new ScreenerJobExpiredError();
    const err = await res.json();
    throw new Error(err.message || '获取进度失败');
  }
  return res.json();
}

export async function cancelScreenerJob(jobId: string): Promise<void> {
  await fetch(`${BASE}/screener/jobs/${jobId}`, { method: 'DELETE' });
}

// ── Favorites API (server-side) ──────────────────────────────────

export async function fetchFavorites(): Promise<FavoriteEntry[]> {
  const res = await fetch(`${BASE}/favorites`);
  if (!res.ok) throw new Error('获取收藏失败');
  return res.json();
}

export async function addFavorite(stock: ScreenerResult, tags: string[] = [], note: string = ''): Promise<FavoriteEntry[]> {
  const res = await fetch(`${BASE}/favorites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stock, tags, note }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || '添加收藏失败');
  }
  return res.json();
}

export async function updateFavorite(code: string, patch: { tags?: string[]; note?: string }): Promise<FavoriteEntry> {
  const res = await fetch(`${BASE}/favorites/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || '更新收藏失败');
  }
  return res.json();
}

export async function deleteFavorite(code: string): Promise<void> {
  const res = await fetch(`${BASE}/favorites/${encodeURIComponent(code)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error('删除收藏失败');
}

export async function bulkImportFavorites(stocks: ScreenerResult[]): Promise<{ added: number; skipped: number }> {
  const res = await fetch(`${BASE}/favorites/bulk-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stocks),
  });
  if (!res.ok) throw new Error('批量导入失败');
  return res.json();
}

// ── History API ──────────────────────────────────────────────────

export async function fetchHistory(range: HistoryRange = 'all'): Promise<HistoryDateGroup[]> {
  const res = await fetch(`${BASE}/history?range=${encodeURIComponent(range)}`);
  if (!res.ok) throw new Error('获取历史失败');
  return res.json();
}

export async function fetchSnapshot(id: string): Promise<ScanSnapshot> {
  const res = await fetch(`${BASE}/history/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('获取快照失败');
  return res.json();
}

export async function reviewSnapshotWithAI(id: string): Promise<ScanSnapshot> {
  const res = await fetch(`${BASE}/history/${encodeURIComponent(id)}/ai-review`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'AI 复核失败');
  return data as ScanSnapshot;
}

export async function fetchSnapshotDiff(fromId: string, toId: string, strategyId: string): Promise<SnapshotDiff> {
  const params = new URLSearchParams({ from: fromId, to: toId, strategyId });
  const res = await fetch(`${BASE}/history/diff?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || '对比失败');
  }
  return res.json();
}

// ── Backup API ───────────────────────────────────────────────────

export async function exportBackup(): Promise<BackupBundle> {
  const res = await fetch(`${BASE}/backup/export`);
  if (!res.ok) throw new Error('导出备份失败');
  return res.json();
}

export async function importBackup(bundle: BackupBundle): Promise<{ historyCount: number; favoritesCount: number }> {
  const res = await fetch(`${BASE}/backup/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bundle),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || '导入备份失败');
  }
  return res.json();
}

// ── Swarm engine (AI 辩论) ───────────────────────────────────────

export interface SwarmStartArgs {
  stockCode: string;
  presetId?: string; // 默认 'investment_committee'
  totalCapital?: number;
  tradeMode?: 'grid' | 'condition' | 'auto';
  isT0Mode?: boolean;
}

export interface SwarmStartResult {
  runId: string;
  streamUrl: string;
}

/** POST /api/swarm/runs — 启动 swarm. 返回 runId + SSE 路径 (供 useSwarmStream 订阅). */
export async function startSwarmRun(args: SwarmStartArgs): Promise<SwarmStartResult> {
  const res = await fetch(`${BASE}/swarm/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stockCode: args.stockCode,
      presetId: args.presetId ?? 'investment_committee',
      totalCapital: args.totalCapital,
      tradeMode: args.tradeMode,
      isT0Mode: args.isT0Mode,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `启动 AI 辩论失败 (${res.status})`);
  }
  return res.json();
}

/** POST /api/swarm/runs/:runId/abort */
export async function abortSwarmRun(runId: string): Promise<void> {
  await fetch(`${BASE}/swarm/runs/${encodeURIComponent(runId)}/abort`, {
    method: 'POST',
  });
}

export interface SwarmRunStatus {
  runId: string;
  state: 'pending' | 'running' | 'done' | 'aborted' | 'error';
  stockCode: string | null;
  presetId: string | null;
  createdAt: number;
  finishedAt: number | null;
}

/** GET /api/swarm/runs/:runId — C8 recovery 状态查询. 404 时返回 null. */
export async function fetchSwarmRunStatus(runId: string): Promise<SwarmRunStatus | null> {
  const res = await fetch(`${BASE}/swarm/runs/${encodeURIComponent(runId)}`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

export interface SwarmBatchArgs {
  stockCodes: string[]; // 上限 10
  presetId?: string; // 默认 'investment_committee'
  totalCapital?: number;
  tradeMode?: 'grid' | 'condition' | 'auto';
}

export interface SwarmBatchResult {
  batchId: string;
  runs: { stockCode: string; runId: string; streamUrl: string }[];
}

/** POST /api/swarm/batch-runs — 批量召开 (C5, 后端 concurrency 上限 2). */
export async function startBatchSwarm(args: SwarmBatchArgs): Promise<SwarmBatchResult> {
  const res = await fetch(`${BASE}/swarm/batch-runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stockCodes: args.stockCodes,
      presetId: args.presetId ?? 'investment_committee',
      totalCapital: args.totalCapital,
      tradeMode: args.tradeMode,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `批量召开失败 (${res.status})`);
  }
  return res.json();
}

export type SwarmFeedbackDecision = 'accept' | 'reject' | 'modify';

/** POST /api/swarm/runs/:runId/feedback */
export async function submitSwarmFeedback(
  runId: string,
  decision: SwarmFeedbackDecision,
  modifiedPositionPct?: number,
): Promise<void> {
  const body =
    decision === 'modify'
      ? { decision, modifiedPositionPct }
      : { decision };
  const res = await fetch(`${BASE}/swarm/runs/${encodeURIComponent(runId)}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `反馈记录失败 (${res.status})`);
  }
}

// ── 大盘指数 ──────────────────────────────────────────────────

export async function fetchMarketIndices(
  signal?: AbortSignal,
): Promise<import('@trade/shared').MarketIndex[]> {
  const res = await fetch(`${BASE}/market/indices`, { signal });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `获取大盘指数失败 (${res.status})`);
  }
  return res.json();
}

// ── Stock K-line detail (for StockDetailDialog) ──────────────────

export async function fetchKLineDetail(
  code: string,
  period: KlinePeriod = 'daily',
  days: number = 120,
  signal?: AbortSignal,
): Promise<KLine[]> {
  const params = new URLSearchParams({ period, days: String(days) });
  const res = await fetch(`${BASE}/market/kline/${encodeURIComponent(code)}?${params.toString()}`, { signal });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || '获取 K 线失败');
  }
  return res.json();
}
