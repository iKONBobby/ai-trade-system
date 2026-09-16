'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Icon, PageHeader, Surface } from '@/components/ui/primitives';
import {
  generateAgentRun,
  LOTTERY_CONFIGS,
  type AgentRun,
  type ContextMode,
  type LotteryKind,
} from '@/lib/number-agent';

type FormState = {
  kind: LotteryKind;
  quantity: number;
  drawLabel: string;
  previous: string;
  hot: string;
  contextMode: ContextMode;
  contextText: string;
  inspiration: string;
};

const initialForm: FormState = {
  kind: 'ssq',
  quantity: 5,
  drawLabel: '',
  previous: '',
  hot: '',
  contextMode: 'calendar',
  contextText: '',
  inspiration: '',
};

const PIPELINE = [
  { code: 'P', title: '概率因子', detail: '历史同源 / 极端形态 / 热门碰撞 / 自我重复', tone: 'info' },
  { code: 'E', title: '环境因子', detail: '日历或自定义关键词，仅做 ±10% 可解释扰动', tone: 'positive' },
  { code: 'L', title: '灵感因子', detail: '文本映射 / 邻域扩散 / 加权抽样，不产生预测', tone: 'warning' },
] as const;

function formatBall(number: number) {
  return String(number).padStart(2, '0');
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export default function NumberAgentWorkspace() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const [error, setError] = useState('');
  const timers = useRef<number[]>([]);
  const config = useMemo(() => LOTTERY_CONFIGS[form.kind], [form.kind]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const update = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const runAgent = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setError('');
    setIsRunning(true);
    setActiveStep(0);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stepDelay = reducedMotion ? 0 : 220;
    [1, 2].forEach((step) => {
      timers.current.push(window.setTimeout(() => setActiveStep(step), stepDelay * step));
    });
    timers.current.push(window.setTimeout(() => {
      try {
        setRun(generateAgentRun(form));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '生成失败，请调整参数后重试。');
      } finally {
        setIsRunning(false);
        setActiveStep(3);
      }
    }, stepDelay * 3));
  };

  return (
    <div className="page-shell page-shell--wide number-lab">
      <PageHeader
        eyebrow="Random lab / local agent"
        title="三因子 · 随机实验室"
        description="把结构过滤、上下文扰动与灵感映射串成一条可回看的生成链。它是随机实验工具，不是预测器。"
        actions={<Badge tone="warning">纯娱乐 · 不提供中奖预测</Badge>}
      />

      <div className="number-lab__notice" role="note">
        <Icon name="shield" size={17} />
        <div><strong>每一组合法号码的理论中奖概率相同</strong><span>页面使用浏览器安全随机源；任何因子、评分和过滤都不会提高中奖概率，请勿据此增加投入。</span></div>
      </div>

      <div className="number-lab__layout">
        <div className="number-lab__controls">
          <Surface className="number-panel number-form">
            <div className="number-panel__head">
              <div><span className="section-label">Input</span><h2>实验参数</h2></div>
              <span className="number-panel__meta mono">SECURE RNG</span>
            </div>

            <div className="number-form__grid">
              <label className="number-field">
                <span>彩种</span>
                <select value={form.kind} onChange={(event) => update('kind', event.target.value as LotteryKind)}>
                  <option value="ssq">双色球 · 6 + 1</option>
                  <option value="dlt">大乐透 · 5 + 2</option>
                </select>
              </label>
              <label className="number-field">
                <span>生成组数</span>
                <select value={form.quantity} onChange={(event) => update('quantity', Number(event.target.value))}>
                  {[1, 3, 5, 8, 10].map((quantity) => <option key={quantity} value={quantity}>{quantity} 组</option>)}
                </select>
              </label>
              <label className="number-field">
                <span>期号（可选）</span>
                <input value={form.drawLabel} onChange={(event) => update('drawLabel', event.target.value)} placeholder="例如 2026108" inputMode="numeric" />
              </label>
              <label className="number-field">
                <span>上期{config.frontLabel}（可选）</span>
                <input value={form.previous} onChange={(event) => update('previous', event.target.value)} placeholder={`输入 ${config.frontCount} 个号码，以空格分隔`} inputMode="numeric" />
              </label>
              <label className="number-field number-field--wide">
                <span>热门号黑名单（可选）</span>
                <input value={form.hot} onChange={(event) => update('hot', event.target.value)} placeholder={`范围 01–${config.frontMax}，重复值自动去除`} inputMode="numeric" />
                <small>与黑名单重合达到 5 个时会被 P 因子淘汰。</small>
              </label>
            </div>
          </Surface>

          <Surface className="number-panel number-context">
            <div className="number-panel__head">
              <div><span className="section-label">Context</span><h2>环境与灵感</h2></div>
              <span className="number-panel__meta">本地输入</span>
            </div>

            <fieldset className="number-mode">
              <legend>环境模式</legend>
              <div className="number-segment">
                {([
                  ['balanced', '均衡'],
                  ['calendar', '日历'],
                  ['signal', '关键词'],
                ] as [ContextMode, string][]).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={form.contextMode === value} onClick={() => update('contextMode', value)}>{label}</button>
                ))}
              </div>
            </fieldset>

            {form.contextMode === 'signal' && (
              <label className="number-field number-field--wide">
                <span>环境关键词</span>
                <input value={form.contextText} onChange={(event) => update('contextText', event.target.value)} placeholder="例如：雨天、周末、纪念日" />
              </label>
            )}
            <label className="number-field number-field--wide">
              <span>灵感词（可选）</span>
              <input value={form.inspiration} onChange={(event) => update('inspiration', event.target.value)} placeholder="任意短语；只用于可追溯映射" />
              <small>不会联网扫描热搜、赛事或主播荐号，也不会生成“必出”“转运”等结论。</small>
            </label>
          </Surface>

          <section className="agent-pipeline" aria-labelledby="pipeline-title">
            <div className="number-panel__head">
              <div><span className="section-label">Pipeline</span><h2 id="pipeline-title">Agent 执行链</h2></div>
              <span className="number-panel__meta">P → E → L</span>
            </div>
            <ol>
              {PIPELINE.map((item, index) => {
                const status = activeStep > index ? 'done' : activeStep === index ? 'active' : 'idle';
                return (
                  <li key={item.code} className={`agent-step agent-step--${status}`}>
                    <span className={`agent-step__code agent-step__code--${item.tone}`}>{item.code}</span>
                    <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                    <span className="agent-step__state">{status === 'done' ? '完成' : status === 'active' ? '执行中' : '待执行'}</span>
                  </li>
                );
              })}
            </ol>
            <Button className="number-run" variant="primary" size="lg" onClick={runAgent} disabled={isRunning}>
              <Icon name={isRunning ? 'refresh' : 'spark'} size={17} />
              {isRunning ? '正在执行三因子…' : run ? '重新随机抽样' : '运行三因子 Agent'}
            </Button>
            {error && <div className="number-error" role="alert">{error}</div>}
          </section>
        </div>

        <section className="number-results" aria-labelledby="result-title" aria-busy={isRunning}>
          <div className="number-results__head">
            <div><span className="section-label">Output</span><h2 id="result-title">加权随机样本</h2></div>
            {run && <span className="number-results__time mono">{formatTime(run.generatedAt)}</span>}
          </div>

          {!run && !isRunning && (
            <div className="number-empty">
              <span className="number-empty__mark"><Icon name="nodes" size={25} /></span>
              <h3>等待第一次运行</h3>
              <p>填写左侧参数并运行 Agent。输出会展示号码、形态指标、拥挤度和未被过滤的原因。</p>
            </div>
          )}

          {isRunning && (
            <div className="number-running" role="status" aria-live="polite">
              <span className="number-running__spinner" />
              <strong>正在执行第 {Math.min(activeStep + 1, 3)} / 3 层</strong>
              <span>只在本机完成计算，不请求外部荐号或历史预测服务。</span>
            </div>
          )}

          {run && !isRunning && (
            <div aria-live="polite">
              <div className="number-run-summary">
                <span><b className="num">{run.picks.length}</b> 组样本</span>
                <span><b className="num">{run.rejected}</b> 次过滤</span>
                <span>{run.contextSummary}</span>
              </div>
              <div className="number-picks">
                {run.picks.map((pick, index) => (
                  <article className="number-pick" key={pick.id}>
                    <div className="number-pick__index mono">{String(index + 1).padStart(2, '0')}</div>
                    <div className="number-pick__content">
                      <div className="number-balls" aria-label={`第 ${index + 1} 组：${[...pick.front, ...pick.back].join('、')}`}>
                        <span className="number-balls__group">
                          {pick.front.map((number) => <span className="number-ball number-ball--front num" key={`front-${number}`}>{formatBall(number)}</span>)}
                        </span>
                        <span className="number-balls__divider" aria-hidden="true" />
                        <span className="number-balls__group">
                          {pick.back.map((number) => <span className="number-ball number-ball--back num" key={`back-${number}`}>{formatBall(number)}</span>)}
                        </span>
                      </div>
                      <div className="number-pick__metrics">
                        <span>奇偶 <b className="num">{pick.shape.odd}:{pick.shape.even}</b></span>
                        <span>大小 <b className="num">{pick.shape.high}:{pick.shape.low}</b></span>
                        <span>和值 <b className="num">{pick.shape.sum}</b></span>
                        <span>跨度 <b className="num">{pick.shape.span}</b></span>
                      </div>
                      <p>{pick.reason}</p>
                      <small>{pick.inspirationTrace}；映射仅改变本次抽样权重。</small>
                    </div>
                    <div className="number-pick__score">
                      <span>拥挤度</span>
                      <strong className="num">{pick.crowdingScore}</strong>
                      <small>越低越分散</small>
                    </div>
                  </article>
                ))}
              </div>
              <p className="number-results__footnote">结果不会保存为预测记录；刷新页面即可清除。理性娱乐，量力而行。</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

