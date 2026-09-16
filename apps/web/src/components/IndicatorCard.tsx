'use client';

import { explanations } from '@/lib/indicatorExplanations';

type SignalColor = 'green' | 'red' | 'yellow' | 'gray';

interface IndicatorCardProps {
  label: string;
  value: string;
  sub?: string;
  explanationKey?: string;
  signal?: string;
  signalColor?: SignalColor;
}

const topBar: Record<SignalColor, string> = {
  red: 'border-t-red-500',
  green: 'border-t-emerald-500',
  yellow: 'border-t-amber-500',
  gray: 'border-t-neutral-600',
};

const signalBg: Record<SignalColor, string> = {
  red: 'bg-red-950/60 text-red-400 border-red-800/50',
  green: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50',
  yellow: 'bg-amber-950/60 text-amber-400 border-amber-800/50',
  gray: 'bg-neutral-900 text-neutral-400 border-neutral-700/50',
};

const signalDot: Record<SignalColor, string> = {
  red: 'bg-red-500',
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  gray: 'bg-neutral-500',
};

export default function IndicatorCard({
  label,
  value,
  sub,
  explanationKey,
  signal,
  signalColor,
}: IndicatorCardProps) {
  const exp = explanationKey ? explanations[explanationKey] : undefined;

  return (
    <div
      className={`relative rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border)] border-t-2 p-4 transition-colors hover:border-[var(--color-border)] hover:bg-[var(--surface-2)] ${
        signalColor ? topBar[signalColor] : 'border-t-transparent'
      }`}
    >
      {/* Label row */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>
          {exp && (
            <div className="group/tip relative">
              <span className="flex h-[18px] w-[18px] cursor-help items-center justify-center rounded-full border border-[var(--color-border)] text-[12px] leading-none text-[var(--color-text-secondary)] transition-colors group-hover/tip:border-[var(--color-accent)] group-hover/tip:text-[var(--color-accent)]">
                ?
              </span>
              {/* Hover Tooltip */}
              <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--surface-1)] p-4 shadow-2xl">
                  <div className="mb-1 text-sm font-semibold text-[var(--color-text-primary)]">
                    {exp.name}
                  </div>
                  <p className="mb-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                    {exp.detail}
                  </p>
                  {exp.signals.length > 0 && (
                    <div className="space-y-1">
                      {exp.signals.map((s) => (
                        <div key={s.label} className="flex items-start gap-2 text-xs">
                          <span
                            className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                              s.color === 'red'
                                ? 'bg-red-500'
                                : s.color === 'green'
                                  ? 'bg-emerald-500'
                                  : s.color === 'yellow'
                                    ? 'bg-amber-500'
                                    : 'bg-neutral-500'
                            }`}
                          />
                          <span>
                            <span className="font-medium text-[var(--color-text-primary)]">
                              {s.label}
                            </span>
                            <span className="text-[var(--color-text-secondary)]">
                              {' '}
                              — {s.meaning}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        {signal && signalColor && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${signalBg[signalColor]}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${signalDot[signalColor]}`} />
            {signal}
          </span>
        )}
      </div>

      {/* Value — the hero */}
      <div className="font-mono text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
        {value}
      </div>

      {/* Sub text */}
      {sub && (
        <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{sub}</div>
      )}
    </div>
  );
}
