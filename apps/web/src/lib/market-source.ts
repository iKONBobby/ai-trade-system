import type { RealtimeSourcePreference } from '@trade/shared';

const KEY = 'market:realtime-source';
const VALID: RealtimeSourcePreference[] = ['auto', 'eastmoney', 'tencent', 'hithink'];

export function readRealtimeSource(): RealtimeSourcePreference {
  if (typeof localStorage === 'undefined') return 'auto';
  try {
    const value = localStorage.getItem(KEY) as RealtimeSourcePreference | null;
    return value && VALID.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveRealtimeSource(value: RealtimeSourcePreference): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Private browsing can disable storage; current component state still works.
  }
}

export const REALTIME_SOURCE_LABELS: Record<RealtimeSourcePreference, string> = {
  auto: '自动',
  eastmoney: '东方财富',
  tencent: '腾讯财经',
  hithink: '同花顺',
};
