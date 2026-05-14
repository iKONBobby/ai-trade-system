'use client';

import type { AISummary } from '@trade/shared';

interface AISummaryCardProps {
  summary: AISummary | null;
  loading?: boolean;
}

function signalColors(level: 'risk' | 'opportunity' | 'info') {
  if (level === 'risk') return { color: 'var(--danger)', bg: 'var(--danger-bg)', label: '风险' };
  if (level === 'opportunity') return { color: 'var(--accent)', bg: 'var(--accent-bg)', label: '机会' };
  return { color: 'var(--info)', bg: 'var(--info-bg)', label: '提示' };
}

export default function AISummaryCard({ summary, loading }: AISummaryCardProps) {
  const showSkeleton = loading && !summary?.text;

  return (
    <div
      data-testid="ai-summary-card"
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-5)',
        marginTop: 'var(--sp-5)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top progress bar (shows while loading) */}
      {loading && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            overflow: 'hidden',
            background: 'var(--surface-2)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: '40%',
              background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
              animation: 'ai-progress 1.4s linear infinite',
            }}
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-2)',
          marginBottom: 'var(--sp-3)',
        }}
      >
        <span
          className="num"
          style={{
            width: 20,
            height: 20,
            borderRadius: 'var(--r-sm)',
            background: 'linear-gradient(135deg, var(--info), var(--accent))',
            display: 'grid',
            placeItems: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: '#0a0b0d',
            animation: loading ? 'ai-icon-pulse 1.6s ease-in-out infinite' : 'none',
            boxShadow: loading ? '0 0 0 0 rgba(16, 185, 129, 0.6)' : 'none',
          }}
        >
          AI
        </span>
        <span style={{ fontSize: 'var(--text-h3)', fontWeight: 600 }}>AI 复核与解读</span>
        {loading && (
          <span
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-2)',
              fontSize: 'var(--text-xs)',
              color: 'var(--accent)',
              fontWeight: 500,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                border: '2px solid var(--accent-bg)',
                borderTopColor: 'var(--accent)',
                animation: 'ai-spin 0.7s linear infinite',
              }}
            />
            <span>
              AI 正在分析<span className="ai-dots" aria-hidden>...</span>
            </span>
          </span>
        )}
      </div>

      {showSkeleton ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SkeletonLine width="92%" />
            <SkeletonLine width="98%" />
            <SkeletonLine width="78%" />
            <SkeletonLine width="86%" />
          </div>
          <div style={{ marginTop: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <SkeletonSignal />
            <SkeletonSignal />
            <SkeletonSignal />
          </div>
          <div
            style={{
              marginTop: 'var(--sp-3)',
              fontSize: 11,
              color: 'var(--text-3)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--sp-2)',
              alignItems: 'center',
            }}
          >
            <StageDot label="拉取行情" stage="done" />
            <StageDot label="计算指标" stage="done" />
            <StageDot label="调用 AI 模型" stage="active" />
            <StageDot label="生成解读" stage="pending" />
          </div>
        </>
      ) : summary?.text ? (
        <p
          style={{
            color: 'var(--text-2)',
            fontSize: 'var(--text-body)',
            lineHeight: 1.7,
            whiteSpace: 'pre-line',
          }}
        >
          {summary.text}
        </p>
      ) : (
        <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>暂无 AI 解读</p>
      )}

      {!showSkeleton && summary?.signals && summary.signals.length > 0 && (
        <div style={{ marginTop: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          {summary.signals.map((s, i) => {
            const c = signalColors(s.level);
            return (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: 'var(--sp-3)',
                  padding: 'var(--sp-2) var(--sp-3)',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-1)',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    padding: '1px var(--sp-2)',
                    borderRadius: 'var(--r-sm)',
                    fontSize: 'var(--text-tiny)',
                    color: c.color,
                    background: c.bg,
                  }}
                >
                  {c.label}
                </span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-1)' }}>{s.message}</span>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        @keyframes ai-progress {
          0% { left: -40%; }
          100% { left: 100%; }
        }
        @keyframes ai-icon-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
          50% { transform: scale(1.08); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
        }
        @keyframes ai-spin {
          to { transform: rotate(360deg); }
        }
        :global(.ai-dots)::after {
          content: '';
          animation: ai-dots 1.4s steps(4) infinite;
        }
        @keyframes ai-dots {
          0%   { content: ''; }
          25%  { content: '·'; }
          50%  { content: '··'; }
          75%  { content: '···'; }
          100% { content: ''; }
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.ai-dots)::after { animation: none; content: '···'; }
        }
      `}</style>
    </div>
  );
}

function SkeletonLine({ width }: { width: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'block',
        height: 12,
        width,
        borderRadius: 'var(--r-sm)',
        background:
          'linear-gradient(90deg, var(--surface-2) 0%, var(--surface-3) 50%, var(--surface-2) 100%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.6s ease-in-out infinite',
      }}
    >
      <style jsx>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </span>
  );
}

function SkeletonSignal() {
  return (
    <div
      aria-hidden
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: 'var(--sp-3)',
        padding: 'var(--sp-2) var(--sp-3)',
        borderRadius: 'var(--r-md)',
        background: 'var(--surface-2)',
        border: '1px solid var(--border-1)',
        alignItems: 'center',
      }}
    >
      <span
        style={{
          width: 32,
          height: 16,
          borderRadius: 'var(--r-sm)',
          background:
            'linear-gradient(90deg, var(--surface-3) 0%, var(--surface-hover) 50%, var(--surface-3) 100%)',
          backgroundSize: '200% 100%',
          animation: 'skeleton-shimmer 1.6s ease-in-out infinite',
        }}
      />
      <span
        style={{
          height: 10,
          width: '70%',
          borderRadius: 'var(--r-sm)',
          background:
            'linear-gradient(90deg, var(--surface-3) 0%, var(--surface-hover) 50%, var(--surface-3) 100%)',
          backgroundSize: '200% 100%',
          animation: 'skeleton-shimmer 1.6s ease-in-out infinite',
        }}
      />
      <style jsx>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

function StageDot({ label, stage }: { label: string; stage: 'done' | 'active' | 'pending' }) {
  const color =
    stage === 'done' ? 'var(--accent)' : stage === 'active' ? 'var(--accent)' : 'var(--text-disabled)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          boxShadow: stage === 'active' ? '0 0 8px var(--accent)' : 'none',
          animation: stage === 'active' ? 'stage-pulse 1.2s ease-in-out infinite' : 'none',
        }}
      />
      <span style={{ color: stage === 'pending' ? 'var(--text-disabled)' : 'var(--text-2)' }}>{label}</span>
      <style jsx>{`
        @keyframes stage-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </span>
  );
}
