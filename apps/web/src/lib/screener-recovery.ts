// Keep enough client-side metadata to reconnect to an in-flight screener job
// after the route unmounts. The actual job and results remain server-owned.

import type { RealtimeSourcePreference } from '@trade/shared';

const KEY = 'screener:active-session';
const TTL_MS = 10 * 60_000;

export interface SavedScreenerSession {
  jobIds: string[];
  selectedIds: string[];
  market: string;
  includeGEM: boolean;
  includeSTAR: boolean;
  useAIReview: boolean;
  realtimeSource?: RealtimeSourcePreference;
  activeTab: string;
  progress: Record<string, { scanned: number; total: number; failed?: number }>;
  savedAt: number;
}

export function saveScreenerSession(
  session: Omit<SavedScreenerSession, 'savedAt'>,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...session, savedAt: Date.now() }));
  } catch {
    // Storage can be unavailable in private mode. Polling still works while mounted.
  }
}

export function loadScreenerSession(): SavedScreenerSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedScreenerSession>;
    const validProgress =
      parsed.progress !== null &&
      typeof parsed.progress === 'object' &&
      !Array.isArray(parsed.progress);
    if (
      !Array.isArray(parsed.jobIds) ||
      parsed.jobIds.length === 0 ||
      !parsed.jobIds.every((id) => typeof id === 'string') ||
      !Array.isArray(parsed.selectedIds) ||
      !parsed.selectedIds.every((id) => typeof id === 'string') ||
      typeof parsed.market !== 'string' ||
      typeof parsed.includeGEM !== 'boolean' ||
      typeof parsed.includeSTAR !== 'boolean' ||
      typeof parsed.useAIReview !== 'boolean' ||
      typeof parsed.activeTab !== 'string' ||
      !validProgress ||
      typeof parsed.savedAt !== 'number'
    ) {
      clearScreenerSession();
      return null;
    }
    if (Date.now() - parsed.savedAt >= TTL_MS) {
      clearScreenerSession();
      return null;
    }
    return parsed as SavedScreenerSession;
  } catch {
    clearScreenerSession();
    return null;
  }
}

export function clearScreenerSession(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore storage failures; there is no recovery action left to take.
  }
}
