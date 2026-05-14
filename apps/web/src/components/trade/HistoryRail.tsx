'use client';

import type { AnalyzeResponse } from '@trade/shared';

export interface HistoryItem {
  name: string;
  code: string;
  price: number;
  change: number;
  data: AnalyzeResponse;
}

interface HistoryRailProps {
  items: HistoryItem[];
  activeCode?: string;
  onSelect: (item: HistoryItem) => void;
}

function marketTag(code: string): 'SH' | 'SZ' {
  return code.startsWith('6') || code.startsWith('5') || code.startsWith('9') ? 'SH' : 'SZ';
}

export default function HistoryRail({ items, activeCode, onSelect }: HistoryRailProps) {
  return (
    <aside
      className="trade-history-rail"
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-4)',
        position: 'sticky',
        top: 'var(--sp-4)',
        alignSelf: 'flex-start',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 'var(--sp-3)',
        }}
      >
        <span style={{ fontSize: 'var(--text-h3)', fontWeight: 600 }}>最近分析</span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            padding: 'var(--sp-4) 0',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-3)',
            textAlign: 'center',
          }}
        >
          还没分析过股票
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((item) => {
            const isActive = item.code === activeCode;
            const up = item.change >= 0;
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => onSelect(item)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 'var(--sp-2)',
                  padding: 'var(--sp-2) var(--sp-3)',
                  background: isActive ? 'var(--accent-bg)' : 'var(--surface-2)',
                  border: `1px solid ${isActive ? 'var(--accent-border)' : 'var(--border-1)'}`,
                  borderRadius: 'var(--r-md)',
                  cursor: 'pointer',
                  transition: `all var(--motion-1) var(--ease)`,
                  alignItems: 'center',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  color: 'var(--text-1)',
                  boxShadow: isActive ? 'inset 2px 0 0 var(--accent)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--surface-hover)';
                    e.currentTarget.style.borderColor = 'var(--border-2)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--surface-2)';
                    e.currentTarget.style.borderColor = 'var(--border-1)';
                  }
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.name}
                  </div>
                  <span
                    className="num"
                    style={{
                      fontSize: 10,
                      color: 'var(--text-3)',
                      display: 'block',
                      marginTop: 1,
                    }}
                  >
                    {item.code} · {marketTag(item.code)}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    className="num"
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      color: up ? 'var(--up)' : 'var(--down)',
                    }}
                  >
                    {up ? '+' : '−'}
                    {Math.abs(item.change).toFixed(2)}%
                  </div>
                  <span
                    className="num"
                    style={{ fontSize: 10, color: 'var(--text-3)', display: 'block', marginTop: 1 }}
                  >
                    {item.price.toFixed(2)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
