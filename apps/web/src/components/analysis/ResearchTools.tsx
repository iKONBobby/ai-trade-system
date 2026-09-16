'use client';

import { useEffect, useMemo, useState } from 'react';
import type { KlinePeriod } from '@trade/shared';
import { Badge, Button, Surface } from '@/components/ui/primitives';
import {
  evaluateAlert,
  loadAlerts,
  loadLevels,
  loadNote,
  loadTemplates,
  saveAlerts,
  saveLevels,
  saveNote,
  saveTemplates,
  type AlertCondition,
  type AlertMetric,
  type AlertOperator,
  type AnalysisTemplate,
  type CompositeAlert,
  type DrawingKind,
  type DrawingLevel,
} from '@/lib/analysis-persistence';
import type { TimeframeSnapshot } from '@/lib/technical-workspace';
import type { SecondaryIndicator } from './TechnicalChart';

interface ResearchToolsProps {
  code: string;
  currentPrice: number;
  period: KlinePeriod;
  secondary: SecondaryIndicator;
  summary: TimeframeSnapshot | null;
  levels: DrawingLevel[];
  showBenchmark: boolean;
  onLevels: (levels: DrawingLevel[]) => void;
  onBenchmark: (show: boolean) => void;
  onApplyTemplate: (template: AnalysisTemplate) => void;
}

const METRICS: Array<{ value: AlertMetric; label: string }> = [
  { value: 'price', label: '价格' },
  { value: 'rsi', label: 'RSI' },
  { value: 'volumeRatio', label: '量比' },
  { value: 'macdHistogram', label: 'MACD 柱' },
];

export default function ResearchTools(props: ResearchToolsProps) {
  const { code, currentPrice, period, secondary, summary, levels, showBenchmark, onLevels, onBenchmark, onApplyTemplate } = props;
  const [note, setNote] = useState('');
  const [noteStatus, setNoteStatus] = useState('已同步');
  const [levelPrice, setLevelPrice] = useState(String(currentPrice.toFixed(2)));
  const [levelLabel, setLevelLabel] = useState('观察位');
  const [levelKind, setLevelKind] = useState<DrawingKind>('note');
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<AnalysisTemplate[]>([]);
  const [alerts, setAlerts] = useState<CompositeAlert[]>([]);
  const [alertName, setAlertName] = useState('放量突破');
  const [conditions, setConditions] = useState<AlertCondition[]>(() => defaultConditions(currentPrice, summary));

  useEffect(() => {
    setNote(loadNote(code));
    onLevels(loadLevels(code));
    setLevelPrice(String(currentPrice.toFixed(2)));
    setNoteStatus('已同步');
  }, [code, currentPrice, onLevels]);

  useEffect(() => {
    setTemplates(loadTemplates());
    setAlerts(loadAlerts());
  }, []);

  useEffect(() => {
    setNoteStatus('保存中…');
    const timeout = setTimeout(() => {
      saveNote(code, note);
      setNoteStatus('已自动保存');
    }, 500);
    return () => clearTimeout(timeout);
  }, [code, note]);

  const values = useMemo(() => ({
    price: currentPrice,
    rsi: summary?.rsi,
    volumeRatio: summary?.volumeRatio,
    macdHistogram: summary?.macdHistogram,
  }), [currentPrice, summary]);

  const currentAlerts = alerts.filter((alert) => alert.code === code);

  const addLevel = () => {
    const price = Number(levelPrice);
    if (!Number.isFinite(price) || price <= 0 || !levelLabel.trim()) return;
    const next = [...levels, { id: makeId(), price, label: levelLabel.trim(), kind: levelKind }];
    onLevels(next);
    saveLevels(code, next);
    setLevelLabel('观察位');
  };

  const removeLevel = (id: string) => {
    const next = levels.filter((item) => item.id !== id);
    onLevels(next);
    saveLevels(code, next);
  };

  const saveView = () => {
    if (!templateName.trim()) return;
    const next: AnalysisTemplate[] = [{
      id: makeId(), name: templateName.trim(), period, secondary, showBenchmark,
      levels: levels.map((item) => ({ ...item })), createdAt: new Date().toISOString(),
    }, ...templates].slice(0, 12);
    setTemplates(next);
    saveTemplates(next);
    setTemplateName('');
  };

  const deleteTemplate = (id: string) => {
    const next = templates.filter((item) => item.id !== id);
    setTemplates(next);
    saveTemplates(next);
  };

  const createAlert = () => {
    const valid = conditions.filter((item) => Number.isFinite(item.value));
    if (!alertName.trim() || valid.length === 0) return;
    const next: CompositeAlert[] = [{
      id: makeId(), code, period, name: alertName.trim(), conditions: valid,
      enabled: true, createdAt: new Date().toISOString(),
    }, ...alerts].slice(0, 30);
    setAlerts(next);
    saveAlerts(next);
  };

  const patchAlert = (id: string, patch: Partial<CompositeAlert>) => {
    const next = alerts.map((item) => item.id === id ? { ...item, ...patch } : item);
    setAlerts(next);
    saveAlerts(next);
  };

  const deleteAlert = (id: string) => {
    const next = alerts.filter((item) => item.id !== id);
    setAlerts(next);
    saveAlerts(next);
  };

  return (
    <section className="analysis-research" aria-labelledby="research-tools-title">
      <div className="analysis-section-heading">
        <div><span className="section-label">Research kit</span><h2 id="research-tools-title">研究工具</h2></div>
        <p>笔记、标注、模板和提醒仅保存在当前浏览器。</p>
      </div>

      <div className="analysis-research__grid">
        <Surface className="research-card research-card--note">
          <div className="research-card__head"><div><span className="section-label">Notebook</span><h3>研究笔记</h3></div><span className="research-save-state" role="status">{noteStatus}</span></div>
          <label className="research-field research-field--grow">
            <span>关于 {code} 的观察</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录交易逻辑、待确认条件和判断失效点…" />
          </label>
        </Surface>

        <Surface className="research-card">
          <div className="research-card__head"><div><span className="section-label">Levels</span><h3>价格标注</h3></div><Badge tone="neutral">{levels.length} 条</Badge></div>
          <div className="research-level-form">
            <label className="research-field"><span>价格</span><input inputMode="decimal" value={levelPrice} onChange={(event) => setLevelPrice(event.target.value)} /></label>
            <label className="research-field"><span>类型</span><select value={levelKind} onChange={(event) => setLevelKind(event.target.value as DrawingKind)}><option value="support">支撑</option><option value="resistance">阻力</option><option value="note">观察</option></select></label>
            <label className="research-field research-field--wide"><span>标签</span><input value={levelLabel} onChange={(event) => setLevelLabel(event.target.value)} /></label>
            <Button size="sm" variant="secondary" type="button" onClick={addLevel}>添加到图表</Button>
          </div>
          <div className="research-chip-list" aria-label="已有价格标注">
            {levels.length === 0 && <span className="research-empty">还没有手动标注</span>}
            {levels.map((item) => <span key={item.id} className={`research-chip research-chip--${item.kind}`}><b>{item.label}</b><span className="num">{item.price.toFixed(2)}</span><button type="button" onClick={() => removeLevel(item.id)} aria-label={`移除 ${item.label} ${item.price.toFixed(2)}`}>×</button></span>)}
          </div>
          <label className="research-toggle"><input type="checkbox" checked={showBenchmark} onChange={(event) => onBenchmark(event.target.checked)} /><span><strong>沪深 300 对比</strong><small>以 510300 ETF 为可交易代理，归一化为区间涨跌幅</small></span></label>
        </Surface>

        <Surface className="research-card">
          <div className="research-card__head"><div><span className="section-label">Templates</span><h3>视图模板</h3></div><Badge tone="neutral">{templates.length}</Badge></div>
          <div className="research-inline-form"><label className="research-field"><span>模板名称</span><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="例如：日线趋势" /></label><Button size="sm" variant="secondary" type="button" onClick={saveView}>保存当前视图</Button></div>
          <div className="research-list">
            {templates.length === 0 && <span className="research-empty">保存后可一键恢复周期、指标、基准与画线</span>}
            {templates.map((item) => <div className="research-list__item" key={item.id}><button type="button" className="research-list__main" onClick={() => onApplyTemplate(item)}><strong>{item.name}</strong><small>{periodLabel(item.period)} · {item.secondary.toUpperCase()} · {item.levels.length} 条标注</small></button><button type="button" className="research-list__delete" onClick={() => deleteTemplate(item.id)} aria-label={`删除模板 ${item.name}`}>删除</button></div>)}
          </div>
        </Surface>
      </div>

      <Surface className="research-card research-alerts">
        <div className="research-card__head"><div><span className="section-label">Local alerts</span><h3>组合提醒</h3></div><span className="research-save-state">页面打开期间实时核对 · 暂无服务器推送</span></div>
        <div className="research-alert-builder">
          <label className="research-field"><span>提醒名称</span><input value={alertName} onChange={(event) => setAlertName(event.target.value)} /></label>
          <div className="research-condition-list">
            {conditions.map((condition, index) => <ConditionRow key={condition.id} condition={condition} index={index} onChange={(next) => setConditions((current) => current.map((item) => item.id === next.id ? next : item))} onRemove={() => setConditions((current) => current.filter((item) => item.id !== condition.id))} />)}
            <button type="button" className="research-add-condition" disabled={conditions.length >= 4} onClick={() => setConditions((current) => [...current, { id: makeId(), metric: 'rsi', operator: 'gt', value: 50 }])}>+ 增加条件</button>
          </div>
          <Button type="button" variant="primary" onClick={createAlert}>创建组合提醒</Button>
        </div>
        <div className="research-alert-list">
          {currentAlerts.length === 0 && <span className="research-empty">当前股票还没有提醒。所有条件同时满足时才会触发。</span>}
          {currentAlerts.map((alert) => {
            const triggered = evaluateAlert(alert, values);
            return <article key={alert.id} className={`research-alert ${triggered ? 'research-alert--triggered' : ''}`}><div><div className="research-alert__title"><ToneDot active={triggered} /><strong>{alert.name}</strong><Badge tone={triggered ? 'warning' : 'neutral'}>{triggered ? '条件满足' : alert.enabled ? '监控中' : '已暂停'}</Badge></div><p>{alert.conditions.map(conditionLabel).join(' 且 ')}</p><small>{periodLabel(alert.period)} · {alert.code}</small></div><div className="research-alert__actions"><button type="button" onClick={() => patchAlert(alert.id, { enabled: !alert.enabled })}>{alert.enabled ? '暂停' : '启用'}</button><button type="button" onClick={() => deleteAlert(alert.id)}>删除</button></div></article>;
          })}
        </div>
      </Surface>
    </section>
  );
}

function ConditionRow({ condition, index, onChange, onRemove }: { condition: AlertCondition; index: number; onChange: (value: AlertCondition) => void; onRemove: () => void }) {
  return <div className="research-condition"><span className="research-condition__join">{index === 0 ? '当' : '且'}</span><label><span className="sr-only">指标</span><select value={condition.metric} onChange={(event) => onChange({ ...condition, metric: event.target.value as AlertMetric })}>{METRICS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span className="sr-only">比较方式</span><select value={condition.operator} onChange={(event) => onChange({ ...condition, operator: event.target.value as AlertOperator })}><option value="gt">大于</option><option value="lt">小于</option></select></label><label><span className="sr-only">阈值</span><input inputMode="decimal" value={condition.value} onChange={(event) => onChange({ ...condition, value: Number(event.target.value) })} /></label><button type="button" onClick={onRemove} aria-label={`删除第 ${index + 1} 个条件`}>移除</button></div>;
}

function defaultConditions(price: number, summary: TimeframeSnapshot | null): AlertCondition[] {
  return [
    { id: makeId(), metric: 'price', operator: 'gt', value: Number((summary?.resistance ?? price * 1.03).toFixed(2)) },
    { id: makeId(), metric: 'volumeRatio', operator: 'gt', value: 1.2 },
  ];
}

function conditionLabel(condition: AlertCondition) {
  const metric = METRICS.find((item) => item.value === condition.metric)?.label ?? condition.metric;
  return `${metric}${condition.operator === 'gt' ? ' > ' : ' < '}${condition.value}`;
}

function ToneDot({ active }: { active: boolean }) { return <i className={`research-alert-dot ${active ? 'research-alert-dot--active' : ''}`} aria-hidden="true" />; }
function periodLabel(period: KlinePeriod) { return ({ '5min': '5分', '15min': '15分', '30min': '30分', '60min': '60分', daily: '日线', weekly: '周线', monthly: '月线' })[period]; }
function makeId() { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
