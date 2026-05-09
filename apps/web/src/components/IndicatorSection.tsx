'use client';

import { useState } from 'react';

interface IndicatorSectionProps {
  title: string;
  icon: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export default function IndicatorSection({
  title,
  icon,
  defaultExpanded = false,
  children,
}: IndicatorSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-[var(--color-bg-card-hover)]"
      >
        <span className="flex items-center gap-2.5 font-semibold text-[var(--color-text-primary)]">
          <span className="text-lg">{icon}</span>
          <span className="text-base">{title}</span>
          {!expanded && (
            <span className="text-xs font-normal text-[var(--color-text-secondary)]">
              {getCountHint(children)}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {!expanded && (
            <span className="text-xs text-[var(--color-text-secondary)]">展开</span>
          )}
          <svg
            className={`h-5 w-5 text-[var(--color-text-secondary)] transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Content — overflow-visible when expanded so tooltips escape */}
      <div
        className={`transition-all duration-200 ${
          expanded
            ? 'max-h-[2000px] opacity-100 overflow-visible'
            : 'max-h-0 opacity-0 pointer-events-none overflow-hidden'
        }`}
      >
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}

function getCountHint(children: React.ReactNode): string {
  const arr = Array.isArray(children) ? children : [children];
  const count = arr.flat().filter(Boolean).length;
  return `${count} 个指标`;
}
