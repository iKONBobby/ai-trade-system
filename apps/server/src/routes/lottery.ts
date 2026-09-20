import { Router, type Request, type Response } from 'express';
import type { LotteryKind } from '@trade/shared';
import { getLotteryHistory } from '../services/lottery-history.js';

export const lotteryRouter: Router = Router();

/** GET /api/lottery/history?kind=ssq|dlt&limit=100&refresh=1 */
lotteryRouter.get('/history', async (req: Request, res: Response) => {
  const kind = String(req.query.kind ?? '') as LotteryKind;
  if (kind !== 'ssq' && kind !== 'dlt') {
    res.status(400).json({ error: 'INVALID_KIND', message: 'kind must be ssq or dlt' });
    return;
  }

  const rawLimit = String(req.query.limit ?? '100');
  const limit = Number(rawLimit);
  if (!/^\d+$/.test(rawLimit) || !Number.isInteger(limit) || limit < 10 || limit > 200) {
    res.status(400).json({ error: 'INVALID_LIMIT', message: 'limit must be an integer between 10 and 200' });
    return;
  }

  try {
    const history = await getLotteryHistory(kind, limit, req.query.refresh === '1');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json(history);
  } catch (error) {
    console.error('[LOTTERY:HISTORY] error:', error);
    res.status(503).json({
      error: 'LOTTERY_HISTORY_UNAVAILABLE',
      message: '历史开奖数据源暂时不可用，请稍后重试。公平随机模式仍可正常使用。',
    });
  }
});
