'use client';

import type { MarketData, AnalysisResult } from '@trade/shared';

interface StockHeaderProps {
  market: MarketData;
  analysis: AnalysisResult;
}

function marketTag(code: string): 'SH' | 'SZ' {
  return code.startsWith('6') || code.startsWith('5') || code.startsWith('9') ? 'SH' : 'SZ';
}

function marketStateInfo(state: AnalysisResult['marketState']) {
  if (state === 'trending_up') return { label: '上涨趋势', cls: 'up' as const };
  if (state === 'trending_down') return { label: '下跌趋势', cls: 'down' as const };
  return { label: '震荡行情', cls: 'ranging' as const };
}

export default function StockHeader({ market, analysis }: StockHeaderProps) {
  const up = market.change >= 0;
  const changeAbs = (market.price * market.change) / 100;
  const state = marketStateInfo(analysis.marketState);
  const conf = Math.round(analysis.confidence);
  const confDots = Math.max(0, Math.min(5, Math.round(conf / 20)));

  const stateBg =
    state.cls === 'up' ? 'var(--up-bg)' : state.cls === 'down' ? 'var(--down-bg)' : 'var(--warning-bg)';
  const stateColor =
    state.cls === 'up' ? 'var(--up)' : state.cls === 'down' ? 'var(--down)' : 'var(--warning)';

  return (
    <div
      className="trade-stock-card"
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-4)',
        marginBottom: 'var(--sp-4)',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 'var(--sp-5)',
        alignItems: 'flex-start',
      }}
    >
      <div>
        <div>
          <h2 style={{ fontSize: 'var(--text-h2)', fontWeight: 700, letterSpacing: '-0.01em' }}>
            {market.name}
            <span
              className="num"
              style={{
                marginLeft: 'var(--sp-2)',
                padding: '2px 6px',
                background: 'var(--surface-3)',
                color: 'var(--text-2)',
                borderRadius: 'var(--r-sm)',
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
              }}
            >
              {marketTag(market.code)}
            </span>
          </h2>
          <div
            className="num"
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-3)',
              marginTop: 2,
            }}
          >
            {market.code}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 'var(--sp-3)',
            marginTop: 'var(--sp-3)',
          }}
        >
          <span
            className="num"
            style={{
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: up ? 'var(--up)' : 'var(--down)',
            }}
          >
            {market.price.toFixed(2)}
          </span>
          <span
            className="num"
            style={{
              fontSize: 'var(--text-h3)',
              fontWeight: 600,
              padding: '3px var(--sp-2)',
              borderRadius: 'var(--r-sm)',
              color: up ? 'var(--up)' : 'var(--down)',
              background: up ? 'var(--up-bg)' : 'var(--down-bg)',
            }}
          >
            {up ? '+' : '−'}
            {Math.abs(market.change).toFixed(2)}%
          </span>
          <span
            className="num"
            style={{
              fontSize: 'var(--text-body)',
              color: up ? 'var(--up)' : 'var(--down)',
            }}
          >
            {up ? '+' : '−'}
            {Math.abs(changeAbs).toFixed(2)}
          </span>
        </div>

        <div
          style={{
            marginTop: 'var(--sp-4)',
            paddingTop: 'var(--sp-4)',
            borderTop: '1px solid var(--border-1)',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 'var(--sp-4)',
          }}
        >
          <QuickStat label="今开" value={market.open.toFixed(2)} />
          <QuickStat label="最高" value={market.high.toFixed(2)} />
          <QuickStat label="最低" value={market.low.toFixed(2)} />
          <QuickStat label="换手" value={market.turnoverAvailable === false ? '—' : `${market.turnover.toFixed(2)}%`} />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 'var(--sp-3)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--sp-2)',
            padding: '6px var(--sp-3)',
            borderRadius: 'var(--r-pill)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            background: stateBg,
            color: stateColor,
          }}
        >
          <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M3 12h4l3-9 4 18 3-9h4" />
          </svg>
          {state.label}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--sp-2)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-3)',
          }}
        >
          置信度
          <span style={{ display: 'inline-flex', gap: 2 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                style={{
                  width: 12,
                  height: 3,
                  borderRadius: 'var(--r-pill)',
                  background: i < confDots ? 'var(--accent)' : 'var(--surface-3)',
                }}
              />
            ))}
          </span>
          <span className="num" style={{ color: 'var(--text-1)', fontWeight: 600 }}>
            {conf}%
          </span>
        </span>
      </div>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: 'var(--text-xs)' }}>
      <div
        style={{
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontSize: 10,
        }}
      >
        {label}
      </div>
      <div
        className="num"
        style={{
          color: 'var(--text-1)',
          fontSize: 'var(--text-body)',
          fontWeight: 600,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}
