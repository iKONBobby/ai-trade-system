import { z } from 'zod';
import type { ScreenerResult, Strategy } from '@trade/shared';

const ReviewSchema = z.object({
  reviews: z.array(z.object({
    code: z.string().regex(/^\d{6}$/),
    score: z.number().min(0).max(100),
    confidence: z.number().min(0).max(100),
    thesis: z.string().min(1).max(160),
    risks: z.array(z.string().min(1).max(100)).max(3),
  })).max(20),
});

export type CandidateAIReview = z.infer<typeof ReviewSchema>['reviews'][number];

export function parseAIReviews(content: string): CandidateAIReview[] | null {
  const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = ReviewSchema.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
    return parsed.success ? parsed.data.reviews : null;
  } catch {
    return null;
  }
}

function buildPrompt(strategy: Strategy, candidates: ScreenerResult[]): string {
  const horizonLabel = { short: '短线（1-5个交易日）', medium: '中线（数周至数月）', long: '长线（6个月以上）' }[strategy.horizon ?? 'short'];
  const rows = candidates.map((candidate) => ({
    code: candidate.code,
    name: candidate.name,
    price: candidate.price,
    changePct: candidate.change,
    turnoverPct: candidate.turnoverAvailable === false ? null : candidate.turnover,
    quantScore: candidate.score,
    passedFactors: candidate.triggeredFactors.filter((factor) => factor.passed).map((factor) => factor.name),
    failedFactors: candidate.triggeredFactors.filter((factor) => !factor.passed).map((factor) => factor.name),
    last20Closes: candidate.klineSnapshot,
  }));

  return `你是 A 股量化候选复核员。请对规则引擎候选做横向比较和风险复核，不得虚构新闻、财务、行业或盘口数据。

策略：${strategy.name}
持有周期：${horizonLabel}
策略逻辑：${strategy.description}

评分要求：
1. 只根据输入数据评分，score 为 0-100，衡量候选与本策略及持有周期的匹配程度。
2. quantScore 只是一个输入，不要机械复制；重点比较趋势连续性、量价协调、追高/回撤风险。
3. 对涨停观察策略，明确提示次日高开、开板和流动性风险；涨停不等于买入建议。
4. thesis 用一句中文，risks 最多 3 条，confidence 表示本次复核的数据充分度。
5. 每个输入 code 必须且只能返回一次，不得添加输入之外的股票。

候选数据：
${JSON.stringify(rows)}

严格返回 JSON，不要 Markdown：
{"reviews":[{"code":"600000","score":75,"confidence":70,"thesis":"一句话复核结论","risks":["风险一"]}]}`;
}

export async function reviewScreenerCandidates(
  strategy: Strategy,
  candidates: ScreenerResult[],
  externalSignal?: AbortSignal,
): Promise<CandidateAIReview[] | null> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey || candidates.length === 0) return null;

  const apiBase = process.env.LLM_API_BASE || 'https://api.anthropic.com/v1';
  const model = process.env.LLM_MODEL || 'claude-sonnet-4-5-20250929';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, controller.signal])
    : controller.signal;

  try {
    const response = await fetch(`${apiBase}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        messages: [{ role: 'user', content: buildPrompt(strategy, candidates) }],
        thinking: { type: 'disabled' },
      }),
      signal,
    });
    if (!response.ok) {
      console.warn(`[SCREENER:AI] ${strategy.id} HTTP ${response.status}`);
      return null;
    }
    const body = await response.json() as { content?: Array<{ text?: string }> };
    const reviews = body.content?.[0]?.text ? parseAIReviews(body.content[0].text) : null;
    if (!reviews) return null;
    const expectedCodes = new Set(candidates.map((candidate) => candidate.code));
    const actualCodes = new Set(reviews.map((review) => review.code));
    if (
      reviews.length !== candidates.length ||
      actualCodes.size !== reviews.length ||
      [...actualCodes].some((code) => !expectedCodes.has(code))
    ) {
      console.warn(`[SCREENER:AI] ${strategy.id} returned an incomplete or unexpected candidate set`);
      return null;
    }
    return reviews;
  } catch (error) {
    console.warn(`[SCREENER:AI] ${strategy.id} failed:`, error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
