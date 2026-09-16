'use client';

import type { AnalysisResult, IcebreakerConfig } from '@trade/shared';

interface RecoPanelProps {
  analysis: AnalysisResult;
  config: IcebreakerConfig;
  stockCode: string;
}

function copyToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {
      /* user can manually copy */
    });
  }
}

function downloadTxt(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RecoPanel({ analysis, config, stockCode }: RecoPanelProps) {
  const isGrid = analysis.recommendation === 'grid';
  const title = isGrid ? '网格交易' : '条件单';

  const subtitle = isGrid
    ? analysis.gridParams
      ? `震荡区间 ${analysis.bollinger.lower.toFixed(2)} ~ ${analysis.bollinger.upper.toFixed(2)}，建议铺 ${analysis.gridParams.gridCount} 格`
      : ''
    : analysis.conditionParams
      ? `买入触发 ${analysis.conditionParams.buyTriggerPrice.toFixed(2)} · 卖出触发 ${analysis.conditionParams.sellTriggerPrice.toFixed(2)}`
      : '';

  const today = new Date();
  const ds = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const filename = `ibt-${stockCode}-${ds}.txt`;

  return (
    <div
      style={{
        background: 'var(--accent-bg)',
        border: '1px solid var(--accent-border)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-5)',
        marginTop: 'var(--sp-5)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--sp-4)',
          marginBottom: 'var(--sp-4)',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-2)',
              color: 'var(--accent)',
              fontSize: 'var(--text-xs)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 4,
            }}
          >
            <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            推荐策略
          </div>
          <div style={{ fontSize: 'var(--text-h2)', fontWeight: 700 }}>{title}</div>
          {subtitle && (
            <div style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
              {subtitle}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <SecondaryBtn onClick={() => copyToClipboard(config.lines.join('\n'))}>
            <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
              />
            </svg>
            复制配置
          </SecondaryBtn>
          <PrimaryBtn onClick={() => downloadTxt(config.lines.join('\n'), filename)}>
            <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            下载 .txt
          </PrimaryBtn>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--sp-3)',
          padding: 'var(--sp-3) 0',
          borderTop: '1px solid var(--accent-border)',
        }}
      >
        {isGrid && analysis.gridParams ? (
          <>
            <Param label="起始价" value={analysis.gridParams.basePrice.toFixed(2)} unit="¥" />
            <Param label="网格间距" value={analysis.gridParams.stepPercent.toFixed(2)} unit="%" />
            <Param label="网格数量" value={String(analysis.gridParams.gridCount)} unit="格" />
            <Param label="单格仓位" value={String(analysis.gridParams.lotPerGrid)} unit="股" />
          </>
        ) : analysis.conditionParams ? (
          <>
            <Param label="买入触发" value={analysis.conditionParams.buyTriggerPrice.toFixed(2)} unit="¥" />
            <Param label="卖出触发" value={analysis.conditionParams.sellTriggerPrice.toFixed(2)} unit="¥" />
            <Param label="买入数量" value={String(analysis.conditionParams.buyLot)} unit="股" />
            <Param label="卖出数量" value={String(analysis.conditionParams.sellLot)} unit="股" />
          </>
        ) : null}
      </div>
    </div>
  );
}

function Param({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>
      <div className="num" style={{ fontSize: 'var(--text-h3)', fontWeight: 600, marginTop: 2 }}>
        {value}
        {unit && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginLeft: 2, fontWeight: 400 }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function PrimaryBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 36,
        padding: '0 var(--sp-4)',
        background: 'var(--accent)',
        border: '1px solid var(--accent)',
        color: 'var(--accent-foreground)',
        borderRadius: 'var(--r-md)',
        fontFamily: 'inherit',
        fontSize: 'var(--text-body)',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-2)',
        transition: `all var(--motion-1) var(--ease)`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--accent-strong)';
        e.currentTarget.style.borderColor = 'var(--accent-strong)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--accent)';
        e.currentTarget.style.borderColor = 'var(--accent)';
      }}
    >
      {children}
    </button>
  );
}

function SecondaryBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 36,
        padding: '0 var(--sp-4)',
        background: 'var(--surface-1)',
        border: '1px solid var(--border-1)',
        color: 'var(--text-1)',
        borderRadius: 'var(--r-md)',
        fontFamily: 'inherit',
        fontSize: 'var(--text-body)',
        fontWeight: 500,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-2)',
        transition: `all var(--motion-1) var(--ease)`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--surface-2)';
        e.currentTarget.style.borderColor = 'var(--border-2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--surface-1)';
        e.currentTarget.style.borderColor = 'var(--border-1)';
      }}
    >
      {children}
    </button>
  );
}
