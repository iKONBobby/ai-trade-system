'use client';

import { useState } from 'react';
import type { AnalyzeResponse } from '@trade/shared';
import AISummary from './AISummary';
import IndicatorCard from './IndicatorCard';
import IndicatorSection from './IndicatorSection';

interface AnalysisResultProps {
  data: AnalyzeResponse;
  showAI?: boolean;
  totalCapital?: number;
  isT0Mode?: boolean;
  onConfigUpdate?: (config: any) => void;
}

function formatVolume(v: number): string {
  if (v >= 100_000_000) return (v / 100_000_000).toFixed(2) + '亿';
  if (v >= 10_000) return (v / 10_000).toFixed(2) + '万';
  return v.toFixed(2);
}

function marketStateLabel(state: string): string {
  const map: Record<string, string> = {
    ranging: '震荡行情',
    trending_up: '上涨趋势',
    trending_down: '下跌趋势',
  };
  return map[state] || state;
}

function marketStateColor(state: string): string {
  if (state === 'trending_up') return 'text-emerald-400';
  if (state === 'trending_down') return 'text-red-400';
  return 'text-amber-400';
}

function arrangementLabel(a: string): string {
  const map: Record<string, string> = {
    bullish_alignment: '多头排列',
    bearish_alignment: '空头排列',
    crossed: '交叉缠绕',
  };
  return map[a] ?? a;
}

function arrangementColor(a: string): 'green' | 'red' | 'yellow' {
  if (a === 'bullish_alignment') return 'green';
  if (a === 'bearish_alignment') return 'red';
  return 'yellow';
}

export default function AnalysisResult({ data, showAI = false, totalCapital, isT0Mode, onConfigUpdate }: AnalysisResultProps) {
  const { market, analysis, config: originalConfig } = data;
  const adv = analysis.advanced;
  const isUp = market.change >= 0;
  const priceColor = isUp ? 'var(--color-danger)' : 'var(--color-accent)';
  const [showConfig, setShowConfig] = useState(false);
  const [activeConfig, setActiveConfig] = useState(originalConfig);

  const handleConfigUpdate = (newConfig: any) => {
    setActiveConfig(newConfig);
    onConfigUpdate?.(newConfig);
  };

  return (
    <div className="space-y-4">
      {/* ===== Stock Header ===== */}
      <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5">
        {/* Name + Price */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
              {market.name}
            </h2>
            <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{market.code}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold tracking-tight" style={{ color: priceColor }}>
              {market.price.toFixed(2)}
            </div>
            <div className="mt-0.5 text-base font-semibold" style={{ color: priceColor }}>
              {isUp ? '+' : ''}{market.change.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          <QuickStat label="今开" value={market.open.toFixed(2)} />
          <QuickStat label="最高" value={market.high.toFixed(2)} highlight="high" />
          <QuickStat label="最低" value={market.low.toFixed(2)} highlight="low" />
          <QuickStat label="昨收" value={market.preClose.toFixed(2)} />
        </div>
      </div>

      {/* ===== AI Summary (only when AI is enabled) ===== */}
      {showAI && (
        <AISummary
          market={market}
          analysis={analysis}
          totalCapital={totalCapital}
          isT0Mode={isT0Mode}
          strategyId={market.code}
          onConfigUpdate={handleConfigUpdate}
        />
      )}

      {/* ===== Strategy Bar ===== */}
      <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold ${
                analysis.recommendation === 'grid'
                  ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                  : 'bg-blue-950 text-blue-400'
              }`}
            >
              {analysis.recommendation === 'grid' ? '▦ 网格交易' : '◈ 条件单'}
            </span>
            <div>
              <span className={`text-sm font-semibold ${marketStateColor(analysis.marketState)}`}>
                {marketStateLabel(analysis.marketState)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-text-secondary)]">置信度</span>
            <span className="text-lg font-bold text-[var(--color-accent)]">
              {analysis.confidence.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Strategy Params with visual hints */}
        {analysis.gridParams && (
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--color-border)] pt-4">
            <Param label="基准价" value={analysis.gridParams.basePrice.toFixed(2)} />
            <Param label="网格步长" value={`${analysis.gridParams.stepPercent}%`} />
            <Param label="每格数量" value={`${analysis.gridParams.lotPerGrid} 股`} />
          </div>
        )}
        {analysis.conditionParams && (
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--color-border)] pt-4">
            <Param
              label="买入触发"
              value={analysis.conditionParams.buyTriggerPrice.toFixed(2)}
              hint={`≈ 支撑位 ${analysis.support.toFixed(2)}`}
            />
            <Param
              label="卖出触发"
              value={analysis.conditionParams.sellTriggerPrice.toFixed(2)}
              hint={`≈ 阻力位 ${analysis.resistance.toFixed(2)}`}
            />
            <Param label="每笔数量" value={`${analysis.conditionParams.buyLot} 股`} />
          </div>
        )}

        {/* Config download + preview */}
        <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-border)] pt-3">
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              const ds = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
              const blob = new Blob([activeConfig.lines.join('\n')], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `ibt-${ds}-12-0.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-black transition-opacity hover:opacity-90"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            下载配置
          </button>
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            {showConfig ? '收起' : '预览配置'}
          </button>
        </div>
        {showConfig && (
          <>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-black p-3 text-xs leading-relaxed">
              <code className="font-mono text-[var(--color-accent)]">
                {activeConfig.lines.map((line, i) => (
                  <span key={i}>{line}{'\n'}</span>
                ))}
              </code>
            </pre>
            {/* Config explanation */}
            <details className="mt-2 group/details">
              <summary className="cursor-pointer text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]">
                怎么看这个配置？
              </summary>
              <div className="mt-2 space-y-2 rounded-lg bg-[var(--color-bg-primary)] p-3 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                <p>
                  这是<span className="font-medium text-[var(--color-text-primary)]">破冰号</span>的导入格式，CSV 一行一条策略。
                </p>
                {analysis.recommendation === 'grid' ? (
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)]">网格模式（1 行）：</p>
                    <ul className="mt-1 space-y-0.5 pl-4">
                      <li><span className="text-amber-400">基准价</span> — 网格中心价格，从该价格向上下展开网格</li>
                      <li><span className="text-amber-400">网格数#步长%</span> — 末尾字段，如 4#1#0.5 表示 4 格、步长 0.5%</li>
                      <li><span className="text-amber-400">每格数量</span> — 每格买卖多少股</li>
                      <li><span className="text-amber-400">时间窗</span> — 09:00-21:00 为交易时段，15:14:59 前平仓</li>
                      <li>导入后破冰号会自动根据基准价 ± 步长展开 N 格挂单</li>
                    </ul>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)]">条件单模式（2 行，一买一卖）：</p>
                    <ul className="mt-1 space-y-0.5 pl-4">
                      <li><span className="text-emerald-400">第 1 行（买入）</span> — 价格跌到触发价时自动买入</li>
                      <li><span className="text-red-400">第 2 行（卖出）</span> — 价格涨到触发价时自动卖出</li>
                      <li><span className="text-amber-400">触发价</span> — 基于支撑位（买入）和阻力位（卖出）</li>
                      <li><span className="text-amber-400">时间窗</span> — 09:00-21:00 监控条件，15:14:59 前确保成交</li>
                      <li>导入后破冰号会监控价格，满足条件自动触发委托</li>
                    </ul>
                  </div>
                )}
                <p className="text-[11px]">
                  💡 复制内容 → 粘贴到破冰号策略文件（.txt）→ 导入即可
                </p>
              </div>
            </details>
          </>
        )}
      </div>

      {/* ===== Trend Indicators ===== */}
      <IndicatorSection title="趋势指标" icon="📈">
        <div className="grid grid-cols-2 gap-4">
          <IndicatorCard
            label="MA5 均价"
            value={analysis.ma.ma5.toFixed(2)}
            sub="5 日均线"
            explanationKey="ma"
          />
          <IndicatorCard
            label="MA20 均价"
            value={analysis.ma.ma20.toFixed(2)}
            sub="20 日均线"
          />
          <IndicatorCard
            label="MA60 均价"
            value={analysis.ma.ma60.toFixed(2)}
            sub="60 日均线"
          />
          <IndicatorCard
            label="均线排列"
            value={arrangementLabel(adv.maArrangement)}
            signal={adv.maArrangement === 'bullish_alignment' ? '强势' : adv.maArrangement === 'bearish_alignment' ? '弱势' : '震荡'}
            signalColor={arrangementColor(adv.maArrangement)}
            explanationKey="ma"
          />
        </div>
      </IndicatorSection>

      {/* ===== Momentum Indicators ===== */}
      <IndicatorSection title="动量指标" icon="⚡">
        <div className="grid grid-cols-2 gap-4">
          {adv.rsi ? (
            <IndicatorCard
              label="RSI (14)"
              value={adv.rsi.value.toFixed(1)}
              signal={adv.rsi.signal === 'overbought' ? '超买' : adv.rsi.signal === 'oversold' ? '超卖' : '中性'}
              signalColor={adv.rsi.signal === 'overbought' ? 'red' : adv.rsi.signal === 'oversold' ? 'green' : 'gray'}
              explanationKey="rsi"
            />
          ) : (
            <IndicatorCard label="RSI" value="—" />
          )}
          {adv.macd ? (
            <IndicatorCard
              label="MACD"
              value={adv.macd.signal === 'golden_cross' ? '金叉 ✦' : adv.macd.signal === 'death_cross' ? '死叉' : adv.macd.signal === 'bullish' ? '多头' : '空头'}
              sub={`DIF ${adv.macd.dif.toFixed(2)}  DEA ${adv.macd.dea.toFixed(2)}`}
              signal={adv.macd.signal === 'golden_cross' || adv.macd.signal === 'bullish' ? '看涨' : '看跌'}
              signalColor={adv.macd.signal === 'golden_cross' || adv.macd.signal === 'bullish' ? 'green' : 'red'}
              explanationKey="macd"
            />
          ) : (
            <IndicatorCard label="MACD" value="—" />
          )}
          {adv.kdj ? (
            <IndicatorCard
              label="KDJ"
              value={`K ${adv.kdj.k.toFixed(1)}  D ${adv.kdj.d.toFixed(1)}`}
              sub={`J ${adv.kdj.j.toFixed(1)}`}
              signal={adv.kdj.signal === 'overbought' ? '超买' : adv.kdj.signal === 'oversold' ? '超卖' : '中性'}
              signalColor={adv.kdj.signal === 'overbought' ? 'red' : adv.kdj.signal === 'oversold' ? 'green' : 'gray'}
              explanationKey="kdj"
            />
          ) : (
            <IndicatorCard label="KDJ" value="—" />
          )}
          {adv.wr ? (
            <IndicatorCard
              label="WR (威廉)"
              value={adv.wr.value.toFixed(1)}
              signal={adv.wr.signal === 'overbought' ? '超买' : adv.wr.signal === 'oversold' ? '超卖' : '中性'}
              signalColor={adv.wr.signal === 'overbought' ? 'red' : adv.wr.signal === 'oversold' ? 'green' : 'gray'}
              explanationKey="wr"
            />
          ) : (
            <IndicatorCard label="WR" value="—" />
          )}
        </div>
      </IndicatorSection>

      {/* ===== Volatility & Volume ===== */}
      <IndicatorSection title="波动与成交量" icon="📊">
        <div className="grid grid-cols-2 gap-4">
          <IndicatorCard
            label="布林上轨"
            value={analysis.bollinger.upper.toFixed(2)}
            explanationKey="bollinger"
          />
          <IndicatorCard
            label="布林中轨"
            value={analysis.bollinger.middle.toFixed(2)}
            sub="20 日均线"
          />
          <IndicatorCard
            label="布林下轨"
            value={analysis.bollinger.lower.toFixed(2)}
          />
          <IndicatorCard
            label="布林带宽"
            value={analysis.bollinger.width.toFixed(4)}
            signal={analysis.bollinger.width < 0.05 ? '收窄' : analysis.bollinger.width > 0.12 ? '扩张' : '正常'}
            signalColor={analysis.bollinger.width < 0.05 ? 'yellow' : 'gray'}
            explanationKey="bollinger"
          />
          <IndicatorCard
            label="ATR 波幅"
            value={analysis.atr.toFixed(2)}
            sub="平均真实波幅"
            explanationKey="atr"
          />
          <IndicatorCard
            label="日内振幅"
            value={`${adv.amplitude.toFixed(2)}%`}
            signal={adv.amplitude > 5 ? '高振幅' : adv.amplitude > 2 ? '适中' : '低振幅'}
            signalColor={adv.amplitude > 5 ? 'yellow' : adv.amplitude > 2 ? 'green' : 'gray'}
            explanationKey="amplitude"
          />
          {adv.volumeRatio !== null && (
            <IndicatorCard
              label="量比"
              value={adv.volumeRatio.toFixed(2)}
              signal={adv.volumeRatio > 1.5 ? '放量' : adv.volumeRatio < 0.5 ? '缩量' : '正常'}
              signalColor={adv.volumeRatio > 1.5 ? 'green' : adv.volumeRatio < 0.5 ? 'yellow' : 'gray'}
              explanationKey="volumeRatio"
            />
          )}
          <IndicatorCard
            label="换手率"
            value={market.turnoverAvailable === false ? '—' : `${market.turnover.toFixed(2)}%`}
            explanationKey="turnover"
          />
          <IndicatorCard
            label="成交量"
            value={formatVolume(market.volume)}
            sub={`${(market.volume / 10000).toFixed(0)} 万手`}
          />
        </div>
      </IndicatorSection>

      {/* ===== Risk Indicators ===== */}
      <IndicatorSection title="风险指标" icon="⚠️">
        <div className="grid grid-cols-2 gap-4">
          <IndicatorCard
            label="支撑位"
            value={analysis.support.toFixed(2)}
            sub="近期低点"
            signalColor="green"
            explanationKey="supportResistance"
          />
          <IndicatorCard
            label="阻力位"
            value={analysis.resistance.toFixed(2)}
            sub="近期高点"
            signalColor="red"
          />
          <IndicatorCard
            label="距涨停"
            value={`${adv.limitDistance.up.toFixed(2)}%`}
            signal={adv.limitDistance.up < 3 ? '接近' : '安全'}
            signalColor={adv.limitDistance.up < 3 ? 'red' : 'gray'}
            explanationKey="limitDistance"
          />
          <IndicatorCard
            label="距跌停"
            value={`${adv.limitDistance.down.toFixed(2)}%`}
            signal={adv.limitDistance.down < 3 ? '接近' : '安全'}
            signalColor={adv.limitDistance.down < 3 ? 'red' : 'gray'}
          />
        </div>
      </IndicatorSection>
    </div>
  );
}

function QuickStat({ label, value, highlight }: { label: string; value: string; highlight?: 'high' | 'low' }) {
  let color = 'text-[var(--color-text-primary)]';
  if (highlight === 'high') color = 'text-emerald-400';
  if (highlight === 'low') color = 'text-red-400';

  return (
    <div className="rounded-lg bg-[var(--color-bg-primary)] px-3 py-2 text-center">
      <div className="text-[11px] text-[var(--color-text-secondary)]">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Param({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-[var(--color-bg-primary)] px-3 py-2 text-center">
      <div className="text-[11px] text-[var(--color-text-secondary)]">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-[var(--color-text-primary)]">
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10px] text-[var(--color-text-secondary)]">{hint}</div>
      )}
    </div>
  );
}
