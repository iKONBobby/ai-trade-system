'use client';

import { useState } from 'react';
import type { IcebreakerConfig } from '@trade/shared';

interface ConfigPreviewProps {
  config: IcebreakerConfig;
}

export default function ConfigPreview({ config }: ConfigPreviewProps) {
  const [compact, setCompact] = useState(true);

  const handleDownload = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const filename = `ibt-${dateStr}-12-0.txt`;

    const blob = new Blob([config.lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayLines = compact && config.lines.length > 6 ? config.lines.slice(0, 6) : config.lines;

  return (
    <div className="space-y-4 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5">
      {/* Summary */}
      <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{config.summary}</p>

      {/* Code Block */}
      <div className="overflow-hidden rounded-lg bg-black border border-[var(--color-border)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
          <span className="text-xs text-[var(--color-text-secondary)]">配置文件</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCompact(!compact)}
              className="rounded px-2 py-0.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              {compact ? '展开' : '收起'}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-black transition-opacity hover:opacity-90"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              下载
            </button>
          </div>
        </div>
        <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
          <code className="font-mono text-[var(--color-accent)]">
            {displayLines.map((line, i) => (
              <span key={i}>
                {line}
                {'\n'}
              </span>
            ))}
            {compact && config.lines.length > 6 && (
              <span className="text-[var(--color-text-secondary)]">... 共 {config.lines.length} 行</span>
            )}
          </code>
        </pre>
      </div>
    </div>
  );
}
