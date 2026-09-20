'use client';

import { useEffect, useState } from 'react';
import type { KLine } from '@trade/shared';
import { fetchKLineDetail } from '@/lib/api';
import KLineChart from '../KLineChart';

type Range = 'minute' | 'min5' | 'daily' | 'weekly' | 'monthly';

const RANGE_OPTIONS: { value: Range; label: string; period: string; days: number }[] = [
  { value: 'minute', label: '分时', period: 'minute', days: 1 },
  { value: 'min5', label: '5日', period: '5min', days: 5 },
  { value: 'daily', label: '日K', period: 'daily', days: 120 },
  { value: 'weekly', label: '周K', period: 'weekly', days: 200 },
  { value: 'monthly', label: '月K', period: 'monthly', days: 365 },
];

interface ChartCardProps {
  stockCode: string;
}

export default function ChartCard({ stockCode }: ChartCardProps) {
  const [range, setRange] = useState<Range>('daily');
  const [data, setData] = useState<KLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stockCode) return;
    const opt = RANGE_OPTIONS.find((r) => r.value === range);
    if (!opt) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchKLineDetail(stockCode, opt.period as any, opt.days, ctrl.signal)
      .then((klines) => setData(klines))
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message || '加载 K 线失败');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [stockCode, range]);

  return (
    <div
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-3) var(--sp-4)',
        marginTop: 'var(--sp-4)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--sp-3)',
          gap: 'var(--sp-4)',
        }}
      >
        <div>
          <div style={{ fontSize: 'var(--text-h3)', fontWeight: 600 }}>
            {RANGE_OPTIONS.find((r) => r.value === range)?.label} 走势
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
            前复权 · {data.length} 个交易日
          </div>
        </div>

        <div
          style={{
            display: 'inline-flex',
            gap: 'var(--sp-3)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-2)',
            alignItems: 'center',
          }}
        >
          <Legend color="#f59e0b" label="MA5" />
          <Legend color="#3b82f6" label="MA10" />
          <Legend color="#a855f7" label="MA20" />
        </div>

        <div
          style={{
            display: 'inline-flex',
            gap: 0,
            background: 'var(--surface-2)',
            border: '1px solid var(--border-1)',
            borderRadius: 'var(--r-md)',
            padding: 2,
          }}
        >
          {RANGE_OPTIONS.map((opt) => {
            const isActive = opt.value === range;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRange(opt.value)}
                className="num"
                style={{
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'var(--accent-foreground)' : 'var(--text-2)',
                  border: 0,
                  cursor: 'pointer',
                  padding: '4px var(--sp-3)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: isActive ? 600 : 400,
                  transition: `all var(--motion-1) var(--ease)`,
                  fontFamily: 'inherit',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: 360,
          borderRadius: 'var(--r-md)',
          overflow: 'hidden',
        }}
      >
        {loading && data.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-3)',
            }}
          >
            加载 K 线…
          </div>
        )}
        {error && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              fontSize: 'var(--text-sm)',
              color: 'var(--down)',
            }}
          >
            {error}
          </div>
        )}
        {data.length > 0 && <KLineChart data={data} height={360} />}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 10, height: 2, borderRadius: 1, background: color }} />
      {label}
    </span>
  );
}
