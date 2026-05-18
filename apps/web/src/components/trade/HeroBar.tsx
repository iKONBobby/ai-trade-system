'use client';

import { useEffect, useState } from 'react';
import type { MarketIndex } from '@trade/shared';

interface HeroBarProps {
  indices?: MarketIndex[];
  favorited?: boolean;
  onToggleFavorite?: () => void;
  onRefresh?: () => void;
  onSettings?: () => void;
}

// 未拉到数据时的占位骨架 (label 固定, 数值显示 "—", 不显示假数字).
const PLACEHOLDER_INDICES: MarketIndex[] = [
  { label: '上证指数', value: 0, changePct: 0 },
  { label: '深证成指', value: 0, changePct: 0 },
  { label: '创业板指', value: 0, changePct: 0 },
];

export default function HeroBar({
  indices = PLACEHOLDER_INDICES,
  favorited = false,
  onToggleFavorite,
  onRefresh,
  onSettings,
}: HeroBarProps) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      setTime(`${hh}:${mm}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      className="trade-hero"
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 'var(--sp-6)',
        marginBottom: 'var(--sp-5)',
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 'var(--text-h1)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            marginBottom: 'var(--sp-1)',
          }}
        >
          智能交易
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: 'var(--text-body)' }}>
          输入股票代码，AI 实时分析行情，生成最优交易策略配置
        </p>
      </div>

      <div className="trade-hero-actions" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
        <div
          className="trade-market-indices"
          style={{
            display: 'flex',
            gap: 'var(--sp-4)',
            paddingRight: 'var(--sp-4)',
            borderRight: '1px solid var(--border-1)',
          }}
        >
          {indices.map((idx) => (
            <div
              key={idx.label}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 84 }}
            >
              <span
                style={{
                  fontSize: 'var(--text-tiny)',
                  color: 'var(--text-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {idx.label}
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)' }}>
                {idx.value > 0 ? (
                  <>
                    <span
                      className="num"
                      style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text-1)' }}
                    >
                      {idx.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span
                      className="num"
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        color: idx.changePct >= 0 ? 'var(--up)' : 'var(--down)',
                      }}
                    >
                      {idx.changePct >= 0 ? '+' : '−'}
                      {Math.abs(idx.changePct).toFixed(2)}%
                    </span>
                  </>
                ) : (
                  <span
                    className="num"
                    style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text-3)' }}
                  >
                    —
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div
          className="trade-hero-meta"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, paddingRight: 'var(--sp-3)' }}
        >
          <span
            style={{
              fontSize: 'var(--text-tiny)',
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            数据时间
          </span>
          <span
            className="mono"
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-2)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--success)',
                boxShadow: '0 0 8px var(--success)',
                animation: 'trade-pulse 2s ease-in-out infinite',
              }}
            />
            {time || '—'}
          </span>
        </div>

        <IconButton
          active={favorited}
          onClick={onToggleFavorite}
          ariaLabel={favorited ? '取消收藏' : '收藏当前股票'}
        >
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
        </IconButton>
        <IconButton onClick={onRefresh} ariaLabel="刷新数据">
          <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </IconButton>
        <IconButton onClick={onSettings} ariaLabel="设置">
          <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </IconButton>
      </div>

      <style jsx>{`
        @keyframes trade-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @media (max-width: 900px) {
          .trade-market-indices > div:last-child,
          .trade-hero-meta { display: none; }
        }
        @media (max-width: 768px) {
          .trade-hero { flex-direction: column; align-items: stretch; }
          .trade-hero-actions { flex-wrap: wrap; gap: var(--sp-3); }
          .trade-market-indices {
            padding-right: 0;
            border-right: 0;
            padding-bottom: var(--sp-3);
            border-bottom: 1px solid var(--border-1);
            width: 100%;
            justify-content: space-between;
          }
        }
      `}</style>
    </header>
  );
}

function IconButton({
  children,
  active,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      style={{
        width: 36,
        height: 36,
        borderRadius: 'var(--r-md)',
        background: active ? 'var(--accent-bg)' : 'var(--surface-1)',
        border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border-1)'}`,
        color: active ? 'var(--accent)' : 'var(--text-2)',
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center',
        transition: `all var(--motion-1) var(--ease)`,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--surface-2)';
          e.currentTarget.style.color = 'var(--text-1)';
          e.currentTarget.style.borderColor = 'var(--border-2)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--surface-1)';
          e.currentTarget.style.color = 'var(--text-2)';
          e.currentTarget.style.borderColor = 'var(--border-1)';
        }
      }}
    >
      <span style={{ display: 'grid', placeItems: 'center', width: 16, height: 16 }}>
        {children}
      </span>
    </button>
  );
}
