import { Router, type Request, type Response } from 'express';
import type { AnalyzeRequest, AnalyzeResponse, StockSearchItem, MarketData, AnalysisResult } from '@trade/shared';
import { fetchRealtime, fetchKLine, searchStocks } from '../services/market.js';
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

    const data = await fetchRealtime(code);
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'STOCK_NOT_FOUND') {
      res.status(404).json({ error: 'STOCK_NOT_FOUND', message: 'Stock not found or delisted' });
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

    const days = Math.min(365, Math.max(1, parseInt(req.query.days as string, 10) || 60));
    const data = await fetchKLine(code, days);
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'STOCK_NOT_FOUND') {
      res.status(404).json({ error: 'STOCK_NOT_FOUND', message: 'Stock not found or delisted' });
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

    // Fetch market and kline in parallel
    const [market, klines] = await Promise.all([
      fetchRealtime(stockCode),
      fetchKLine(stockCode),
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
      res.status(404).json({ error: 'STOCK_NOT_FOUND', message: 'Stock not found or delisted' });
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
