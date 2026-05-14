import { Router, type Request, type Response } from 'express';
import type { ScreenerRunRequest } from '@trade/shared';
import { listStrategies } from '../services/screener/strategies.js';
import { runScreener, getJob, cancelJob, refreshStockList, getStockList } from '../services/screener/engine.js';
import { toJobProgress } from '../services/screener/types.js';

export const screenerRouter: Router = Router();

/** POST /api/screener/refresh-stocks — manually re-pull the stock list from EastMoney. */
screenerRouter.post('/refresh-stocks', async (_req: Request, res: Response) => {
  try {
    const result = await refreshStockList();
    res.json(result);
  } catch (err: unknown) {
    console.error('refresh-stocks error:', err);
    res.status(500).json({ ok: false, count: getStockList().length, message: 'unexpected error' });
  }
});

/** GET /api/screener/stock-count — diagnostic: current cache size. */
screenerRouter.get('/stock-count', (_req: Request, res: Response) => {
  res.json({ count: getStockList().length });
});

/** GET /api/screener/strategies — list all available strategies */
screenerRouter.get('/strategies', (_req: Request, res: Response) => {
  try {
    const strategies = listStrategies();
    res.json(strategies);
  } catch (err: unknown) {
    console.error('screener strategies error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to list strategies' });
  }
});

/** POST /api/screener/run — start a screening job */
screenerRouter.post('/run', async (req: Request, res: Response) => {
  try {
    const { strategyIds, market, includeGEM, includeSTAR } = req.body as ScreenerRunRequest;

    if (!strategyIds || !Array.isArray(strategyIds) || strategyIds.length === 0) {
      res.status(400).json({ error: 'INVALID_STRATEGY', message: 'strategyIds must be a non-empty array' });
      return;
    }

    if (strategyIds.length > 3) {
      res.status(400).json({ error: 'TOO_MANY_STRATEGIES', message: 'Maximum 3 strategies at once' });
      return;
    }

    const allowedMarkets = ['all', 'sh', 'sz', 'hs300'];
    if (market && !allowedMarkets.includes(market)) {
      res.status(400).json({ error: 'INVALID_MARKET', message: `market must be one of: ${allowedMarkets.join(', ')}` });
      return;
    }

    const jobIds = await runScreener(strategyIds, market ?? 'all', {
      includeGEM: includeGEM === true,
      includeSTAR: includeSTAR === true,
    });
    res.json({ jobIds });
  } catch (err: unknown) {
    console.error('screener run error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to start screening' });
  }
});

/** GET /api/screener/progress/:jobId — poll job progress */
screenerRouter.get('/progress/:jobId', (req: Request, res: Response) => {
  try {
    const job = getJob(String(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: 'JOB_NOT_FOUND', message: 'Job not found or expired' });
      return;
    }

    res.json(toJobProgress(job));
  } catch (err: unknown) {
    console.error('screener progress error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to get progress' });
  }
});

/** DELETE /api/screener/jobs/:jobId — cancel a running job */
screenerRouter.delete('/jobs/:jobId', (req: Request, res: Response) => {
  try {
    const success = cancelJob(String(req.params.jobId));
    if (!success) {
      res.status(404).json({ error: 'JOB_NOT_FOUND', message: 'Job not found or already completed' });
      return;
    }
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error('screener cancel error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to cancel job' });
  }
});
