'use client';

import type { IcebreakerConfig } from '@trade/shared';

interface ConfigPreviewProps {
  config: IcebreakerConfig;
  mode: 'grid' | 'condition';
}

export default function ConfigPreview({ config, mode }: ConfigPreviewProps) {
  return (
    <details
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--r-lg)',
        marginTop: 'var(--sp-5)',
      }}
    >
      <summary
        style={{
          padding: 'var(--sp-4) var(--sp-5)',
          cursor: 'pointer',
          listStyle: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          <span style={{ fontSize: 'var(--text-h3)', fontWeight: 600 }}>策略配置预览</span>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-3)',
              marginLeft: 'var(--sp-2)',
            }}
          >
            {config.lines.length} 行 · {mode === 'grid' ? 'grid_v1' : 'condition_v1'}
          </span>
        </span>
        <svg
          width={16}
          height={16}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          style={{ color: 'var(--text-3)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div style={{ padding: '0 var(--sp-5) var(--sp-5)' }}>
        <pre
          className="mono"
          style={{
            fontSize: 'var(--text-xs)',
            background: 'var(--surface-base)',
            color: 'var(--text-2)',
            padding: 'var(--sp-3) var(--sp-4)',
            borderRadius: 'var(--r-md)',
            overflowX: 'auto',
            lineHeight: 1.6,
            border: '1px solid var(--border-1)',
            margin: 0,
          }}
        >
          {config.lines.join('\n')}
        </pre>
      </div>
    </details>
  );
}
