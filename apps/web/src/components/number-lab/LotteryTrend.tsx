'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/primitives';
import rawHistory from '@/data/lottery-history.json';
import { buildTrendRows, TREND_CONFIGS, type HistoryDraw } from '@/lib/lottery-trend';
import styles from './LotteryTrend.module.css';

const history = rawHistory as unknown as Record<'ssq' | 'dlt', HistoryDraw[]>;
const ball = (value: number) => String(value).padStart(2, '0');
const buttonClass = 'ui-button ui-button--secondary ui-button--sm';

export default function LotteryTrend() {
  const params = useSearchParams();
  const router = useRouter();
  const kind = params.get('kind') === 'dlt' ? 'dlt' : 'ssq';
  const config = TREND_CONFIGS[kind];
  const [showMisses, setShowMisses] = useState(true);
  const allRows = useMemo(() => buildTrendRows(history[kind], kind), [kind]);
  const years = useMemo(() => [...new Set(allRows.map(row => row.date.slice(0, 4)))].reverse(), [allRows]);
  const year = years.includes(params.get('year') ?? '') ? params.get('year')! : 'all';
  const filtered = useMemo(() => allRows.filter(row => year === 'all' || row.date.startsWith(year)), [allRows, year]);
  const requestedPage = Number(params.get('page') || 0);
  const page = Math.min(Math.max(Number.isSafeInteger(requestedPage) ? requestedPage : 0, 0), Math.ceil(filtered.length / 30) - 1);
  const end = filtered.length - page * 30;
  const start = Math.max(0, end - 30);
  const rows = filtered.slice(start, end);
  function href(next: { kind?: string; year?: string; page?: number }) {
    return `/number-lab/history?${new URLSearchParams({ kind: next.kind ?? kind, year: next.year ?? year, page: String(next.page ?? 0) })}`;
  }
  return <div className={`page-shell page-shell--wide ${styles.root}`}>
    <PageHeader title="历史开奖走势" description="双色球与大乐透 · 按期查看开奖号码及连续遗漏" actions={<Link className={buttonClass} href="/number-lab">返回随机实验室</Link>} />
    <div className={styles.toolbar}>
      <nav aria-label="彩种" className={styles.controls}>{(['ssq', 'dlt'] as const).map(value => <Link key={value} href={href({ kind: value, year: 'all' })} aria-current={kind === value ? 'page' : undefined} className={`ui-button ui-button--${kind === value ? 'primary' : 'secondary'} ui-button--md`}>{TREND_CONFIGS[value].name}</Link>)}</nav>
      <label className={styles.controls}>年份<select value={year} onChange={event => router.push(href({ year: event.target.value }), { scroll: false })}><option value="all">全部年份</option>{years.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className={styles.controls}><input type="checkbox" checked={showMisses} onChange={event => setShowMisses(event.target.checked)} />显示遗漏</label>
      <span className={styles.note}>圆点为开奖号码，其余数字为遗漏期数</span>
    </div>
    <div className={styles.toolbar}>
      {start > 0 ? <Link scroll={false} className={buttonClass} href={href({ page: page + 1 })}>← 更早 30 期</Link> : <button className={buttonClass} disabled>← 更早 30 期</button>}
      <span className={styles.note} aria-live="polite">第 {start + 1}–{end} 条 / 共 {filtered.length} 期</span>
      {page > 0 ? <Link scroll={false} className={buttonClass} href={href({ page: page - 1 })}>较新 30 期 →</Link> : <button className={buttonClass} disabled>较新 30 期 →</button>}
      <Link scroll={false} className={buttonClass} href={href({ year: 'all' })}>最新一期</Link>
    </div>
    <div className={styles.scroll} role="region" aria-label="历史开奖号码表，可左右滚动" tabIndex={0}>
      <table className={styles.table}>
        <caption>{config.name} · {rows[0].issue}–{rows.at(-1)!.issue} 期 · {rows[0].date} 至 {rows.at(-1)!.date}</caption>
        <thead><tr><th rowSpan={2} scope="col">期号</th><th rowSpan={2} scope="col">开奖日期</th><th rowSpan={2} scope="col">星期</th>{config.cuts.map((end, i) => <th scope="colgroup" key={end} colSpan={end - (i ? config.cuts[i - 1] : 0)} className={styles.boundary}>{['一区', '二区', '三区'][i]}</th>)}<th scope="colgroup" colSpan={config.back} className={styles.boundary}>{config.backLabel}</th>{['和值', '跨度', '区间比', '奇偶比'].map(label => <th scope="col" rowSpan={2} key={label}>{label}</th>)}</tr>
          <tr>{Array.from({ length: config.front + config.back }, (_, i) => { const number = i < config.front ? i + 1 : i - config.front + 1; return <th scope="col" key={i} className={i < config.front && config.cuts.some(cut => cut === number) ? styles.boundary : ''}>{ball(number)}</th>; })}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.issue}><th scope="row">{row.issue}</th><td>{row.date}</td><td>{'日一二三四五六'[new Date(`${row.date}T00:00:00Z`).getUTCDay()]}</td>
          {row.misses.map((miss, i) => { const back = i >= config.front; const number = back ? i - config.front + 1 : i + 1; const boundary = back ? number === config.back : config.cuts.some(cut => cut === number); return <td key={i} className={`${back ? styles.back : styles.front} ${boundary ? styles.boundary : ''}`} aria-label={`${back ? config.backLabel : kind === 'ssq' ? '红球' : '前区'}${ball(number)}，${miss === 0 ? '开出' : `遗漏${miss}期`}`}>
            {miss === 0 ? <span className={`${styles.ball} ${back ? styles.blue : ''}`}>{ball(number)}</span> : <span className={!showMisses ? styles.hidden : ''}>{miss}</span>}
          </td>; })}<td>{row.sum}</td><td>{row.span}</td><td>{row.zones}</td><td>{row.parity}</td></tr>)}</tbody>
      </table>
    </div>
    <p className={styles.note}>左右滚动查看完整号码。遗漏从首期连续累计，不随翻页或筛选重置；和值、跨度、区间比、奇偶比仅统计{kind === 'ssq' ? '红球' : '前区'}。</p>
    <p className={styles.note}>数据快照：2026-11-16 · {allRows.length} 期 · {allRows[0].date} 至 {allRows.at(-1)!.date}。当前不自动更新。</p>
    <p className={styles.note}>来源：<a href={`https://datachart.500.com/${kind}/history/history.shtml`} target="_blank" rel="noreferrer">500彩票网</a>，已与 <a href="https://github.com/Justdoitfor/my-lottery-data" target="_blank" rel="noreferrer">历史数据镜像</a>逐期交叉核对。</p>
  </div>;
}
