'use client';

import type { RealtimeSourcePreference } from '@trade/shared';
import { REALTIME_SOURCE_LABELS } from '@/lib/market-source';

const SOURCES: RealtimeSourcePreference[] = ['auto', 'eastmoney', 'tencent', 'hithink'];

export default function MarketSourceSwitch({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: RealtimeSourcePreference;
  onChange: (value: RealtimeSourcePreference) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="实时行情来源"
      className="inline-flex min-h-11 items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1"
    >
      {!compact && <span className="px-2 text-xs text-[var(--color-text-secondary)]">行情源</span>}
      {SOURCES.map((source) => {
        const selected = value === source;
        return (
          <button
            key={source}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(source)}
            className={`min-h-8 cursor-pointer rounded px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? 'bg-[var(--color-primary)] text-[var(--accent-foreground)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {REALTIME_SOURCE_LABELS[source]}
          </button>
        );
      })}
    </div>
  );
}
