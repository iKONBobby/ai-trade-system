import { Router, type Request, type Response } from 'express';
import type { ScreenerResult } from '@trade/shared';
import { getPersistence } from '../services/persistence-container.js';
import { FavoriteValidationError } from '../services/favorites/favorites-service.js';

export const favoritesRouter: Router = Router();

function handleValidationError(err: unknown, res: Response): boolean {
  if (err instanceof FavoriteValidationError) {
    res.status(400).json({ error: err.code, message: err.message });
    return true;
  }
  return false;
}

/** GET /api/favorites */
favoritesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const list = await getPersistence().favorites.list();
    res.json(list);
  } catch (err) {
    console.error('[FAVORITES:LIST] error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to list favorites' });
  }
});

/** POST /api/favorites — body: { stock, tags?, note? } */
favoritesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as { stock?: ScreenerResult; tags?: string[]; note?: string };
    if (!body.stock || !body.stock.code) {
      res.status(400).json({ error: 'INVALID_STOCK', message: 'stock with code is required' });
      return;
    }
    const list = await getPersistence().favorites.add({
      stock: body.stock,
      tags: body.tags,
      note: body.note,
    });
    res.json(list);
  } catch (err) {
    if (handleValidationError(err, res)) return;
    console.error('[FAVORITES:ADD] error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to add favorite' });
  }
});

/** PATCH /api/favorites/:code — body: { tags?, note? } */
favoritesRouter.patch('/:code', async (req: Request, res: Response) => {
  try {
    const body = req.body as { tags?: string[]; note?: string };
    const updated = await getPersistence().favorites.update(String(req.params.code), {
      tags: body.tags,
      note: body.note,
    });
    if (!updated) {
      res.status(404).json({ error: 'FAVORITE_NOT_FOUND', message: 'Code not in favorites' });
      return;
    }
    res.json(updated);
  } catch (err) {
    if (handleValidationError(err, res)) return;
    console.error('[FAVORITES:UPDATE] error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update favorite' });
  }
});

/** DELETE /api/favorites/:code */
favoritesRouter.delete('/:code', async (req: Request, res: Response) => {
  try {
    const ok = await getPersistence().favorites.remove(String(req.params.code));
    if (!ok) {
      res.status(404).json({ error: 'FAVORITE_NOT_FOUND', message: 'Code not in favorites' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[FAVORITES:DELETE] error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to remove favorite' });
  }
});

/** POST /api/favorites/bulk-import — body: ScreenerResult[] */
favoritesRouter.post('/bulk-import', async (req: Request, res: Response) => {
  try {
    if (!Array.isArray(req.body)) {
      res.status(400).json({ error: 'INVALID_BODY', message: 'body must be an array of stocks' });
      return;
    }
    const stocks = req.body as ScreenerResult[];
    const result = await getPersistence().favorites.bulkImport(stocks);
    res.json(result);
  } catch (err) {
    console.error('[FAVORITES:BULK_IMPORT] error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to bulk import' });
  }
});
