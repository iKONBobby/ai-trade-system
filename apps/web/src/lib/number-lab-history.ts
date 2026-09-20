import type { LotteryKind } from '@trade/shared';
import { LOTTERY_CONFIGS, type AgentRun, type GenerationMode, type PickReference } from './number-agent';

const STORAGE_KEY = 'ai-trade:number-lab:runs:v1';
const MAX_RUNS = 50;

export type StoredNumberRun = {
  id: string;
  kind: LotteryKind;
  mode: GenerationMode;
  createdAt: string;
  picks: PickReference[];
};

function browserStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function validPick(value: unknown): value is PickReference {
  if (!value || typeof value !== 'object') return false;
  const pick = value as PickReference;
  return Array.isArray(pick.front) && Array.isArray(pick.back)
    && pick.front.every(Number.isInteger) && pick.back.every(Number.isInteger);
}

function validRun(value: unknown): value is StoredNumberRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as StoredNumberRun;
  return typeof run.id === 'string' && (run.kind === 'ssq' || run.kind === 'dlt')
    && (run.mode === 'fair' || run.mode === 'factor') && typeof run.createdAt === 'string'
    && Array.isArray(run.picks) && run.picks.every(validPick);
}

export function loadNumberRuns(storage: Storage | null = browserStorage()): StoredNumberRun[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(validRun).slice(0, MAX_RUNS) : [];
  } catch {
    return [];
  }
}

export function storeNumberRun(run: AgentRun, storage: Storage | null = browserStorage()): StoredNumberRun[] {
  if (!storage) return [];
  const entry: StoredNumberRun = {
    id: `${run.generatedAt}-${run.config.kind}`,
    kind: run.config.kind,
    mode: run.mode,
    createdAt: run.generatedAt,
    picks: run.picks.map(({ front, back }) => ({ front, back })),
  };
  const next = [entry, ...loadNumberRuns(storage)].slice(0, MAX_RUNS);
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearNumberRuns(storage: Storage | null = browserStorage()): void {
  storage?.removeItem(STORAGE_KEY);
}

export function priorPicksForKind(runs: StoredNumberRun[], kind: LotteryKind): PickReference[] {
  return runs.filter((run) => run.kind === kind).flatMap((run) => run.picks).slice(0, 200);
}

export function formatStoredNumberRunForClipboard(run: StoredNumberRun): string {
  const mode = run.mode === 'fair' ? '公平随机' : '因子实验';
  const lines = run.picks.map((pick, index) => {
    const front = pick.front.map((number) => String(number).padStart(2, '0')).join(' ');
    const back = pick.back.map((number) => String(number).padStart(2, '0')).join(' ');
    return `${String(index + 1).padStart(2, '0')}. ${front} + ${back}`;
  });
  return [`${LOTTERY_CONFIGS[run.kind].name}｜${mode}｜${run.picks.length}组`, ...lines].join('\n');
}
