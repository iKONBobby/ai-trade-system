'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LotteryHistoryResponse } from '@trade/shared';
import { Badge, Button, Icon, PageHeader, Surface } from '@/components/ui/primitives';
import Modal from '@/components/ui/Modal';
import { fetchLotteryHistory } from '@/lib/api';
import {
  analyzeEnvironmentLayer,
  analyzeInspirationLayer,
  analyzeProbabilityLayer,
  formatAgentRunForClipboard,
  generateAgentRun,
  LOTTERY_CONFIGS,
  type AgentRun,
  type ContextMode,
  type GenerationMode,
  type LayerTrace,
  type LotteryKind,
} from '@/lib/number-agent';
import {
  clearNumberRuns,
  formatStoredNumberRunForClipboard,
  loadNumberRuns,
  priorPicksForKind,
  storeNumberRun,
  type StoredNumberRun,
} from '@/lib/number-lab-history';

type FormState = {
  kind: LotteryKind;
  mode: GenerationMode;
  quantity: number;
  drawLabel: string;
  previous: string;
  hot: string;
  contextMode: ContextMode;
  contextText: string;
  inspiration: string;
};

const initialForm: FormState = {
  kind: 'ssq', mode: 'fair', quantity: 5, drawLabel: '', previous: '', hot: '',
  contextMode: 'calendar', contextText: '', inspiration: '',
};

const PIPELINE = [
  { code: 'P', title: '概率层', detail: '真实历史 / 原样组合 / 上期重号 / 跨批次碰撞', tone: 'info' },
  { code: 'E', title: '环境层', detail: '日历或自定义关键词，仅做可解释的实验权重', tone: 'positive' },
  { code: 'L', title: '灵感层', detail: '本地文本映射与邻域扩散，不联网、不预测', tone: 'warning' },
] as const;

function formatBall(number: number) { return String(number).padStart(2, '0'); }
function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value));
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value));
}
function nextFrame() { return new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); }

async function writeClipboard(text: string): Promise<void> {
  const fallbackCopy = () => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    try {
      textarea.select();
      if (!document.execCommand('copy')) throw new Error('copy command failed');
    } finally {
      textarea.remove();
    }
  };
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); } catch { fallbackCopy(); }
  } else {
    fallbackCopy();
  }
}

export default function NumberAgentWorkspace() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const [traces, setTraces] = useState<LayerTrace[]>([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<LotteryHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [storedRuns, setStoredRuns] = useState<StoredNumberRun[]>([]);
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCopyState, setHistoryCopyState] = useState<{ id: string; status: 'copying' | 'copied' | 'error' } | null>(null);
  const copyResetTimer = useRef<number | null>(null);
  const config = useMemo(() => LOTTERY_CONFIGS[form.kind], [form.kind]);
  const priorPicks = useMemo(() => priorPicksForKind(storedRuns, form.kind), [storedRuns, form.kind]);
  const sameKindRuns = useMemo(() => storedRuns.filter((item) => item.kind === form.kind), [storedRuns, form.kind]);

  useEffect(() => {
    setStoredRuns(loadNumberRuns());
    return () => {
      if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
    };
  }, []);

  const loadHistory = useCallback(async (kind: LotteryKind, refresh = false, signal?: AbortSignal) => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const result = await fetchLotteryHistory(kind, { limit: 100, refresh, signal });
      setHistory(result);
      return result;
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return null;
      setHistoryError(caught instanceof Error ? caught.message : '历史开奖数据加载失败');
      return null;
    } finally {
      if (!signal?.aborted) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setHistory(null);
    void loadHistory(form.kind, false, controller.signal);
    return () => controller.abort();
  }, [form.kind, loadHistory]);

  const update = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const changeKind = (kind: LotteryKind) => {
    setRun(null); setTraces([]); setActiveStep(-1); setCopyState('idle');
    setForm((current) => ({ ...current, kind, previous: '', hot: '' }));
  };

  const runAgent = async () => {
    if (form.mode === 'factor' && (!history || history.kind !== form.kind)) {
      setError('因子实验需要先加载真实历史数据；也可以切换到公平随机模式。');
      return;
    }
    setError(''); setRun(null); setTraces([]); setIsRunning(true); setActiveStep(0); setCopyState('idle');
    try {
      await nextFrame();
      const probability = analyzeProbabilityLayer(form, history?.kind === form.kind ? history.draws : [], priorPicks);
      setTraces([probability.trace]); setActiveStep(1);
      await nextFrame();
      const environment = analyzeEnvironmentLayer(form);
      setTraces((current) => [...current, environment.trace]); setActiveStep(2);
      await nextFrame();
      const inspiration = analyzeInspirationLayer(form);
      const completed = [probability.trace, environment.trace, inspiration.trace];
      setTraces(completed);
      await nextFrame();
      const next = generateAgentRun(form, { probability, environment, inspiration });
      setRun(next);
      setStoredRuns(storeNumberRun(next));
      setActiveStep(3);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '生成失败，请调整参数后重试。');
      setActiveStep(-1);
    } finally {
      setIsRunning(false);
    }
  };

  const clearHistory = () => {
    if (!window.confirm('清空本机保存的号码实验记录？此操作无法撤销。')) return;
    clearNumberRuns(); setStoredRuns([]); setHistoryOpen(false); setHistoryCopyState(null);
  };

  const copyRun = async () => {
    if (!run || copyState === 'copying') return;
    setCopyState('copying');
    try {
      await writeClipboard(formatAgentRunForClipboard(run));
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
    copyResetTimer.current = window.setTimeout(() => setCopyState('idle'), 2500);
  };

  const copyStoredRun = async (stored: StoredNumberRun) => {
    setHistoryCopyState({ id: stored.id, status: 'copying' });
    try {
      await writeClipboard(formatStoredNumberRunForClipboard(stored));
      setHistoryCopyState({ id: stored.id, status: 'copied' });
    } catch {
      setHistoryCopyState({ id: stored.id, status: 'error' });
    }
    if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
    copyResetTimer.current = window.setTimeout(() => setHistoryCopyState(null), 2500);
  };

  const factorUnavailable = form.mode === 'factor' && (!history || history.kind !== form.kind);

  return (
    <div className="page-shell page-shell--wide number-lab">
      <PageHeader
        eyebrow="Random lab / evidence trail"
        title="三因子 · 随机实验室"
        description="真实历史只用于实验过滤与回溯；公平随机模式保持所有合法组合等概率。"
        actions={<Badge tone="warning">纯娱乐 · 不提供中奖预测</Badge>}
      />

      <div className="number-lab__notice" role="note">
        <Icon name="shield" size={17} />
        <div><strong>历史分析不能改变下一期开奖的理论概率</strong><span>因子模式会改变样本分布，仅用于研究“过滤规则如何影响输出”；请勿据此增加投入。</span></div>
      </div>

      <section className={`number-source number-source--${historyError ? 'error' : history?.stale ? 'stale' : history ? 'ready' : 'loading'}`} aria-live="polite" aria-atomic="true">
        <span className="number-source__dot" aria-hidden="true" />
        <div>
          <strong>{historyLoading ? '正在同步真实历史数据' : historyError ? '历史数据暂时不可用' : history ? `${history.sourceLabel} · ${history.draws.length} 期` : '等待历史数据'}</strong>
          <span>{history ? `最新 ${history.draws[0]?.issue ?? '—'} · ${history.draws[0]?.drawDate || '日期未知'} · ${history.cached ? '缓存读取' : '刚刚同步'}${history.stale ? '（陈旧缓存）' : ''}` : historyError || '连接服务端数据源中…'}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void loadHistory(form.kind, true)} disabled={historyLoading}><Icon name="refresh" size={15} />重新同步</Button>
      </section>

      <div className="number-lab__layout">
        <div className="number-lab__controls">
          <Surface className="number-panel number-form">
            <div className="number-panel__head"><div><span className="section-label">Mode & input</span><h2>实验参数</h2></div><span className="number-panel__meta mono">SECURE RNG</span></div>

            <fieldset className="number-mode number-mode--primary">
              <legend>生成模式</legend>
              <div className="number-segment number-segment--two">
                <button type="button" aria-pressed={form.mode === 'fair'} onClick={() => update('mode', 'fair')}><strong>公平随机</strong><small>所有合法组合等权</small></button>
                <button type="button" aria-pressed={form.mode === 'factor'} onClick={() => update('mode', 'factor')}><strong>因子实验</strong><small>历史过滤 + P/E/L 权重</small></button>
              </div>
              <p>{form.mode === 'fair' ? '不读取历史来筛号，也不使用形态、环境或灵感权重。' : '输出分布会被规则改变，因此不能称为公平随机，也不代表更容易中奖。'}</p>
            </fieldset>

            <div className="number-form__grid">
              <label className="number-field"><span>彩种</span><select value={form.kind} onChange={(event) => changeKind(event.target.value as LotteryKind)}><option value="ssq">双色球 · 6 + 1</option><option value="dlt">大乐透 · 5 + 2</option></select></label>
              <label className="number-field"><span>生成组数</span><select value={form.quantity} onChange={(event) => update('quantity', Number(event.target.value))}>{[1, 3, 5, 8, 10].map((quantity) => <option key={quantity} value={quantity}>{quantity} 组</option>)}</select></label>
              {form.mode === 'factor' && <>
                <label className="number-field"><span>期号（权重追踪）</span><input value={form.drawLabel} onChange={(event) => update('drawLabel', event.target.value)} placeholder="例如 2026108" inputMode="numeric" /></label>
                <label className="number-field"><span>覆盖上期{config.frontLabel}（可选）</span><input value={form.previous} onChange={(event) => update('previous', event.target.value)} placeholder={`留空则使用最新真实开奖`} inputMode="numeric" /></label>
                <label className="number-field number-field--wide"><span>热门号黑名单（可选）</span><input value={form.hot} onChange={(event) => update('hot', event.target.value)} placeholder={`范围 01–${config.frontMax}，重复值自动去除`} inputMode="numeric" /><small>这是手动反拥挤过滤，不会提高中奖概率。</small></label>
              </>}
            </div>
          </Surface>

          {form.mode === 'factor' && <Surface className="number-panel number-context">
            <div className="number-panel__head"><div><span className="section-label">Experimental weights</span><h2>环境与灵感</h2></div><span className="number-panel__meta">本地映射</span></div>
            <fieldset className="number-mode"><legend>环境模式</legend><div className="number-segment">{([['balanced', '均衡'], ['calendar', '日历'], ['signal', '关键词']] as [ContextMode, string][]).map(([value, label]) => <button key={value} type="button" aria-pressed={form.contextMode === value} onClick={() => update('contextMode', value)}>{label}</button>)}</div></fieldset>
            {form.contextMode === 'signal' && <label className="number-field number-field--wide"><span>环境关键词</span><input value={form.contextText} onChange={(event) => update('contextText', event.target.value)} placeholder="例如：雨天、周末、纪念日" /></label>}
            <label className="number-field number-field--wide"><span>灵感词（可选）</span><input value={form.inspiration} onChange={(event) => update('inspiration', event.target.value)} placeholder="任意短语；只用于可追溯映射" /><small>不会联网扫描热搜、赛事或荐号内容。</small></label>
          </Surface>}

          <Surface className="number-panel number-memory">
            <div><span className="section-label">Cross batch</span><h2>跨批次记录</h2></div>
            <div className="number-memory__stats"><strong className="num">{sameKindRuns.length}</strong><span>次运行</span><strong className="num">{priorPicks.length}</strong><span>组号码</span></div>
            <p>{sameKindRuns[0] ? `最近记录 ${formatTime(sameKindRuns[0].createdAt)}。因子模式会避开与这些记录高度重合的样本。` : '运行结果会保存在当前浏览器，最多保留 50 个批次。'}</p>
            {storedRuns.length > 0 && <div className="number-memory__actions">
              <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}><Icon name="clock" size={15} />查看历史记录</Button>
              <Button variant="ghost" size="sm" onClick={clearHistory}>清空本地记录</Button>
            </div>}
          </Surface>

          <section className="agent-pipeline" aria-labelledby="pipeline-title">
            <div className="number-panel__head"><div><span className="section-label">Execution trace</span><h2 id="pipeline-title">Agent 执行链</h2></div><span className="number-panel__meta">P → E → L</span></div>
            <ol>{PIPELINE.map((item, index) => {
              const trace = traces.find((entry) => entry.code === item.code);
              const status = trace ? 'done' : activeStep === index ? 'active' : 'idle';
              return <li key={item.code} className={`agent-step agent-step--${status}`}>
                <span className={`agent-step__code agent-step__code--${item.tone}`}>{item.code}</span>
                <span><strong>{item.title}</strong><small>{trace?.summary ?? item.detail}</small>{trace && <em>{trace.metrics.join(' · ')}</em>}</span>
                <span className="agent-step__state">{trace?.status === 'skipped' ? '跳过' : status === 'done' ? '完成' : status === 'active' ? '执行中' : '待执行'}</span>
              </li>;
            })}</ol>
            <Button className="number-run" variant="primary" size="lg" onClick={() => void runAgent()} disabled={isRunning || factorUnavailable}>
              <Icon name={isRunning ? 'refresh' : 'spark'} size={17} />
              {isRunning ? `正在执行第 ${Math.min(activeStep + 1, 3)} / 3 层` : factorUnavailable ? '等待真实历史数据' : run ? '重新随机抽样' : form.mode === 'fair' ? '运行公平随机' : '运行因子实验'}
            </Button>
            {error && <div className="number-error" role="alert">{error}</div>}
          </section>
        </div>

        <section className="number-results" aria-labelledby="result-title" aria-busy={isRunning}>
          <div className="number-results__head">
            <div><span className="section-label">Output</span><h2 id="result-title">{(run?.mode ?? form.mode) === 'fair' ? '公平随机样本' : '因子实验样本'}</h2></div>
            {run && <div className="number-results__actions">
              <span className="number-results__time mono">{formatTime(run.generatedAt)}</span>
              <Button variant="secondary" size="sm" onClick={() => void copyRun()} disabled={copyState === 'copying'}>
                <Icon name={copyState === 'copied' ? 'check' : 'copy'} size={15} />
                {copyState === 'copying' ? '正在复制…' : copyState === 'copied' ? `已复制 ${run.picks.length} 组` : copyState === 'error' ? '复制失败，请重试' : `一键复制 ${run.picks.length} 组`}
              </Button>
            </div>}
          </div>
          {!run && !isRunning && <div className="number-empty"><span className="number-empty__mark"><Icon name="nodes" size={25} /></span><h3>等待第一次运行</h3><p>{form.mode === 'fair' ? '安全随机源会对所有合法组合等权抽样。' : 'P 层会读取真实历史与本地批次，E/L 层再生成可审计的实验权重。'}</p></div>}
          {isRunning && <div className="number-running" role="status" aria-live="polite"><span className="number-running__spinner" /><strong>正在执行 {PIPELINE[Math.min(activeStep, 2)]?.title}</strong><span>每层完成后会写入上方轨迹；这里没有预设时长的演示动画。</span></div>}
          {run && !isRunning && <div aria-live="polite">
            <div className="number-run-summary"><span><b className="num">{run.picks.length}</b> 组样本</span><span><b className="num">{run.rejected}</b> 次过滤</span><span>{run.contextSummary}</span></div>
            {run.mode === 'factor' && <div className="number-rejections"><span>历史原样 {run.rejectionBreakdown.history}</span><span>上期重号 {run.rejectionBreakdown.latest}</span><span>结构 {run.rejectionBreakdown.structure}</span><span>拥挤 {run.rejectionBreakdown.crowding}</span><span>跨批次 {run.rejectionBreakdown.batch}</span></div>}
            <div className="number-picks">{run.picks.map((pick, index) => <article className="number-pick" key={pick.id}>
              <div className="number-pick__index mono">{String(index + 1).padStart(2, '0')}</div>
              <div className="number-pick__content">
                <div className="number-balls" aria-label={`第 ${index + 1} 组：${[...pick.front, ...pick.back].join('、')}`}><span className="number-balls__group">{pick.front.map((number) => <span className="number-ball number-ball--front num" key={`front-${number}`}>{formatBall(number)}</span>)}</span><span className="number-balls__divider" aria-hidden="true" /><span className="number-balls__group">{pick.back.map((number) => <span className="number-ball number-ball--back num" key={`back-${number}`}>{formatBall(number)}</span>)}</span></div>
                <div className="number-pick__metrics"><span>奇偶 <b className="num">{pick.shape.odd}:{pick.shape.even}</b></span><span>大小 <b className="num">{pick.shape.high}:{pick.shape.low}</b></span><span>和值 <b className="num">{pick.shape.sum}</b></span><span>跨度 <b className="num">{pick.shape.span}</b></span></div>
                <p>{pick.reason}</p><small>{pick.inspirationTrace}</small>
              </div>
              <div className="number-pick__score"><span>拥挤度</span><strong className="num">{pick.crowdingScore}</strong><small>描述指标</small></div>
            </article>)}</div>
            <p className="number-results__footnote">本次结果已保存在当前浏览器，供后续因子实验做跨批次去重。记录不会上传；公平随机模式不会使用它筛号。</p>
          </div>}
        </section>
      </div>

      <Modal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title="生成历史记录"
        description={`当前浏览器共保存 ${storedRuns.length} 个批次，最新记录排在前面。`}
        size="lg"
        contentClassName="number-history-dialog"
        footer={<>
          <Button variant="danger" size="sm" onClick={clearHistory} disabled={storedRuns.length === 0}>清空全部记录</Button>
          <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(false)}>关闭</Button>
        </>}
      >
        {storedRuns.length === 0 ? <div className="number-history-empty"><Icon name="clock" size={24} /><strong>还没有生成记录</strong><span>完成一次随机生成后，号码会保存在当前浏览器。</span></div> :
          <div className="number-history-list">
            {storedRuns.map((stored, runIndex) => {
              const runCopy = historyCopyState?.id === stored.id ? historyCopyState.status : 'idle';
              const storedConfig = LOTTERY_CONFIGS[stored.kind];
              return <article className="number-history-run" key={stored.id}>
                <header className="number-history-run__head">
                  <div><span className="number-history-run__index mono">#{String(storedRuns.length - runIndex).padStart(2, '0')}</span><strong>{storedConfig.name} · {stored.mode === 'fair' ? '公平随机' : '因子实验'}</strong><time dateTime={stored.createdAt}>{formatDateTime(stored.createdAt)}</time></div>
                  <Button variant="ghost" size="sm" onClick={() => void copyStoredRun(stored)} disabled={runCopy === 'copying'}>
                    <Icon name={runCopy === 'copied' ? 'check' : 'copy'} size={14} />
                    {runCopy === 'copying' ? '复制中…' : runCopy === 'copied' ? '已复制' : runCopy === 'error' ? '重试复制' : `复制 ${stored.picks.length} 组`}
                  </Button>
                </header>
                <ol className="number-history-picks">
                  {stored.picks.map((pick, pickIndex) => <li key={`${stored.id}-${pickIndex}`}>
                    <span className="mono">{String(pickIndex + 1).padStart(2, '0')}</span>
                    <div aria-label={`第 ${pickIndex + 1} 组：${pick.front.join('、')}，${storedConfig.backLabel} ${pick.back.join('、')}`}>
                      <span className="number-history-picks__front num">{pick.front.map(formatBall).join(' ')}</span>
                      <span className="number-history-picks__divider" aria-hidden="true">+</span>
                      <span className="number-history-picks__back num">{pick.back.map(formatBall).join(' ')}</span>
                    </div>
                  </li>)}
                </ol>
              </article>;
            })}
          </div>}
      </Modal>
    </div>
  );
}
