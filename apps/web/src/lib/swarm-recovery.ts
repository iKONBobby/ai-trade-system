// C8: last-run recovery — localStorage 持久化 swarm 上次辩论的 runId / streamUrl.
//
// TTL 5 分钟 (与 server 端 RunRegistry done/aborted 后 5min evict 对齐).
// 超过 TTL 的记录 server 已清, recovery 必然 404; 主动 clear 避免显示 stale banner.

const KEY = 'swarm:last-run';
const TTL_MS = 5 * 60_000;

export interface SavedRun {
  runId: string;
  streamUrl: string;
  stockCode: string;
  savedAt: number;
}

export function saveLastRun(info: Omit<SavedRun, 'savedAt'>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...info, savedAt: Date.now() } satisfies SavedRun),
    );
  } catch {
    // ignore quota / private mode failures
  }
}

export function loadLastRun(): SavedRun | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedRun>;
    if (
      typeof parsed.runId !== 'string' ||
      typeof parsed.streamUrl !== 'string' ||
      typeof parsed.stockCode !== 'string' ||
      typeof parsed.savedAt !== 'number'
    ) {
      localStorage.removeItem(KEY);
      return null;
    }
    if (Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed as SavedRun;
  } catch {
    return null;
  }
}

export function clearLastRun(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function formatAge(savedAt: number, nowMs: number = Date.now()): string {
  const seconds = Math.round((nowMs - savedAt) / 1000);
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分钟前`;
}
