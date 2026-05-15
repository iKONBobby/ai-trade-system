// Grounding: 把 market.ts + indicators 输出格式化注入 agent prompt.
//
// formatPriceBlock + formatIndicatorsBlock 复用 ai-analyzer.ts buildPrompt() 的格式
// (生产已跑过). 抽到这里成为 swarm + single AI 共享.

import type { MarketData, AnalysisResult, AgentId, AgentOutput } from '@trade/shared';
import type { GroundingPayload } from './types.js';

// ---- Price block ----

export function formatPriceBlock(market: MarketData): string {
  return [
    '## 股票信息',
    `名称: ${market.name} (${market.code})`,
    `现价: ${market.price.toFixed(2)} 元`,
    `涨跌幅: ${market.change.toFixed(2)}%`,
    `今开: ${market.open.toFixed(2)}  最高: ${market.high.toFixed(2)}  最低: ${market.low.toFixed(2)}  昨收: ${market.preClose.toFixed(2)}`,
    `换手率: ${market.turnover.toFixed(2)}%  成交量: ${(market.volume / 10000).toFixed(0)} 万手`,
  ].join('\n');
}

// ---- Indicators block ----

function stateLabel(s: string): string {
  return { ranging: '震荡', trending_up: '上涨趋势', trending_down: '下跌趋势' }[s] ?? s;
}
function arrLabel(a: string): string {
  return (
    { bullish_alignment: '多头排列', bearish_alignment: '空头排列', crossed: '交叉缠绕' }[a] ?? a
  );
}
function sigLabel(s: string): string {
  return { overbought: '超买', oversold: '超卖', neutral: '中性' }[s] ?? s;
}
function macdLabel(s: string): string {
  return (
    {
      golden_cross: '金叉',
      death_cross: '死叉',
      bullish: '多头',
      bearish: '空头',
      neutral: '中性',
    }[s] ?? s
  );
}

export function formatIndicatorsBlock(analysis: AnalysisResult): string {
  const adv = analysis.advanced;
  const parts: string[] = [];

  parts.push('## 趋势指标');
  parts.push(
    `MA5: ${analysis.ma.ma5.toFixed(2)}  MA20: ${analysis.ma.ma20.toFixed(2)}  MA60: ${analysis.ma.ma60.toFixed(2)}`,
  );
  parts.push(`均线排列: ${arrLabel(adv.maArrangement)}`);
  parts.push(`市场状态: ${stateLabel(analysis.marketState)}`);

  parts.push('');
  parts.push('## 动量指标');
  if (adv.rsi)
    parts.push(`RSI(14): ${adv.rsi.value.toFixed(1)} — ${sigLabel(adv.rsi.signal)}`);
  if (adv.macd)
    parts.push(
      `MACD: DIF=${adv.macd.dif.toFixed(2)} DEA=${adv.macd.dea.toFixed(2)} 柱=${adv.macd.histogram.toFixed(2)} — ${macdLabel(adv.macd.signal)}`,
    );
  if (adv.kdj)
    parts.push(
      `KDJ: K=${adv.kdj.k.toFixed(1)} D=${adv.kdj.d.toFixed(1)} J=${adv.kdj.j.toFixed(1)} — ${sigLabel(adv.kdj.signal)}`,
    );
  if (adv.wr) parts.push(`WR: ${adv.wr.value.toFixed(1)} — ${sigLabel(adv.wr.signal)}`);

  parts.push('');
  parts.push('## 波动与成交量');
  parts.push(
    `布林带: 上轨=${analysis.bollinger.upper.toFixed(2)} 中轨=${analysis.bollinger.middle.toFixed(2)} 下轨=${analysis.bollinger.lower.toFixed(2)} 带宽=${analysis.bollinger.width.toFixed(4)}`,
  );
  parts.push(`ATR: ${analysis.atr.toFixed(2)}  振幅: ${adv.amplitude.toFixed(2)}%`);
  if (adv.volumeRatio !== null) parts.push(`量比: ${adv.volumeRatio.toFixed(2)}`);

  parts.push('');
  parts.push('## 关键价位');
  parts.push(`支撑位: ${analysis.support.toFixed(2)}  阻力位: ${analysis.resistance.toFixed(2)}`);
  parts.push(
    `距涨停: ${adv.limitDistance.up.toFixed(2)}%  距跌停: ${adv.limitDistance.down.toFixed(2)}%`,
  );

  return parts.join('\n');
}

// ---- Build grounding payload ----

export function buildGrounding(market: MarketData, analysis: AnalysisResult): GroundingPayload {
  return {
    target: `${market.name} ${market.code}`,
    market: 'A股',
    pricesBlock: formatPriceBlock(market),
    indicatorsBlock: formatIndicatorsBlock(analysis),
  };
}

// ---- upstream_context 注入 ----
//
// 把已完成 agent 的 output 格式化为 markdown 注入下游 system prompt.
// 失败 agent 走占位串. 总 char 超阈值时截断 narrative, 保留结构化字段.

const AGENT_DISPLAY_NAMES: Record<AgentId, string> = {
  bull_advocate: '看多研究员',
  bear_advocate: '看空研究员',
  risk_officer: '首席风险官',
  portfolio_manager: '投资经理',
  synthesizer: '中立总结者',
};

const UPSTREAM_BUDGET_CHARS = 4000 * 4; // ~4000 token 估算 (char/4 启发)

function formatAgentOutput(agentId: AgentId, output: AgentOutput): string {
  const lines: string[] = [];
  // 按 agent 类型展开关键字段; 结构未知则 JSON.stringify
  if (agentId === 'bull_advocate' && 'thesis_bullets' in output) {
    lines.push('论点:');
    for (const t of output.thesis_bullets) lines.push(`- ${t}`);
    lines.push(`信心: ${output.confidence}`);
    if (output.key_data_points.length) {
      lines.push('关键数据:');
      for (const d of output.key_data_points) lines.push(`- ${d}`);
    }
  } else if (agentId === 'bear_advocate' && 'risk_bullets' in output) {
    lines.push('风险:');
    for (const r of output.risk_bullets) lines.push(`- ${r}`);
    lines.push(`严重度: ${output.severity}`);
    if (output.key_red_flags.length) {
      lines.push('红旗:');
      for (const f of output.key_red_flags) lines.push(`- ${f}`);
    }
  } else if (agentId === 'risk_officer' && 'verdict_on_bull' in output) {
    lines.push(`对多方判定: ${output.verdict_on_bull}`);
    lines.push(`对空方判定: ${output.verdict_on_bear}`);
    lines.push(`综合风险评估: ${output.net_risk_assessment}`);
    lines.push(`建议最大仓位: ${output.max_position_pct}%`);
  } else if (agentId === 'portfolio_manager' && 'verdict' in output) {
    lines.push(`决策: ${output.verdict}`);
    lines.push(`置信度: ${output.confidence}`);
    lines.push(`仓位: ${output.position_size_pct}%`);
    lines.push(`核心论点: ${output.key_thesis}`);
    if (output.risks.length) {
      lines.push('风险:');
      for (const r of output.risks) lines.push(`- ${r}`);
    }
  } else if (agentId === 'synthesizer' && 'disagreements' in output) {
    lines.push('分歧点:');
    for (const d of output.disagreements) lines.push(`- ${d}`);
    lines.push(`PM 信心调整: ${output.pm_confidence_offset}`);
    if (output.missing_info.length) {
      lines.push('缺失信息:');
      for (const m of output.missing_info) lines.push(`- ${m}`);
    }
  } else {
    lines.push(JSON.stringify(output));
  }
  return lines.join('\n');
}

export function injectUpstream(
  upstreamIds: AgentId[],
  outputs: Map<AgentId, AgentOutput>,
  failures: Set<AgentId>,
): string {
  if (upstreamIds.length === 0) return '(本角色独立分析, 无上游)';

  const sections: string[] = [];
  for (const id of upstreamIds) {
    const heading = `### ${AGENT_DISPLAY_NAMES[id]} (${id}) 的观点`;
    if (failures.has(id)) {
      sections.push(`${heading}\n(此角色未能完成发言)`);
      continue;
    }
    const out = outputs.get(id);
    if (!out) {
      sections.push(`${heading}\n(此角色未能完成发言)`);
      continue;
    }
    sections.push(`${heading}\n${formatAgentOutput(id, out)}`);
  }

  let combined = sections.join('\n\n');

  // 简单 char-based 预算; tokenizer 在 MVP 范围外
  if (combined.length > UPSTREAM_BUDGET_CHARS) {
    combined =
      combined.slice(0, UPSTREAM_BUDGET_CHARS) +
      '\n\n(注: 上游内容已截断, 仅保留前段)';
  }

  return combined;
}
