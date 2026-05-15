import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type {
  AgentId,
  AgentOutput,
  PortfolioManagerOutput,
  SwarmEvent,
} from '@trade/shared';
import {
  parseAndValidate,
  renderSystemPrompt,
  executeAgent,
  _setTestClient,
  type LLMClientLike,
  type LLMStreamLike,
} from '../worker.js';
import type { AgentExecutionContext, AgentSpec, GroundingPayload } from '../types.js';

// ---- Test fixtures ----

function mkAgent(id: AgentId, overrides: Partial<AgentSpec> = {}): AgentSpec {
  return {
    id,
    role: 'test',
    system_prompt: 'system prompt with {grounding} and {upstream_context}',
    skills: [],
    upstream_context: [],
    max_tokens: 1000,
    temperature: 0.4,
    ...overrides,
  };
}

const FAKE_GROUNDING: GroundingPayload = {
  target: '贵州茅台 600519',
  market: 'A股',
  pricesBlock: '## 股票信息\n名称: 贵州茅台',
  indicatorsBlock: '## 趋势指标\nMA5: 1675.20',
};

function mkCtx(overrides: Partial<AgentExecutionContext> = {}): AgentExecutionContext {
  return {
    agent: mkAgent('bull_advocate'),
    grounding: FAKE_GROUNDING,
    upstreamOutputs: new Map(),
    upstreamFailures: new Set(),
    signal: new AbortController().signal,
    emit: () => {},
    ...overrides,
  };
}

// ---- parseAndValidate ----

describe('parseAndValidate', () => {
  describe('bull_advocate', () => {
    it('合规 JSON 通过', () => {
      const text = JSON.stringify({
        thesis_bullets: ['x', 'y'],
        confidence: 'high',
        key_data_points: ['a'],
      });
      const r = parseAndValidate(text, 'bull_advocate');
      expect(r.kind).toBe('ok');
      if (r.kind === 'ok') {
        expect((r.output as { confidence: string }).confidence).toBe('high');
      }
    });

    it('fenced markdown json 块也接受', () => {
      const text = '```json\n' + JSON.stringify({
        thesis_bullets: ['x'],
        confidence: 'medium',
        key_data_points: [],
      }) + '\n```';
      const r = parseAndValidate(text, 'bull_advocate');
      expect(r.kind).toBe('ok');
    });

    it('json 嵌在散文中也能提取', () => {
      const text = '这是分析: { "thesis_bullets":["x"], "confidence":"low", "key_data_points":[] } 完毕';
      const r = parseAndValidate(text, 'bull_advocate');
      expect(r.kind).toBe('ok');
    });

    it('confidence 不在 enum 时 schema 失败', () => {
      const text = JSON.stringify({
        thesis_bullets: ['x'],
        confidence: 'crazy',
        key_data_points: [],
      });
      const r = parseAndValidate(text, 'bull_advocate');
      expect(r.kind).toBe('invalid');
      if (r.kind === 'invalid') expect(r.message).toMatch(/schema/);
    });

    it('thesis_bullets 空数组失败 (min 1)', () => {
      const text = JSON.stringify({
        thesis_bullets: [],
        confidence: 'medium',
        key_data_points: [],
      });
      const r = parseAndValidate(text, 'bull_advocate');
      expect(r.kind).toBe('invalid');
    });

    it('找不到 JSON 对象失败', () => {
      const r = parseAndValidate('就是一段散文没有 json', 'bull_advocate');
      expect(r.kind).toBe('invalid');
      if (r.kind === 'invalid') expect(r.message).toMatch(/找不到/);
    });

    it('损坏 JSON 失败', () => {
      const r = parseAndValidate('{ "thesis_bullets": [ broken ', 'bull_advocate');
      expect(r.kind).toBe('invalid');
    });
  });

  describe('portfolio_manager', () => {
    it('合规 verdict', () => {
      const text = JSON.stringify({
        verdict: 'buy',
        confidence: 78,
        position_size_pct: 35,
        key_thesis: '基本面拐点',
        risks: ['北向流出'],
        strategy_hint: 'grid',
      });
      const r = parseAndValidate(text, 'portfolio_manager');
      expect(r.kind).toBe('ok');
      if (r.kind === 'ok') {
        const pm = r.output as PortfolioManagerOutput;
        expect(pm.verdict).toBe('buy');
        expect(pm.confidence).toBe(78);
      }
    });

    it('verdict 在 enum 外失败', () => {
      const text = JSON.stringify({
        verdict: 'maybe',
        confidence: 50,
        position_size_pct: 20,
        key_thesis: 'x',
        risks: [],
        strategy_hint: 'grid',
      });
      const r = parseAndValidate(text, 'portfolio_manager');
      expect(r.kind).toBe('invalid');
    });

    it('confidence 超 100 失败', () => {
      const text = JSON.stringify({
        verdict: 'buy',
        confidence: 150,
        position_size_pct: 30,
        key_thesis: 'x',
        risks: [],
        strategy_hint: 'grid',
      });
      const r = parseAndValidate(text, 'portfolio_manager');
      expect(r.kind).toBe('invalid');
    });
  });

  describe('risk_officer', () => {
    it('合规', () => {
      const text = JSON.stringify({
        verdict_on_bull: 'partial',
        verdict_on_bear: 'valid',
        net_risk_assessment: '建议轻仓',
        max_position_pct: 25,
      });
      const r = parseAndValidate(text, 'risk_officer');
      expect(r.kind).toBe('ok');
    });
  });

  describe('synthesizer', () => {
    it('合规', () => {
      const text = JSON.stringify({
        disagreements: ['估值分歧', '量能解读分歧'],
        pm_confidence_offset: -10,
        missing_info: ['行业景气数据'],
      });
      const r = parseAndValidate(text, 'synthesizer');
      expect(r.kind).toBe('ok');
    });

    it('pm_confidence_offset 超 100 失败', () => {
      const text = JSON.stringify({
        disagreements: [],
        pm_confidence_offset: 200,
        missing_info: [],
      });
      const r = parseAndValidate(text, 'synthesizer');
      expect(r.kind).toBe('invalid');
    });
  });
});

// ---- renderSystemPrompt ----

describe('renderSystemPrompt', () => {
  it('替换 {grounding} 含价格 + 指标块', () => {
    const ctx = mkCtx();
    const prompt = renderSystemPrompt(ctx);
    expect(prompt).toContain('贵州茅台');
    expect(prompt).toContain('MA5');
    expect(prompt).not.toContain('{grounding}');
  });

  it('独立 agent (upstream_context: []) 注入 "独立分析"', () => {
    const ctx = mkCtx();
    const prompt = renderSystemPrompt(ctx);
    expect(prompt).toContain('独立分析');
    expect(prompt).not.toContain('{upstream_context}');
  });

  it('替换 {target} {market} 占位符', () => {
    const ctx = mkCtx({
      agent: mkAgent('bull_advocate', {
        system_prompt: 'analyze {target} in {market}',
      }),
    });
    const prompt = renderSystemPrompt(ctx);
    expect(prompt).toContain('贵州茅台 600519');
    expect(prompt).toContain('A股');
  });

  it('替换 {skills_block} 为空 (C7 内联)', () => {
    const ctx = mkCtx({
      agent: mkAgent('bull_advocate', {
        system_prompt: 'preamble {skills_block} body',
      }),
    });
    const prompt = renderSystemPrompt(ctx);
    expect(prompt).not.toContain('{skills_block}');
    expect(prompt).toContain('preamble');
    expect(prompt).toContain('body');
  });

  it('upstream agent 输出注入', () => {
    const ctx = mkCtx({
      agent: mkAgent('portfolio_manager', {
        upstream_context: ['bull_advocate'],
      }),
      upstreamOutputs: new Map<AgentId, AgentOutput>([
        [
          'bull_advocate',
          { thesis_bullets: ['超跌反弹'], confidence: 'high', key_data_points: [] },
        ],
      ]),
    });
    const prompt = renderSystemPrompt(ctx);
    expect(prompt).toContain('看多研究员');
    expect(prompt).toContain('超跌反弹');
  });
});

// ---- executeAgent with mocked client ----

interface ScriptedStreamArgs {
  chunks: string[];
  finalText: string;
  throwOnStream?: Error;
}

class ScriptedStream implements LLMStreamLike {
  constructor(private readonly args: ScriptedStreamArgs) {}

  async *[Symbol.asyncIterator]() {
    if (this.args.throwOnStream) throw this.args.throwOnStream;
    for (const text of this.args.chunks) {
      yield {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text },
      };
    }
  }

  async finalMessage() {
    return {
      content: [{ type: 'text' as const, text: this.args.finalText }],
    };
  }
}

function mkClient(scriptedResponses: ScriptedStreamArgs[]): LLMClientLike {
  let i = 0;
  return {
    messages: {
      stream() {
        const args = scriptedResponses[i++];
        if (!args) throw new Error('no more scripted responses');
        return new ScriptedStream(args);
      },
    },
  };
}

describe('executeAgent (with mocked client)', () => {
  const ORIG_KEY = process.env.LLM_API_KEY;

  beforeEach(() => {
    process.env.LLM_API_KEY = 'test-key';
  });

  afterEach(() => {
    _setTestClient(null);
    if (ORIG_KEY === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = ORIG_KEY;
  });

  it('happy path: chunks emitted + JSON parsed', async () => {
    const validJson = JSON.stringify({
      thesis_bullets: ['x'],
      confidence: 'high',
      key_data_points: [],
    });
    _setTestClient(
      mkClient([
        {
          chunks: ['{', '"thesis_bullets":["x"]'],
          finalText: validJson,
        },
      ]),
    );

    const emitted: SwarmEvent[] = [];
    const r = await executeAgent(mkCtx({ emit: (e) => emitted.push(e) }));
    expect(r.kind).toBe('ok');
    expect(emitted.filter((e) => e.type === 'agent_chunk')).toHaveLength(2);
  });

  it('JSON 解析失败 → retry 1 次, 仍失败返回 failed', async () => {
    _setTestClient(
      mkClient([
        { chunks: [], finalText: 'no json here' },
        { chunks: [], finalText: 'still no json' },
      ]),
    );
    const r = await executeAgent(mkCtx());
    expect(r.kind).toBe('failed');
  });

  it('1st attempt schema fail, 2nd attempt ok → 返回 ok', async () => {
    const validJson = JSON.stringify({
      thesis_bullets: ['x'],
      confidence: 'high',
      key_data_points: [],
    });
    _setTestClient(
      mkClient([
        { chunks: [], finalText: '{"confidence":"crazy","thesis_bullets":["x"],"key_data_points":[]}' },
        { chunks: [], finalText: validJson },
      ]),
    );
    const r = await executeAgent(mkCtx());
    expect(r.kind).toBe('ok');
  });

  it('signal 已 aborted → 立即返回 failed', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    _setTestClient(mkClient([]));
    const r = await executeAgent(mkCtx({ signal: ctrl.signal }));
    expect(r.kind).toBe('failed');
    if (r.kind === 'failed') expect(r.message).toBe('aborted');
  });

  it('上游 SDK throw + retry 同样 throw → 返回 failed 含错误信息', async () => {
    _setTestClient(
      mkClient([
        { chunks: [], finalText: '', throwOnStream: new Error('connection drop') },
        { chunks: [], finalText: '', throwOnStream: new Error('connection drop again') },
      ]),
    );
    const r = await executeAgent(mkCtx());
    expect(r.kind).toBe('failed');
    if (r.kind === 'failed') expect(r.message).toContain('connection drop again');
  });
});
