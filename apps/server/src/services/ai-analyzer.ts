import type { MarketData, AnalysisResult, AIAnalysisResult } from '@trade/shared';

/**
 * Unified AI analysis: generates natural language summary + key signals
 * AND reviews strategy parameters with reasoning.
 * Best-effort: on any failure, returns null.
 * Only called when the user has explicitly enabled AI analysis.
 */
export async function aiAnalyze(
  market: MarketData,
  analysis: AnalysisResult,
): Promise<AIAnalysisResult | null> {
  const apiKey = process.env.LLM_API_KEY;
  const apiBase = process.env.LLM_API_BASE || 'https://api.anthropic.com/v1';
  const model = process.env.LLM_MODEL || 'claude-sonnet-4-20250514';

  if (!apiKey) {
    console.warn('AI analyzer skipped: no LLM_API_KEY configured');
    return null;
  }

  const prompt = buildPrompt(market, analysis);

  const url = `${apiBase}/messages`;
  console.log(`[AI] calling ${url} with model ${model}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
        thinking: { type: 'disabled' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log(`[AI] response status: ${res.status}`);

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[AI] API error ${res.status}: ${errBody.slice(0, 500)}`);
      return null;
    }

    const json = await res.json();
    console.log(`[AI] response keys: ${Object.keys(json).join(', ')}`);

    const content = json.content?.[0]?.text;

    if (!content) {
      console.warn('[AI] no content in response:', JSON.stringify(json).slice(0, 300));
      return null;
    }

    console.log(`[AI] got content (${content.length} chars)`);
    return parseResponse(content, analysis);
  } catch (err) {
    console.warn('[AI] fetch failed:', err);
    return null;
  }
}

function buildPrompt(market: MarketData, analysis: AnalysisResult): string {
  const adv = analysis.advanced;

  const parts: string[] = [
    `## 股票信息`,
    `名称: ${market.name} (${market.code})`,
    `现价: ${market.price.toFixed(2)} 元`,
    `涨跌幅: ${market.change.toFixed(2)}%`,
    `今开: ${market.open.toFixed(2)}  最高: ${market.high.toFixed(2)}  最低: ${market.low.toFixed(2)}  昨收: ${market.preClose.toFixed(2)}`,
    ``,
    `## 趋势指标`,
    `MA5: ${analysis.ma.ma5.toFixed(2)}  MA20: ${analysis.ma.ma20.toFixed(2)}  MA60: ${analysis.ma.ma60.toFixed(2)}`,
    `均线排列: ${arrLabel(adv.maArrangement)}`,
    `市场状态: ${stateLabel(analysis.marketState)}`,
    ``,
    `## 动量指标`,
  ];

  if (adv.rsi) parts.push(`RSI(14): ${adv.rsi.value.toFixed(1)} — ${sigLabel(adv.rsi.signal)}`);
  if (adv.macd) parts.push(`MACD: DIF=${adv.macd.dif.toFixed(2)} DEA=${adv.macd.dea.toFixed(2)} 柱=${adv.macd.histogram.toFixed(2)} — ${macdLabel(adv.macd.signal)}`);
  if (adv.kdj) parts.push(`KDJ: K=${adv.kdj.k.toFixed(1)} D=${adv.kdj.d.toFixed(1)} J=${adv.kdj.j.toFixed(1)} — ${sigLabel(adv.kdj.signal)}`);
  if (adv.wr) parts.push(`WR: ${adv.wr.value.toFixed(1)} — ${sigLabel(adv.wr.signal)}`);

  parts.push('');
  parts.push(`## 波动与成交量`);
  parts.push(`布林带: 上轨=${analysis.bollinger.upper.toFixed(2)} 中轨=${analysis.bollinger.middle.toFixed(2)} 下轨=${analysis.bollinger.lower.toFixed(2)} 带宽=${analysis.bollinger.width.toFixed(4)}`);
  parts.push(`ATR: ${analysis.atr.toFixed(2)}  振幅: ${adv.amplitude.toFixed(2)}%`);
  const turnover = market.turnoverAvailable === false ? '不可用' : `${market.turnover.toFixed(2)}%`;
  parts.push(`换手率: ${turnover}  成交量: ${(market.volume / 10000).toFixed(0)} 万手`);
  if (adv.volumeRatio !== null) parts.push(`量比: ${adv.volumeRatio.toFixed(2)}`);

  parts.push('');
  parts.push(`## 关键价位`);
  parts.push(`支撑位: ${analysis.support.toFixed(2)}  阻力位: ${analysis.resistance.toFixed(2)}`);
  parts.push(`距涨停: ${adv.limitDistance.up.toFixed(2)}%  距跌停: ${adv.limitDistance.down.toFixed(2)}%`);

  parts.push('');
  parts.push(`## 当前策略`);
  parts.push(`建议模式: ${analysis.recommendation === 'grid' ? '网格交易' : '条件单'}`);
  parts.push(`置信度: ${analysis.confidence.toFixed(0)}%`);
  if (analysis.gridParams) {
    parts.push(`网格参数: 基准价=${analysis.gridParams.basePrice.toFixed(2)} 步长=${analysis.gridParams.stepPercent}% ${analysis.gridParams.gridCount}格 每格${analysis.gridParams.lotPerGrid}股`);
  }
  if (analysis.conditionParams) {
    parts.push(`条件单参数: 买入触发=${analysis.conditionParams.buyTriggerPrice.toFixed(2)} 卖出触发=${analysis.conditionParams.sellTriggerPrice.toFixed(2)} 每笔${analysis.conditionParams.buyLot}股`);
  }

  return `你是资深 A 股量化交易分析师。请基于以下完整的技术指标数据，做两件事：

1. **综合分析**: 用 2-3 句中文给出简洁、有用的分析。像资深交易员跟朋友说话的口吻，不要公式化的废话。指出最重要的 1-2 个机会和 1-2 个风险。

2. **参数审查**: 审查当前的策略参数是否合理。如果有需要调整的，说明改什么、为什么。如果当前参数合理，adjustments 就留空数组。

3. **关键信号**: 列出 3-5 个最重要的信号点，每条标注 level（opportunity/risk/info）。

${parts.join('\n')}

严格返回 JSON，不要其他文字：
{
  "text": "2-3 句综合分析...",
  "signals": [
    {"indicator": "MACD", "level": "opportunity", "message": "金叉信号，短期看涨"},
    {"indicator": "RSI", "level": "risk", "message": "接近超买区，注意回调"}
  ],
  "adjustments": [
    {"field": "网格步长", "before": "0.5%", "after": "0.8%", "reason": "当前 ATR 偏高，波动加大，步长应相应放大"}
  ]
}`;
}

function parseResponse(content: string, original: AnalysisResult): AIAnalysisResult | null {
  try {
    const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    if (!parsed.text || typeof parsed.text !== 'string') return null;

    const signals = Array.isArray(parsed.signals) ? parsed.signals.slice(0, 5) : [];
    const adjustments = Array.isArray(parsed.adjustments) ? parsed.adjustments : [];

    // Try to apply adjustments to the analysis
    let adjustedAnalysis: AnalysisResult | undefined;
    if (adjustments.length > 0) {
      adjustedAnalysis = applyAdjustments(original, adjustments);
    }

    return {
      summary: { text: parsed.text, signals, adjustments },
      adjustedAnalysis,
    };
  } catch {
    return null;
  }
}

function applyAdjustments(
  analysis: AnalysisResult,
  adjustments: { field: string; before: string; after: string; reason: string }[],
): AnalysisResult {
  const result = JSON.parse(JSON.stringify(analysis)) as AnalysisResult;

  for (const adj of adjustments) {
    const field = adj.field;
    const afterNum = parseFloat(adj.after);

    if (isNaN(afterNum)) continue;

    if (field.includes('步长') && result.gridParams) {
      result.gridParams.stepPercent = afterNum;
    } else if (field.includes('网格数') && result.gridParams) {
      result.gridParams.gridCount = Math.round(afterNum);
    } else if (field.includes('置信度')) {
      result.confidence = Math.max(0, Math.min(100, afterNum));
    } else if (field.includes('买入触发') && result.conditionParams) {
      result.conditionParams.buyTriggerPrice = afterNum;
    } else if (field.includes('卖出触发') && result.conditionParams) {
      result.conditionParams.sellTriggerPrice = afterNum;
    }
  }

  return result;
}

function stateLabel(s: string): string {
  const map: Record<string, string> = { ranging: '震荡', trending_up: '上涨趋势', trending_down: '下跌趋势' };
  return map[s] ?? s;
}
function arrLabel(a: string): string {
  const map: Record<string, string> = { bullish_alignment: '多头排列', bearish_alignment: '空头排列', crossed: '交叉缠绕' };
  return map[a] ?? a;
}
function sigLabel(s: string): string {
  const map: Record<string, string> = { overbought: '超买', oversold: '超卖', neutral: '中性' };
  return map[s] ?? s;
}
function macdLabel(s: string): string {
  const map: Record<string, string> = { golden_cross: '金叉', death_cross: '死叉', bullish: '多头', bearish: '空头', neutral: '中性' };
  return map[s] ?? s;
}
