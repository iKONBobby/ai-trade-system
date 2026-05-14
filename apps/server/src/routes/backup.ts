import { Router, type Request, type Response } from 'express';
import { getPersistence } from '../services/persistence-container.js';
import { BackupValidationError } from '../services/backup/backup-service.js';
import { FavoriteValidationError } from '../services/favorites/favorites-service.js';

export const backupRouter: Router = Router();

/** GET /api/backup/export — returns the full BackupBundle */
backupRouter.get('/export', async (_req: Request, res: Response) => {
  try {
    const bundle = await getPersistence().backup.export();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ai-trade-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(bundle);
  } catch (err) {
    console.error('[BACKUP:EXPORT] error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to export' });
  }
});

/** POST /api/backup/import — body: BackupBundle (destructive: replaces favorites + appends history) */
backupRouter.post('/import', async (req: Request, res: Response) => {
  try {
    const result = await getPersistence().backup.import(req.body);
    console.log(`[BACKUP:IMPORT] history=${result.historyCount} favorites=${result.favoritesCount} version=1`);
    res.json(result);
  } catch (err) {
    if (err instanceof BackupValidationError) {
      res.status(400).json({ error: err.code, message: err.message });
      return;
    }
    if (err instanceof FavoriteValidationError) {
      res.status(400).json({ error: err.code, message: err.message });
      return;
    }
    console.error('[BACKUP:IMPORT] error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to import' });
  }
});
