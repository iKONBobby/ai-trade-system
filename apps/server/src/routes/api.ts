import { Router, type Request, type Response } from 'express';
import type { AnalyzeRequest, AnalyzeResponse } from '@trade/shared';
import { fetchRealtime, fetchKLine } from '../services/market.js';
import { analyze } from '../services/analyzer.js';
import { generateSimple, calcLots } from '../services/config-generator.js';
import { optimize } from '../services/ai-optimizer.js';

export const apiRouter = Router();

/**
 * GET /api/market/realtime/:code
 * Fetch realtime market data for a stock code.
 */
apiRouter.get('/market/realtime/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;

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
    const { code } = req.params;

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

    // Run analysis
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

    // Optional AI optimization
    const finalAnalysis = useAI
      ? await optimize(market, analysisResult)
      : analysisResult;

    // Generate config
    const finalMode = finalAnalysis.recommendation;
    const config = generateSimple({
      strategyId: stockCode,
      market,
      analysis: finalAnalysis,
      totalCapital,
      isT0Mode,
      mode: finalMode,
    });

    const response: AnalyzeResponse = {
      market,
      analysis: finalAnalysis,
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
