'use client';

import type { MarketData, AnalysisResult } from '@trade/shared';

interface IndicatorGridProps {
  market: MarketData;
  analysis: AnalysisResult;
}

type StateCls = 'bull' | 'bear' | 'neutral';

function stateColors(cls: StateCls): { color: string; bg: string } {
  if (cls === 'bull') return { color: 'var(--up)', bg: 'var(--up-bg)' };
  if (cls === 'bear') return { color: 'var(--down)', bg: 'var(--down-bg)' };
  return { color: 'var(--warning)', bg: 'var(--warning-bg)' };
}

function maStateLabel(a: AnalysisResult['advanced']['maArrangement']): { label: string; cls: StateCls } {
  if (a === 'bullish_alignment') return { label: '多头排列', cls: 'bull' };
  if (a === 'bearish_alignment') return { label: '空头排列', cls: 'bear' };
  return { label: '交叉缠绕', cls: 'neutral' };
}

function macdStateLabel(s: AnalysisResult['advanced']['macd']) {
  if (!s) return { label: '—', cls: 'neutral' as StateCls };
  if (s.signal === 'golden_cross') return { label: '金叉', cls: 'bull' as StateCls };
  if (s.signal === 'death_cross') return { label: '死叉', cls: 'bear' as StateCls };
  if (s.signal === 'bullish') return { label: '多头', cls: 'bull' as StateCls };
  if (s.signal === 'bearish') return { label: '空头', cls: 'bear' as StateCls };
  return { label: '中性', cls: 'neutral' as StateCls };
}

function bollLabel(price: number, b: AnalysisResult['bollinger']): { label: string; cls: StateCls; pct: number } {
  const range = b.upper - b.lower || 1;
  const pct = Math.max(0, Math.min(100, ((price - b.lower) / range) * 100));
  if (price >= b.middle) return { label: pct > 90 ? '近上轨' : '中轨上', cls: pct > 90 ? 'bull' : 'neutral', pct };
  return { label: pct < 10 ? '近下轨' : '中轨下', cls: pct < 10 ? 'bear' : 'neutral', pct };
}

function srLabel(price: number, support: number, resistance: number) {
  const range = resistance - support || 1;
  const pct = Math.max(0, Math.min(100, ((price - support) / range) * 100));
  const distSupport = ((price - support) / price) * 100;
  const distResist = ((resistance - price) / price) * 100;
  return { pct, distSupport, distResist };
}

function rsiStateLabel(s: AnalysisResult['advanced']['rsi']): { label: string; cls: StateCls } {
  if (!s) return { label: '—', cls: 'neutral' };
  if (s.signal === 'overbought') return { label: '超买', cls: 'bear' };
  if (s.signal === 'oversold') return { label: '超卖', cls: 'bull' };
  return { label: '中性', cls: 'neutral' };
}

function kdjStateLabel(s: AnalysisResult['advanced']['kdj']): { label: string; cls: StateCls } {
  if (!s) return { label: '—', cls: 'neutral' };
  if (s.signal === 'overbought') return { label: '超买', cls: 'bear' };
  if (s.signal === 'oversold') return { label: '超卖', cls: 'bull' };
  return { label: '中性', cls: 'neutral' };
}

function volRatioLabel(v: number | null): { label: string; cls: StateCls } | null {
  if (v == null) return null;
  if (v > 1.5) return { label: '放量', cls: 'bull' };
  if (v < 0.5) return { label: '缩量', cls: 'bear' };
  return { label: '正常', cls: 'neutral' };
}

export default function IndicatorGrid({ market, analysis }: IndicatorGridProps) {
  const adv = analysis.advanced;
  const maState = maStateLabel(adv.maArrangement);
  const macdState = macdStateLabel(adv.macd);
  const boll = bollLabel(market.price, analysis.bollinger);
  const bollWidth = analysis.bollinger.width * 100;
  const sr = srLabel(market.price, analysis.support, analysis.resistance);
  const maAvg = (analysis.ma.ma5 + analysis.ma.ma20 + analysis.ma.ma60) / 3;
  const rsi = rsiStateLabel(adv.rsi);
  const kdj = kdjStateLabel(adv.kdj);
  const volR = volRatioLabel(adv.volumeRatio);

  return (
    <>
      {/* Section head */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: 'var(--sp-5) 0 var(--sp-3)',
        }}
      >
        <h3 style={{ fontSize: 'var(--text-h3)', fontWeight: 600 }}>技术指标</h3>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>基于 60 日 K 线</span>
      </div>

      {/* Primary: 2×2 large cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'var(--sp-3)',
          marginBottom: 'var(--sp-3)',
        }}
      >
        <PrimaryCard title="均线系统" state={maState}>
          <BigValue value={maAvg.toFixed(0)} unit="综合均值" />
          <DetailGrid>
            <DetailCell label="MA5" value={analysis.ma.ma5.toFixed(2)} accent={analysis.ma.ma5 > analysis.ma.ma20 ? 'up' : 'down'} />
            <DetailCell label="MA20" value={analysis.ma.ma20.toFixed(2)} accent={analysis.ma.ma20 > analysis.ma.ma60 ? 'up' : 'down'} />
            <DetailCell label="MA60" value={analysis.ma.ma60.toFixed(2)} />
          </DetailGrid>
        </PrimaryCard>

        <PrimaryCard title="MACD" state={macdState}>
          <BigValue
            value={adv.macd ? `${adv.macd.histogram >= 0 ? '+' : ''}${adv.macd.histogram.toFixed(2)}` : '—'}
            unit="柱状值"
            color={adv.macd && adv.macd.histogram >= 0 ? 'up' : 'down'}
          />
          <DetailGrid>
            <DetailCell label="DIF" value={adv.macd ? adv.macd.dif.toFixed(2) : '—'} accent={adv.macd && adv.macd.dif >= 0 ? 'up' : 'down'} />
            <DetailCell label="DEA" value={adv.macd ? adv.macd.dea.toFixed(2) : '—'} />
            <DetailCell
              label="柱"
              value={adv.macd ? `${adv.macd.histogram >= 0 ? '+' : ''}${adv.macd.histogram.toFixed(2)}` : '—'}
              accent={adv.macd && adv.macd.histogram >= 0 ? 'up' : 'down'}
            />
          </DetailGrid>
        </PrimaryCard>

        <PrimaryCard title="布林带" state={{ label: boll.label, cls: boll.cls }}>
          <BigValue value={bollWidth.toFixed(2)} unit="% 带宽" />
          <RangeBar
            marker={boll.pct}
            left={`下 ${analysis.bollinger.lower.toFixed(2)}`}
            center={`中 ${analysis.bollinger.middle.toFixed(2)}`}
            right={`上 ${analysis.bollinger.upper.toFixed(2)}`}
          />
        </PrimaryCard>

        <PrimaryCard title="支撑 / 阻力" state={{ label: '区间内', cls: 'neutral' }}>
          <BigValue value={`${analysis.support.toFixed(0)}  /  ${analysis.resistance.toFixed(0)}`} unit="" />
          <RangeBar
            marker={sr.pct}
            left={
              <span style={{ color: 'var(--down)' }}>
                支撑 +{sr.distSupport.toFixed(1)}%
              </span>
            }
            center={
              <span style={{ color: 'var(--text-3)' }} className="num">
                当前 {market.price.toFixed(2)}
              </span>
            }
            right={
              <span style={{ color: 'var(--up)' }}>
                阻力 −{sr.distResist.toFixed(1)}%
              </span>
            }
          />
        </PrimaryCard>
      </div>

      {/* Secondary: 1×4 compact cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--sp-3)',
        }}
      >
        <CompactCard label="RSI" state={rsi} value={adv.rsi ? adv.rsi.value.toFixed(1) : '—'} sub={describeRsi(adv.rsi)} />
        <CompactCard
          label="KDJ"
          state={kdj}
          value={adv.kdj ? adv.kdj.k.toFixed(1) : '—'}
          sub={adv.kdj ? `K${adv.kdj.k.toFixed(0)}·D${adv.kdj.d.toFixed(0)}·J${adv.kdj.j.toFixed(0)}` : '—'}
        />
        <CompactCard
          label="ATR"
          state={{ label: '中波', cls: 'neutral' }}
          value={analysis.atr.toFixed(1)}
          sub={`日均 ${adv.amplitude.toFixed(2)}%`}
        />
        {volR ? (
          <CompactCard
            label="量比"
            state={volR}
            value={adv.volumeRatio ? `${adv.volumeRatio.toFixed(2)}×` : '—'}
            sub={market.turnoverAvailable === false ? '换手 —' : `换手 ${market.turnover.toFixed(2)}%`}
          />
        ) : (
          <CompactCard label="量比" state={{ label: '—', cls: 'neutral' }} value="—" sub="无数据" />
        )}
      </div>
    </>
  );
}

function describeRsi(r: AnalysisResult['advanced']['rsi']): string {
  if (!r) return '无数据';
  if (r.signal === 'overbought') return '过热谨慎';
  if (r.signal === 'oversold') return '超跌反弹';
  return '温和向上';
}

function PrimaryCard({
  title,
  state,
  children,
}: {
  title: string;
  state: { label: string; cls: StateCls };
  children: React.ReactNode;
}) {
  const { color, bg } = stateColors(state.cls);
  return (
    <div
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-3) var(--sp-4)',
        transition: `border-color var(--motion-1) var(--ease)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 'var(--sp-2)',
        }}
      >
        <span>{title}</span>
        <span
          style={{
            padding: '2px var(--sp-2)',
            borderRadius: 'var(--r-sm)',
            fontSize: 'var(--text-tiny)',
            textTransform: 'none',
            letterSpacing: 0,
            color,
            background: bg,
          }}
        >
          {state.label}
        </span>
      </div>
      {children}
    </div>
  );
}

function BigValue({ value, unit, color }: { value: string; unit?: string; color?: 'up' | 'down' }) {
  return (
    <div
      className="num"
      style={{
        fontSize: 26,
        fontWeight: 700,
        letterSpacing: '-0.01em',
        color: color === 'up' ? 'var(--up)' : color === 'down' ? 'var(--down)' : 'var(--text-1)',
      }}
    >
      {value}
      {unit && (
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginLeft: 'var(--sp-1)', fontWeight: 500 }}>
          {unit}
        </span>
      )}
    </div>
  );
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--sp-3)',
        marginTop: 'var(--sp-3)',
        paddingTop: 'var(--sp-3)',
        borderTop: '1px solid var(--border-1)',
      }}
    >
      {children}
    </div>
  );
}

function DetailCell({ label, value, accent }: { label: string; value: string; accent?: 'up' | 'down' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontSize: 10,
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </span>
      <span
        className="num"
        style={{
          fontSize: 'var(--text-body)',
          fontWeight: 600,
          color: accent === 'up' ? 'var(--up)' : accent === 'down' ? 'var(--down)' : 'var(--text-1)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function RangeBar({
  marker,
  left,
  center,
  right,
}: {
  marker: number;
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div
      style={{
        marginTop: 'var(--sp-3)',
        paddingTop: 'var(--sp-3)',
        borderTop: '1px solid var(--border-1)',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: 6,
          borderRadius: 'var(--r-pill)',
          background: 'var(--surface-3)',
          overflow: 'visible',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'var(--r-pill)',
            background: 'linear-gradient(90deg, var(--down-dim), var(--accent), var(--up-dim))',
            opacity: 0.4,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${marker}%`,
            transform: 'translate(-50%, -50%)',
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'var(--text-1)',
            border: '2px solid var(--surface-1)',
            boxShadow: '0 0 0 1px var(--accent), 0 0 8px var(--accent)',
          }}
        />
      </div>
      <div
        className="num"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 10,
          color: 'var(--text-3)',
        }}
      >
        <span>{left}</span>
        <span>{center}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

function CompactCard({
  label,
  state,
  value,
  sub,
}: {
  label: string;
  state: { label: string; cls: StateCls };
  value: string;
  sub: string;
}) {
  const { color, bg } = stateColors(state.cls);
  return (
    <div
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-2) var(--sp-3)',
        transition: `border-color var(--motion-1) var(--ease)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 'var(--sp-1)',
        }}
      >
        <span>{label}</span>
        <span
          style={{
            padding: '2px var(--sp-2)',
            borderRadius: 'var(--r-sm)',
            fontSize: 'var(--text-tiny)',
            textTransform: 'none',
            letterSpacing: 0,
            color,
            background: bg,
          }}
        >
          {state.label}
        </span>
      </div>
      <div
        className="num"
        style={{ fontSize: 'var(--text-h3)', fontWeight: 700, letterSpacing: '-0.01em' }}
      >
        {value}
      </div>
      <div
        className="num"
        style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.4 }}
      >
        {sub}
      </div>
    </div>
  );
}
