// Worker: 执行单个 agent — 拼 system prompt + 流式调 Anthropic SDK + 解析 JSON.
//
// 使用 @anthropic-ai/sdk client.messages.stream() (plan-eng-review D1 决定).
// SDK 处理 SSE 解析 / partial-line / UTF-8 / abort / 重试.
//
// 测试策略: 把纯函数 (renderSystemPrompt / parseAndValidate) 与 IO (callLLM)
// 拆开. unit test 覆盖纯函数 + dependency injection 覆盖 callLLM.

import Anthropic from '@anthropic-ai/sdk';
import { z, type ZodSchema } from 'zod';
import type { AgentId, AgentOutput } from '@trade/shared';
import { injectUpstream } from './grounding.js';
import type { AgentExecutionContext, AgentExecutionResult } from './types.js';

// ---- zod output schemas (per agent role) ----

const BullOutputSchema = z.object({
  thesis_bullets: z.array(z.string()).min(1).max(10),
  confidence: z.enum(['high', 'medium', 'low']),
  key_data_points: z.array(z.string()).max(10),
});

const BearOutputSchema = z.object({
  risk_bullets: z.array(z.string()).min(1).max(10),
  severity: z.enum(['high', 'medium', 'low']),
  key_red_flags: z.array(z.string()).max(10),
});

const RiskOfficerOutputSchema = z.object({
  verdict_on_bull: z.enum(['valid', 'partial', 'invalid']),
  verdict_on_bear: z.enum(['valid', 'partial', 'invalid']),
  net_risk_assessment: z.string().min(1),
  max_position_pct: z.number().min(0).max(100),
});

const PortfolioManagerOutputSchema = z.object({
  verdict: z.enum(['buy', 'hold', 'sell', 'avoid']),
  confidence: z.number().min(0).max(100),
  position_size_pct: z.number().min(0).max(100),
  key_thesis: z.string().min(1),
  risks: z.array(z.string()).max(10),
  strategy_hint: z.enum(['grid', 'condition', 'none']),
});

const SynthesizerOutputSchema = z.object({
  disagreements: z.array(z.string()).max(5),
  pm_confidence_offset: z.number().min(-100).max(100),
  missing_info: z.array(z.string()).max(10),
});

const SCHEMA_BY_AGENT: Record<AgentId, ZodSchema> = {
  bull_advocate: BullOutputSchema,
  bear_advocate: BearOutputSchema,
  risk_officer: RiskOfficerOutputSchema,
  portfolio_manager: PortfolioManagerOutputSchema,
  synthesizer: SynthesizerOutputSchema,
};

// ---- Pure: render system prompt with grounding + upstream ----

export function renderSystemPrompt(ctx: AgentExecutionContext): string {
  const upstreamMd = injectUpstream(
    ctx.agent.upstream_context,
    ctx.upstreamOutputs,
    ctx.upstreamFailures,
  );
  const grounding = `${ctx.grounding.pricesBlock}\n\n${ctx.grounding.indicatorsBlock}`;
  // C7: skill 内联 YAML, {skills_block} 占位符若仍存在则替换为空串
  return ctx.agent.system_prompt
    .replace('{grounding}', grounding)
    .replace('{upstream_context}', upstreamMd)
    .replace('{skills_block}', '')
    .replace('{target}', ctx.grounding.target)
    .replace('{market}', ctx.grounding.market);
}

// ---- Pure: parse fenced JSON + zod validate ----

export function parseAndValidate(
  text: string,
  agentId: AgentId,
): { kind: 'ok'; output: AgentOutput } | { kind: 'invalid'; message: string } {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  // 提取首个看起来像 JSON 对象的子串
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return { kind: 'invalid', message: '响应里找不到 JSON 对象' };
  }
  const jsonStr = cleaned.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return {
      kind: 'invalid',
      message: `JSON parse 失败: ${(err as Error).message}`,
    };
  }

  const schema = SCHEMA_BY_AGENT[agentId];
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      kind: 'invalid',
      message: `schema 校验失败: ${result.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ')}`,
    };
  }
  return { kind: 'ok', output: result.data as AgentOutput };
}

// ---- Anthropic client (lazy singleton + DI override for tests) ----

// Minimal client interface — 测试可注入 fake.
// 让 worker 不依赖 Anthropic SDK 内部类型, 测试时只需符合这个 shape.
export interface LLMStreamLike {
  // for-await 产出原始 stream events
  [Symbol.asyncIterator](): AsyncIterator<{
    type: string;
    delta?: { type: string; text?: string };
  }>;
  finalMessage(): Promise<{ content: Array<{ type: string; text?: string }> }>;
}

export interface LLMClientLike {
  messages: {
    stream(
      args: {
        model: string;
        max_tokens: number;
        temperature?: number;
        system: string;
        messages: Array<{ role: 'user'; content: string }>;
      },
      options?: { signal?: AbortSignal },
    ): LLMStreamLike;
  };
}

let _client: LLMClientLike | null = null;
let _testClient: LLMClientLike | null = null;

function defaultClient(): LLMClientLike {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY not set');
  const baseURL = process.env.LLM_API_BASE;
  return new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) }) as unknown as LLMClientLike;
}

function getClient(): LLMClientLike {
  if (_testClient) return _testClient;
  if (!_client) _client = defaultClient();
  return _client;
}

/** 测试 hook — 注入 fake client. 仅 vitest 使用. */
export function _setTestClient(c: LLMClientLike | null): void {
  _testClient = c;
}

// ---- Main: executeAgent ----

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

async function singleAttempt(ctx: AgentExecutionContext): Promise<AgentExecutionResult> {
  const client = getClient();
  const model = process.env.LLM_MODEL ?? DEFAULT_MODEL;
  const systemPrompt = renderSystemPrompt(ctx);

  const userPrompt = `针对 ${ctx.grounding.target} 完成你的分析任务. 严格按 system prompt 要求返回 JSON, 不要 markdown 包裹, 不要其他文字.`;

  const stream = client.messages.stream(
    {
      model,
      max_tokens: ctx.agent.max_tokens,
      temperature: ctx.agent.temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    },
    { signal: ctx.signal },
  );

  let accumulated = '';
  for await (const event of stream) {
    if (ctx.signal.aborted) {
      // SDK 内部 throw AbortError; 这里 defensive
      return { kind: 'failed', message: 'aborted' };
    }
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      const text = event.delta.text ?? '';
      accumulated += text;
      ctx.emit({ type: 'agent_chunk', agentId: ctx.agent.id, text, done: false });
    }
  }

  // SDK finalMessage 是 source of truth; 上面 accumulated 仅用于 debug
  const final = await stream.finalMessage();
  const finalText = final.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');

  const result = parseAndValidate(finalText || accumulated, ctx.agent.id);
  if (result.kind === 'ok') return { kind: 'ok', output: result.output };
  return { kind: 'failed', message: result.message };
}

export async function executeAgent(ctx: AgentExecutionContext): Promise<AgentExecutionResult> {
  if (ctx.signal.aborted) return { kind: 'failed', message: 'aborted' };

  // 1st attempt
  try {
    const r1 = await singleAttempt(ctx);
    if (r1.kind === 'ok') return r1;
    // 解析或 schema 失败 — retry 一次
    if (ctx.signal.aborted) return { kind: 'failed', message: 'aborted' };
  } catch (err) {
    if (ctx.signal.aborted) return { kind: 'failed', message: 'aborted' };
    // 上游异常 — retry 一次
    void err;
  }

  // 2nd attempt
  try {
    return await singleAttempt(ctx);
  } catch (err) {
    if (ctx.signal.aborted) return { kind: 'failed', message: 'aborted' };
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: 'failed', message: msg };
  }
}
