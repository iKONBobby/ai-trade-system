import type { KlinePeriod } from '@trade/shared';
import type { SecondaryIndicator } from '@/components/analysis/TechnicalChart';

const STORAGE_VERSION = 1;

export type DrawingKind = 'support' | 'resistance' | 'note';

export interface DrawingLevel {
  id: string;
  price: number;
  label: string;
  kind: DrawingKind;
}

export type AlertMetric = 'price' | 'rsi' | 'volumeRatio' | 'macdHistogram';
export type AlertOperator = 'gt' | 'lt';

export interface AlertCondition {
  id: string;
  metric: AlertMetric;
  operator: AlertOperator;
  value: number;
}

export interface CompositeAlert {
  id: string;
  code: string;
  period: KlinePeriod;
  name: string;
  conditions: AlertCondition[];
  enabled: boolean;
  createdAt: string;
}

export interface AnalysisTemplate {
  id: string;
  name: string;
  period: KlinePeriod;
  secondary: SecondaryIndicator;
  showBenchmark: boolean;
  levels: DrawingLevel[];
  createdAt: string;
}

interface Envelope<T> { version: number; value: T; }

export function loadNote(code: string): string {
  return load<string>(`analysis:note:${code}`, '');
}

export function saveNote(code: string, note: string): void {
  save(`analysis:note:${code}`, note);
}

export function loadLevels(code: string): DrawingLevel[] {
  return load<DrawingLevel[]>(`analysis:levels:${code}`, []).filter(validLevel);
}

export function saveLevels(code: string, levels: DrawingLevel[]): void {
  save(`analysis:levels:${code}`, levels.filter(validLevel));
}

export function loadTemplates(): AnalysisTemplate[] {
  return load<AnalysisTemplate[]>('analysis:templates', []).filter((item) =>
    Boolean(item?.id && item.name && item.period && item.secondary && Array.isArray(item.levels)),
  );
}

export function saveTemplates(templates: AnalysisTemplate[]): void {
  save('analysis:templates', templates);
}

export function loadAlerts(): CompositeAlert[] {
  return load<CompositeAlert[]>('analysis:alerts', []).filter((item) =>
    Boolean(item?.id && item.code && item.period && Array.isArray(item.conditions) && item.conditions.length > 0),
  );
}

export function saveAlerts(alerts: CompositeAlert[]): void {
  save('analysis:alerts', alerts);
}

export function evaluateCondition(condition: AlertCondition, values: Partial<Record<AlertMetric, number | null>>): boolean {
  const current = values[condition.metric];
  if (current == null || !Number.isFinite(current)) return false;
  return condition.operator === 'gt' ? current > condition.value : current < condition.value;
}

export function evaluateAlert(alert: CompositeAlert, values: Partial<Record<AlertMetric, number | null>>): boolean {
  return alert.enabled && alert.conditions.every((condition) => evaluateCondition(condition, values));
}

function validLevel(item: DrawingLevel): boolean {
  return Boolean(item?.id && item.label && Number.isFinite(item.price) && item.price > 0 && ['support', 'resistance', 'note'].includes(item.kind));
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Envelope<T>;
    return parsed.version === STORAGE_VERSION ? parsed.value : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ version: STORAGE_VERSION, value } satisfies Envelope<T>));
  } catch {
    // Private browsing and storage quota failures must not break analysis.
  }
}
