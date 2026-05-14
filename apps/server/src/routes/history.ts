import { Router, type Request, type Response } from 'express';
import type { HistoryRange } from '@trade/shared';
import { getPersistence } from '../services/persistence-container.js';

export const historyRouter: Router = Router();

const ALLOWED_RANGES: HistoryRange[] = ['today', '7d', '30d', 'all'];

/** GET /api/history?range=today|7d|30d|all */
historyRouter.get('/', async (req: Request, res: Response) => {
  try {
    const rangeParam = String(req.query.range ?? 'all');
    if (!ALLOWED_RANGES.includes(rangeParam as HistoryRange)) {
      res.status(400).json({ error: 'INVALID_RANGE', message: `range must be one of: ${ALLOWED_RANGES.join(', ')}` });
      return;
    }
    const groups = await getPersistence().history.list(rangeParam as HistoryRange);
    res.json(groups);
  } catch (err: unknown) {
    console.error('[HISTORY:LIST] error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to list history' });
  }
});

/** GET /api/history/diff?from=ID&to=ID&strategyId=X */
historyRouter.get('/diff', async (req: Request, res: Response) => {
  try {
    const from = String(req.query.from ?? '');
    const to = String(req.query.to ?? '');
    const strategyId = String(req.query.strategyId ?? '');
    if (!from || !to || !strategyId) {
      res.status(400).json({ error: 'MISSING_PARAMS', message: 'from, to, strategyId are required' });
      return;
    }
    const diff = await getPersistence().history.diff(from, to, strategyId);
    if (!diff) {
      res.status(404).json({ error: 'SNAPSHOT_NOT_FOUND', message: 'One or both snapshots missing' });
      return;
    }
    res.json(diff);
  } catch (err: unknown) {
    console.error('[HISTORY:DIFF] error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to compute diff' });
  }
});

/** GET /api/history/:id */
historyRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const snap = await getPersistence().history.get(String(req.params.id));
    if (!snap) {
      res.status(404).json({ error: 'SNAPSHOT_NOT_FOUND', message: 'Snapshot not found' });
      return;
    }
    res.json(snap);
  } catch (err: unknown) {
    console.error('[HISTORY:GET] error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to get snapshot' });
  }
});
