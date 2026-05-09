import type { AnalyzeRequest, AnalyzeResponse, StockSearchItem, MarketData, AnalysisResult, AIAnalysisResult, JobProgress, ScreenerResult, StrategyStats } from '@trade/shared';

const BASE = '/api';

export async function searchStocks(keyword: string): Promise<StockSearchItem[]> {
  const res = await fetch(`${BASE}/stock/search?keyword=${encodeURIComponent(keyword)}`);

  if (!res.ok) {
    throw new Error('搜索失败');
  }

  return res.json();
}

export async function analyzeStock(params: AnalyzeRequest): Promise<AnalyzeResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '请求失败');
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

export async function fetchStrategies(): Promise<{ id: string; name: string; description: string }[]> {
  const res = await fetch(`${BASE}/screener/strategies`);
  if (!res.ok) throw new Error('获取策略列表失败');
  return res.json();
}

export async function runScreener(strategyIds: string[], market?: string): Promise<{ jobIds: string[] }> {
  const res = await fetch(`${BASE}/screener/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategyIds, market }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || '启动扫描失败');
  }
  return res.json();
}

export async function fetchProgress(jobId: string): Promise<JobProgress> {
  const res = await fetch(`${BASE}/screener/progress/${jobId}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || '获取进度失败');
  }
  return res.json();
}

export async function cancelScreenerJob(jobId: string): Promise<void> {
  await fetch(`${BASE}/screener/jobs/${jobId}`, { method: 'DELETE' });
}

// Simple in-memory stats (MVP: tracked client-side)
const statsStore = new Map<string, { scans: number; results: number; lastAt: string }>();

export function getLocalStats(): Map<string, { scans: number; results: number; lastAt: string }> {
  return statsStore;
}

export function recordScan(strategyId: string, resultCount: number): void {
  const existing = statsStore.get(strategyId);
  statsStore.set(strategyId, {
    scans: (existing?.scans ?? 0) + 1,
    results: resultCount,
    lastAt: new Date().toISOString(),
  });
}
