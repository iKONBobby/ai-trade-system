import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HistoryService } from './history/history-service.js';
import { FavoritesService } from './favorites/favorites-service.js';
import { BackupService } from './backup/backup-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');

let cached: {
  history: HistoryService;
  favorites: FavoritesService;
  backup: BackupService;
} | null = null;

export function getPersistence() {
  if (cached) return cached;
  const history = new HistoryService(DATA_DIR);
  const favorites = new FavoritesService(DATA_DIR);
  const backup = new BackupService(history, favorites);
  cached = { history, favorites, backup };
  return cached;
}

export async function initPersistence(): Promise<void> {
  const { history } = getPersistence();
  const removed = await history.sweepOrphans();
  if (removed > 0) {
    console.log(`[PERSISTENCE] sweep removed ${removed} orphan history shard(s)`);
  }
}
