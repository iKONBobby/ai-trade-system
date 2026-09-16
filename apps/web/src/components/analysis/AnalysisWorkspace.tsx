'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnalyzeResponse, KLine, KlinePeriod } from '@trade/shared';
import StockInput from '@/components/StockInput';
import ResearchTools from '@/components/analysis/ResearchTools';
import { Badge, Button, Icon, Surface } from '@/components/ui/primitives';
import { analyzeStock, fetchKLineDetail } from '@/lib/api';
import { saveLevels, type AnalysisTemplate, type DrawingLevel } from '@/lib/analysis-persistence';
import { summarizeTimeframe, type TechnicalTone, type TimeframeSnapshot } from '@/lib/technical-workspace';
import TechnicalChart, { type SecondaryIndicator } from './TechnicalChart';

const PERIODS: Array<{ value: KlinePeriod; label: string; count: number }> = [
  { value: '5min', label: '5分', count: 240 },
  { value: '15min', label: '15分', count: 240 },
  { value: '30min', label: '30分', count: 240 },
  { value: '60min', label: '60分', count: 240 },
  { value: 'daily', label: '日线', count: 260 },
  { value: 'weekly', label: '周线', count: 260 },
  { value: 'monthly', label: '月线', count: 180 },
];

const MATRIX_PERIODS: KlinePeriod[] = ['15min', '60min', 'daily', 'weekly'];

type FrameMap = Partial<Record<KlinePeriod, KLine[]>>;

export default function AnalysisWorkspace() {
  const [code, setCode] = useState('600519');
  const [period, setPeriod] = useState<KlinePeriod>('daily');
  const [secondary, setSecondary] = useState<SecondaryIndicator>('macd');
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [frames, setFrames] = useState<FrameMap>({});
  const [benchmarkFrames, setBenchmarkFrames] = useState<FrameMap>({});
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [levels, setLevels] = useState<DrawingLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [frameLoading, setFrameLoading] = useState<KlinePeriod | null>(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('code');
    if (value && /^\d{6}$/.test(value)) setCode(value);
  }, []);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    setAnalysis(null);
    setFrames({});
    setBenchmarkFrames({});
    setPeriod('daily');

    if (isTechnicalDemo()) {
      const demoFrames = Object.fromEntries(PERIODS.map((item) => [item.value, makeDemoBars(item.count)])) as FrameMap;
      setAnalysis(makeDemoAnalysis(code));
      setFrames(demoFrames);
      setUpdatedAt(new Date());
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      try {
        const periods = [...new Set<KlinePeriod>(['daily', ...MATRIX_PERIODS])];
        const [analysisResult, ...frameResults] = await Promise.all([
          analyzeStock({ stockCode: code, totalCapital: 100000, mode: 'auto', isT0Mode: false, useAI: false }),
          ...periods.map((item) => fetchKLineDetail(code, item, periodCount(item), controller.signal)),
        ]);
        if (controller.signal.aborted || requestId !== requestRef.current) return;
        const nextFrames: FrameMap = {};
        periods.forEach((item, index) => { nextFrames[item] = frameResults[index]; });
        setAnalysis(analysisResult);
        setFrames(nextFrames);
        setUpdatedAt(new Date());
      } catch (reason) {
        if (controller.signal.aborted || requestId !== requestRef.current) return;
        setError(reason instanceof Error ? reason.message : '技术分析加载失败');
      } finally {
        if (!controller.signal.aborted && requestId === requestRef.current) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [code, reloadToken]);

  useEffect(() => {
    if (!analysis || frames[period] || loading) return;
    const controller = new AbortController();
    setFrameLoading(period);
    fetchKLineDetail(code, period, periodCount(period), controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setFrames((current) => ({ ...current, [period]: items }));
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'K 线加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setFrameLoading(null);
      });
    return () => controller.abort();
  }, [analysis, code, frames, loading, period]);

  useEffect(() => {
    if (!showBenchmark || benchmarkFrames[period]) return;
    if (isTechnicalDemo()) {
      setBenchmarkFrames((current) => ({ ...current, [period]: makeDemoBenchmarkBars(periodCount(period)) }));
      return;
    }
    const controller = new AbortController();
    fetchKLineDetail('510300', period, periodCount(period), controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setBenchmarkFrames((current) => ({ ...current, [period]: items }));
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '沪深 300 ETF 数据加载失败');
      });
    return () => controller.abort();
  }, [benchmarkFrames, period, showBenchmark]);

  const selectStock = useCallback((nextCode: string) => {
    setCode(nextCode);
    const url = new URL(window.location.href);
    url.searchParams.set('code', nextCode);
    window.history.replaceState({}, '', url);
  }, []);

  const selectedData = frames[period] ?? [];
  const selected = useMemo(() => summarizeTimeframe(period, selectedData), [period, selectedData]);
  const matrix = useMemo(() => MATRIX_PERIODS.map((item) => ({
    period: item,
    summary: summarizeTimeframe(item, frames[item] ?? []),
  })), [frames]);

  const applyTemplate = useCallback((template: AnalysisTemplate) => {
    setPeriod(template.period);
    setSecondary(template.secondary);
    setShowBenchmark(template.showBenchmark);
    setLevels(template.levels.map((item) => ({ ...item })));
    saveLevels(code, template.levels);
  }, [code]);

  if (!analysis && loading) return <WorkspaceSkeleton onSearch={selectStock} />;

  if (!analysis) {
    return (
      <>
        <CommandBar onSearch={selectStock} loading={loading} />
        <Surface className="analysis-error" role="alert">
          <span className="section-label">Data unavailable</span>
          <h2>暂时无法生成技术分析</h2>
          <p>{error || '行情服务没有返回可用数据，请稍后重试。'}</p>
          <Button variant="secondary" onClick={() => setReloadToken((value) => value + 1)}>重新加载</Button>
        </Surface>
      </>
    );
  }

  const changeTone: TechnicalTone = analysis.market.change > 0 ? 'bullish' : analysis.market.change < 0 ? 'bearish' : 'neutral';

  return (
    <>
      <CommandBar onSearch={selectStock} loading={loading} />

      <section className="analysis-security" aria-label="证券摘要">
        <div className="analysis-security__identity">
          <div>
            <div className="analysis-security__name-row">
              <h2>{analysis.market.name}</h2>
              <Badge tone="neutral">{boardLabel(code)}</Badge>
              <Badge tone="info">前复权</Badge>
            </div>
            <div className="analysis-security__code mono">{code} · {code.startsWith('6') ? 'SH' : 'SZ'}</div>
          </div>
          <div className="analysis-security__quote">
            <strong className={`num tone-${changeTone}`}>{analysis.market.price.toFixed(2)}</strong>
            <span className={`num tone-${changeTone}`}>{signed(analysis.market.change)}%</span>
          </div>
        </div>
        <div className="analysis-security__metrics">
          <QuoteMetric label="开盘" value={analysis.market.open.toFixed(2)} />
          <QuoteMetric label="最高" value={analysis.market.high.toFixed(2)} />
          <QuoteMetric label="最低" value={analysis.market.low.toFixed(2)} />
          <QuoteMetric label="换手" value={analysis.market.turnoverAvailable === false ? '—' : `${analysis.market.turnover.toFixed(2)}%`} />
          <QuoteMetric label="振幅" value={`${analysis.analysis.advanced.amplitude.toFixed(2)}%`} />
          <QuoteMetric label="更新时间" value={updatedAt?.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) ?? '—'} />
        </div>
      </section>

      <section className="analysis-regime" aria-label="多周期结论">
        <div className="analysis-section-heading">
          <div><span className="section-label">Multi-timeframe</span><h2>周期共振</h2></div>
          <p>仅使用已返回 K 线；盘中信号可能继续变化。</p>
        </div>
        <div className="analysis-regime__grid">
          {matrix.map(({ period: item, summary }) => (
            <button key={item} type="button" className={`timeframe-card ${period === item ? 'timeframe-card--active' : ''}`} onClick={() => setPeriod(item)}>
              <span>{periodLabel(item)}</span>
              {summary ? <><ToneMark tone={summary.overall} /><strong>{toneLabel(summary.overall)}</strong><small>趋势 {toneLabel(summary.trend)} · 动量 {toneLabel(summary.momentum)}</small></> : <small>数据不足</small>}
            </button>
          ))}
        </div>
      </section>

      <section className="analysis-workbench">
        <Surface className="analysis-chart-card">
          <div className="analysis-chart-toolbar">
            <div>
              <span className="section-label">Price action</span>
              <h2>{periodLabel(period)}价格结构</h2>
            </div>
            <div className="analysis-chart-toolbar__controls">
              <div className="analysis-segment" aria-label="K 线周期">
                {PERIODS.map((item) => <button key={item.value} type="button" aria-pressed={period === item.value} onClick={() => setPeriod(item.value)}>{item.label}</button>)}
              </div>
              <div className="analysis-segment" aria-label="副图指标">
                {(['macd', 'rsi'] as const).map((item) => <button key={item} type="button" aria-pressed={secondary === item} onClick={() => setSecondary(item)}>{item.toUpperCase()}</button>)}
              </div>
            </div>
          </div>
          <div className="analysis-chart-legend" aria-label="图例">
            <Legend color="var(--warning)" label="MA5" /><Legend color="var(--info)" label="MA20" /><Legend color="#a78bfa" label="MA60" /><Legend color="var(--text-3)" label="BOLL" dashed />
          </div>
          {showBenchmark && <div className="analysis-benchmark-note"><span />归一化对比：个股 vs 沪深 300 ETF（510300）</div>}
          {frameLoading === period ? <ChartLoading /> : selectedData.length > 0 ? <TechnicalChart data={selectedData} secondary={secondary} benchmarkData={showBenchmark ? benchmarkFrames[period] ?? [] : []} levels={levels} /> : <ChartEmpty />}
        </Surface>

        <aside className="analysis-evidence" aria-label="分析证据">
          <EvidencePanel summary={selected} secondary={secondary} onSecondary={setSecondary} />
          <Surface className="analysis-action-card">
            <span className="section-label">Next action</span>
            <h3>从研究进入策略执行</h3>
            <p>技术页保留证据和风险，资金与策略参数在执行页确认。</p>
            <Link className="ui-button ui-button--primary ui-button--md" href={`/trade?code=${code}`}>
              送入策略执行 <Icon name="arrow-up-right" size={15} />
            </Link>
          </Surface>
        </aside>
      </section>

      <ResearchTools
        key={code}
        code={code}
        currentPrice={analysis.market.price}
        period={period}
        secondary={secondary}
        summary={selected}
        levels={levels}
        showBenchmark={showBenchmark}
        onLevels={setLevels}
        onBenchmark={setShowBenchmark}
        onApplyTemplate={applyTemplate}
      />

      {error && <div className="analysis-inline-error" role="status">{error}</div>}
    </>
  );
}

function CommandBar({ onSearch, loading }: { onSearch: (code: string) => void; loading: boolean }) {
  return <Surface className="analysis-command"><div className="analysis-command__label"><Icon name="search" size={17} /><span>证券检索</span></div><div className="analysis-command__search"><StockInput onSearch={onSearch} loading={loading} /></div></Surface>;
}

function WorkspaceSkeleton({ onSearch }: { onSearch: (code: string) => void }) {
  return <><CommandBar onSearch={onSearch} loading /><div className="analysis-skeleton"><div /><div /><div /></div></>;
}

function EvidencePanel({ summary, secondary, onSecondary }: { summary: TimeframeSnapshot | null; secondary: SecondaryIndicator; onSecondary: (value: SecondaryIndicator) => void }) {
  if (!summary) return <Surface className="analysis-evidence-card"><span className="section-label">Evidence</span><h2>等待足够 K 线</h2><p className="analysis-evidence-card__intro">当前周期暂时不能形成稳定指标。</p></Surface>;
  const evidence = [
    {
      label: '趋势结构', tone: summary.trend,
      value: summary.ma20 == null ? '均线不足' : `收盘 ${summary.close.toFixed(2)} / MA20 ${summary.ma20.toFixed(2)}`,
      detail: summary.ma20 == null || summary.ma60 == null ? '需要更多 K 线确认长周期方向' : `价格${summary.close >= summary.ma20 ? '站上' : '跌破'} MA20；MA20 ${summary.ma20 >= summary.ma60 ? '仍在' : '已在'} MA60 ${summary.ma20 >= summary.ma60 ? '上方' : '下方'}`,
      invalidation: `收盘反向穿越 MA20 后重新评估`, action: undefined,
    },
    {
      label: '动量', tone: summary.momentum,
      value: `RSI ${format(summary.rsi)} / MACD柱 ${format(summary.macdHistogram)}`,
      detail: summary.rsi != null && summary.rsi >= 70 ? 'RSI 进入过热区，强势不等于低风险' : summary.rsi != null && summary.rsi <= 30 ? 'RSI 进入超卖区，仍需等待价格确认' : '动量未进入极端区间',
      invalidation: 'MACD 柱反向穿越零轴', action: () => onSecondary(secondary === 'macd' ? 'rsi' : 'macd'),
    },
    {
      label: '量能确认', tone: summary.volume,
      value: `量比 ${summary.volumeRatio == null ? '—' : `${summary.volumeRatio.toFixed(2)}×`}`,
      detail: summary.volumeRatio == null ? '没有足够成交量样本' : summary.volumeRatio >= 1.2 ? '当前量能高于前期均值' : summary.volumeRatio < 0.7 ? '缩量，趋势确认度下降' : '成交量处于常态区间',
      invalidation: '量比回到 1.0 以下时降低突破可信度', action: undefined,
    },
    {
      label: '波动与边界', tone: summary.risk,
      value: `ATR ${format(summary.atr)} (${format(summary.atrPct)}%)`,
      detail: `近 20 根支撑 ${summary.support.toFixed(2)} · 阻力 ${summary.resistance.toFixed(2)}`,
      invalidation: `跌破 ${summary.support.toFixed(2)} 或突破 ${summary.resistance.toFixed(2)}`, action: undefined,
    },
  ];
  return (
    <Surface className="analysis-evidence-card">
      <div className="analysis-evidence-card__head"><div><span className="section-label">Evidence</span><h2>证据与失效条件</h2></div><Badge tone={badgeTone(summary.overall)}>{toneLabel(summary.overall)}</Badge></div>
      <p className="analysis-evidence-card__intro">结论拆成可核对的四组信号，不把综合状态当成买卖指令。</p>
      <div className="analysis-evidence-list">
        {evidence.map((item) => {
          const content = <><div className="analysis-evidence-item__title"><ToneMark tone={item.tone} /><strong>{item.label}</strong><span>{toneLabel(item.tone)}</span></div><div className="analysis-evidence-item__value num">{item.value}</div><p>{item.detail}</p><small>失效：{item.invalidation}</small></>;
          return item.action ? <button type="button" key={item.label} className="analysis-evidence-item analysis-evidence-item--button" onClick={item.action}>{content}</button> : <div key={item.label} className="analysis-evidence-item">{content}</div>;
        })}
      </div>
    </Surface>
  );
}

function QuoteMetric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong className="num">{value}</strong></div>; }
function ToneMark({ tone }: { tone: TechnicalTone }) { return <i className={`tone-mark tone-mark--${tone}`} aria-hidden="true" />; }
function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) { return <span><i style={{ background: dashed ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` : color }} />{label}</span>; }
function ChartLoading() { return <div className="analysis-chart-state"><span className="analysis-loader" />加载当前周期…</div>; }
function ChartEmpty() { return <div className="analysis-chart-state">当前周期暂无 K 线数据</div>; }
function periodCount(period: KlinePeriod) { return PERIODS.find((item) => item.value === period)?.count ?? 260; }
function periodLabel(period: KlinePeriod) { return PERIODS.find((item) => item.value === period)?.label ?? period; }
function toneLabel(tone: TechnicalTone) { return tone === 'bullish' ? '偏多' : tone === 'bearish' ? '偏空' : '中性'; }
function badgeTone(tone: TechnicalTone): 'positive' | 'negative' | 'neutral' { return tone === 'bullish' ? 'positive' : tone === 'bearish' ? 'negative' : 'neutral'; }
function boardLabel(code: string) { return code.startsWith('688') ? '科创板' : code.startsWith('30') ? '创业板' : '主板'; }
function signed(value: number) { return `${value > 0 ? '+' : ''}${value.toFixed(2)}`; }
function format(value: number | null) { return value == null || !Number.isFinite(value) ? '—' : value.toFixed(2); }

function isTechnicalDemo() {
  return process.env.NODE_ENV !== 'production' && new URLSearchParams(window.location.search).get('demo') === 'technical';
}

function makeDemoBars(length: number): KLine[] {
  const start = Date.UTC(2025, 0, 1);
  return Array.from({ length }, (_, index) => {
    const trend = index * 0.24;
    const wave = Math.sin(index / 5.5) * 5.8 + Math.sin(index / 17) * 3.4;
    const close = 126 + trend + wave;
    const open = close - Math.sin(index * 1.7) * 1.6;
    return {
      date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
      open,
      high: Math.max(open, close) + 1.2 + (index % 3) * 0.28,
      low: Math.min(open, close) - 1.1 - (index % 4) * 0.2,
      close,
      volume: 1_800_000 + Math.sin(index / 4) * 420_000 + index * 3100,
    };
  });
}

function makeDemoBenchmarkBars(length: number): KLine[] {
  return makeDemoBars(length).map((item, index) => {
    const factor = 0.82 + Math.sin(index / 23) * 0.012;
    return { ...item, open: item.open * factor, high: item.high * factor, low: item.low * factor, close: item.close * factor, volume: item.volume * 1.8 };
  });
}

function makeDemoAnalysis(code: string): AnalyzeResponse {
  const bars = makeDemoBars(260);
  const latest = bars.at(-1)!;
  const previous = bars.at(-2)!;
  const snapshot = summarizeTimeframe('daily', bars)!;
  return {
    market: {
      code,
      name: code === '600519' ? '贵州茅台' : '演示证券',
      price: latest.close,
      change: ((latest.close - previous.close) / previous.close) * 100,
      volume: latest.volume,
      turnover: 1.82,
      open: latest.open,
      high: latest.high,
      low: latest.low,
      preClose: previous.close,
    },
    analysis: {
      marketState: snapshot.overall === 'bullish' ? 'trending_up' : snapshot.overall === 'bearish' ? 'trending_down' : 'ranging',
      bollinger: { upper: latest.close + 8, middle: snapshot.ma20 ?? latest.close, lower: latest.close - 8, width: 0.09 },
      atr: snapshot.atr ?? 0,
      ma: { ma5: latest.close - 1, ma20: snapshot.ma20 ?? latest.close, ma60: snapshot.ma60 ?? latest.close },
      support: snapshot.support,
      resistance: snapshot.resistance,
      recommendation: 'condition',
      confidence: 74,
      conditionParams: { buyTriggerPrice: snapshot.support, sellTriggerPrice: snapshot.resistance, buyLot: 100, sellLot: 100 },
      advanced: {
        rsi: snapshot.rsi == null ? null : { value: snapshot.rsi, signal: snapshot.rsi > 70 ? 'overbought' : snapshot.rsi < 30 ? 'oversold' : 'neutral' },
        macd: null,
        kdj: null,
        wr: null,
        amplitude: ((latest.high - latest.low) / previous.close) * 100,
        volumeRatio: snapshot.volumeRatio,
        limitDistance: { up: 6.2, down: 13.8 },
        maArrangement: 'bullish_alignment',
      },
    },
    config: { lines: [], summary: '技术分析演示数据' },
  };
}
