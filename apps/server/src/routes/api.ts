import { Router, type Request, type Response } from 'express';
import type { AnalyzeRequest, AnalyzeResponse, StockSearchItem, MarketData, AnalysisResult, KlinePeriod } from '@trade/shared';
import { KLINE_PERIODS, KLINE_MINUTE_PERIODS } from '@trade/shared';
import { fetchRealtime, fetchKLine, searchStocks, UpstreamUnavailableError } from '../services/market.js';
import { analyze } from '../services/analyzer.js';
import { generateSimple, calcLots } from '../services/config-generator.js';
import { aiAnalyze } from '../services/ai-analyzer.js';

export const apiRouter: Router = Router();

/**
 * GET /api/stock/search?keyword=xxx
 * Search stocks by code or name, returns matching suggestions.
 */
apiRouter.get('/stock/search', async (req: Request, res: Response) => {
  try {
    const keyword = (req.query.keyword as string || '').trim();
    if (!keyword || keyword.length < 1) {
      res.json([]);
      return;
    }

    const results = await searchStocks(keyword);
    res.json(results);
  } catch (err: unknown) {
    if (err instanceof UpstreamUnavailableError) {
      console.error('stock search upstream timeout:', err.message);
      res.status(503).json({ error: 'UPSTREAM_UNAVAILABLE', message: '搜索服务暂时连不上' });
      return;
    }
    console.error('stock search error:', err);
    res.status(500).json({ error: 'SEARCH_ERROR', message: 'Search failed' });
  }
});

/**
 * GET /api/market/realtime/:code
 * Fetch realtime market data for a stock code.
 */
apiRouter.get('/market/realtime/:code', async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code);

    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'INVALID_CODE', message: 'Stock code must be 6 digits' });
      return;
    }

    const data = await fetchRealtime(code, { retries: 2, timeoutMs: 8000 });
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'STOCK_NOT_FOUND') {
      res.status(404).json({ error: 'STOCK_NOT_FOUND', message: '股票代码未找到或已退市' });
    } else if (err instanceof UpstreamUnavailableError) {
      console.error('realtime upstream timeout:', err.message);
      res.status(503).json({ error: 'UPSTREAM_UNAVAILABLE', message: '行情服务暂时连不上' });
    } else {
      console.error('realtime error:', err);
      res.status(500).json({ error: 'SERVER_ERROR', message });
    }
  }
});

/**
 * GET /api/market/kline/:code
 * Fetch K-line data for a stock code.
 * Query params: ?days=60
 */
apiRouter.get('/market/kline/:code', async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code);

    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'INVALID_CODE', message: 'Stock code must be 6 digits' });
      return;
    }

    // period query: optional, defaults to 'daily'
    const periodParam = req.query.period as string | undefined;
    const period: KlinePeriod = (periodParam ?? 'daily') as KlinePeriod;
    if (periodParam !== undefined && !KLINE_PERIODS.includes(period)) {
      res.status(400).json({ error: 'INVALID_PERIOD', message: `period must be one of: ${KLINE_PERIODS.join(', ')}` });
      return;
    }

    // days query: strict validation, 1..1000 inclusive
    const daysRaw = req.query.days;
    let days = 60;
    if (daysRaw !== undefined) {
      const parsed = parseInt(daysRaw as string, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 1000) {
        res.status(400).json({ error: 'INVALID_DAYS', message: 'days must be an integer between 1 and 1000' });
        return;
      }
      days = parsed;
    }

    try {
      const data = await fetchKLine(code, days, { retries: 2, timeoutMs: 8000, period });
      res.json(data);
    } catch (err: unknown) {
      // ENG-D1: for minute-level periods, "no klines this period" is normal (weekend/holiday)
      // and must return 200+[] not 404. fetchKLine conflates this with STOCK_NOT_FOUND for
      // historical reasons (existing /analyze depends on it), so we translate here.
      if (err instanceof Error && err.message === 'STOCK_NOT_FOUND' && KLINE_MINUTE_PERIODS.includes(period)) {
        res.json([]);
        return;
      }
      throw err;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'STOCK_NOT_FOUND') {
      res.status(404).json({ error: 'STOCK_NOT_FOUND', message: '股票代码未找到或已退市' });
    } else if (err instanceof UpstreamUnavailableError) {
      console.error('kline upstream timeout:', err.message);
      res.status(503).json({ error: 'UPSTREAM_UNAVAILABLE', message: '行情服务暂时连不上' });
    } else {
      console.error('kline error:', err);
      res.status(500).json({ error: 'SERVER_ERROR', message });
    }
  }
});

/**
 * POST /api/analyze
 * Main analysis endpoint.
 * Body: AnalyzeRequest
 */
apiRouter.post('/analyze', async (req: Request, res: Response) => {
  try {
    const body = req.body as AnalyzeRequest;
    const { stockCode, totalCapital, mode, isT0Mode, useAI } = body;

    // Validate stock code
    if (!stockCode || !/^\d{6}$/.test(stockCode)) {
      res.status(400).json({ error: 'INVALID_CODE', message: 'Stock code must be 6 digits' });
      return;
    }

    // Validate capital
    if (!totalCapital || totalCapital <= 0) {
      res.status(400).json({ error: 'INVALID_CAPITAL', message: 'totalCapital must be positive' });
      return;
    }

    // Fetch market and kline in parallel — retry twice on transient network failures
    const [market, klines] = await Promise.all([
      fetchRealtime(stockCode, { retries: 2, timeoutMs: 8000 }),
      fetchKLine(stockCode, 60, { retries: 2, timeoutMs: 8000 }),
    ]);

    // Run analysis (rule-engine only, always fast)
    const forceMode = mode === 'auto' ? undefined : mode;
    const analysisResult = analyze(market, klines, forceMode);

    // Re-calculate lot sizes based on actual capital
    const lots = calcLots(totalCapital, market.price, isT0Mode);
    if (analysisResult.gridParams) {
      analysisResult.gridParams.lotPerGrid = lots;
    }
    if (analysisResult.conditionParams) {
      analysisResult.conditionParams.buyLot = lots;
      analysisResult.conditionParams.sellLot = lots;
    }

    // Generate config
    const config = generateSimple({
      strategyId: stockCode,
      market,
      analysis: analysisResult,
      totalCapital,
      isT0Mode,
      mode: analysisResult.recommendation,
    });

    const response: AnalyzeResponse = {
      market,
      analysis: analysisResult,
      config,
    };

    res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'STOCK_NOT_FOUND') {
      res.status(404).json({ error: 'STOCK_NOT_FOUND', message: '股票代码未找到或已退市' });
    } else if (err instanceof UpstreamUnavailableError) {
      console.error('analyze upstream timeout:', err.message);
      res.status(503).json({
        error: 'UPSTREAM_UNAVAILABLE',
        message: '行情服务暂时连不上（东方财富 API 超时），请几分钟后重试',
      });
    } else {
      console.error('analyze error:', err);
      res.status(500).json({ error: 'SERVER_ERROR', message });
    }
  }
});

/**
 * POST /api/ai-analyze
 * Unified AI analysis: generates summary + reviews strategy parameters.
 * Body: { market, analysis, totalCapital, isT0Mode, strategyId }
 * Returns: { aiResult, config? }
 */
apiRouter.post('/ai-analyze', async (req: Request, res: Response) => {
  try {
    const { market, analysis: analysisResult, totalCapital, isT0Mode, strategyId } = req.body as {
      market: MarketData;
      analysis: AnalysisResult;
      totalCapital?: number;
      isT0Mode?: boolean;
      strategyId?: string;
    };

    if (!market || !analysisResult) {
      res.status(400).json({ error: 'INVALID_BODY', message: 'market and analysis are required' });
      return;
    }

    const aiResult = await aiAnalyze(market, analysisResult);

    // If AI adjusted params, regenerate the config with AI-adjusted values
    let adjustedConfig: AnalyzeResponse['config'] | undefined;
    if (aiResult?.adjustedAnalysis && totalCapital && strategyId) {
      const adj = aiResult.adjustedAnalysis;
      const lots = calcLots(totalCapital, market.price, isT0Mode ?? false);
      if (adj.gridParams) adj.gridParams.lotPerGrid = lots;
      if (adj.conditionParams) {
        adj.conditionParams.buyLot = lots;
        adj.conditionParams.sellLot = lots;
      }
      adjustedConfig = generateSimple({
        strategyId,
        market,
        analysis: adj,
        totalCapital,
        isT0Mode: isT0Mode ?? false,
        mode: adj.recommendation,
      });
    }

    res.json({ aiResult, config: adjustedConfig });
  } catch (err: unknown) {
    console.error('ai-analyze error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'AI analysis failed' });
  }
});
