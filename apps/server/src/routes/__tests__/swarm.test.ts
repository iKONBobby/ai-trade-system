import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MarketData, KLine, AgentOutput, AgentId } from '@trade/shared';
import { swarmRouter } from '../swarm.js';
import * as marketSvc from '../../services/market.js';
import * as workerSvc from '../../services/swarm/worker.js';
import type { AgentExecutionContext } from '../../services/swarm/types.js';
import { runRegistry } from '../../services/swarm/run-registry.js';
import { swarmEventBus } from '../../services/swarm/event-bus.js';
import { feedbackWriter } from '../../services/swarm/feedback-writer.js';

// ---- Fixtures ----

const FIXTURE_MARKET: MarketData = {
  code: '600519',
  name: '贵州茅台',
  price: 1680,
  change: 1.2,
  volume: 100,
  turnover: 0.5,
  open: 1670,
  high: 1685,
  low: 1668,
  preClose: 1660,
};

const FIXTURE_KLINES: KLine[] = Array.from({ length: 60 }, (_, i) => ({
  date: `2026-${String(i + 1).padStart(4, '0')}`,
  open: 1670,
  high: 1685,
  low: 1668,
  close: 1680,
  volume: 100,
}));

const MOCK_OUTPUTS: Record<AgentId, AgentOutput> = {
  bull_advocate: {
    thesis_bullets: ['趋势强'],
    confidence: 'high',
    key_data_points: [],
  },
  bear_advocate: {
    risk_bullets: ['北向流出'],
    severity: 'medium',
    key_red_flags: [],
  },
  risk_officer: {
    verdict_on_bull: 'partial',
    verdict_on_bear: 'valid',
    net_risk_assessment: '中等',
    max_position_pct: 30,
  },
  portfolio_manager: {
    verdict: 'buy',
    confidence: 70,
    position_size_pct: 25,
    key_thesis: '基本面好',
    risks: [],
    strategy_hint: 'grid',
  },
  synthesizer: {
    disagreements: ['估值分歧'],
    pm_confidence_offset: -5,
    missing_info: [],
  },
};

// ---- App + spies ----

function mkApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/swarm', swarmRouter);
  return app;
}

let app: express.Application;
let realtimeSpy: ReturnType<typeof vi.spyOn>;
let klineSpy: ReturnType<typeof vi.spyOn>;
let executorSpy: ReturnType<typeof vi.spyOn>;
const ORIG_LLM_KEY = process.env.LLM_API_KEY;
const ORIG_VAL_DIR = process.env.SWARM_VALIDATION_DIR;
let tmpDataDir: string;

beforeEach(async () => {
  app = mkApp();
  process.env.LLM_API_KEY = 'test-key';
  tmpDataDir = await fs.mkdtemp(join(tmpdir(), 'swarm-route-'));
  process.env.SWARM_VALIDATION_DIR = join(tmpDataDir, 'validation');

  realtimeSpy = vi.spyOn(marketSvc, 'fetchRealtime');
  klineSpy = vi.spyOn(marketSvc, 'fetchKLine');
  executorSpy = vi.spyOn(workerSvc, 'executeAgent');

  realtimeSpy.mockResolvedValue(FIXTURE_MARKET);
  klineSpy.mockResolvedValue(FIXTURE_KLINES);
  executorSpy.mockImplementation(async (ctx: AgentExecutionContext) => {
    return { kind: 'ok', output: MOCK_OUTPUTS[ctx.agent.id] };
  });

  runRegistry._clearForTest();
  feedbackWriter.reset();
});

afterEach(async () => {
  vi.restoreAllMocks();
  // 等 fire-and-forget validation/feedback write settle, 避免与 rm dir race
  await new Promise((r) => setTimeout(r, 30));
  try {
    await fs.rm(tmpDataDir, { recursive: true, force: true });
  } catch {
    // ENOTEMPTY race tolerated
  }
  if (ORIG_LLM_KEY === undefined) delete process.env.LLM_API_KEY;
  else process.env.LLM_API_KEY = ORIG_LLM_KEY;
  if (ORIG_VAL_DIR === undefined) delete process.env.SWARM_VALIDATION_DIR;
  else process.env.SWARM_VALIDATION_DIR = ORIG_VAL_DIR;
});

// 等待 background swarm 完全完成 — 不仅 event bus closed, registry state 也 terminal,
// 同时给 validation writer (fire-and-forget) 一点时间 settle.
async function waitForSwarmComplete(runId: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (true) {
    const entry = runRegistry.get(runId);
    const terminal =
      entry &&
      (entry.state === 'done' || entry.state === 'error' || entry.state === 'aborted');
    if (terminal && swarmEventBus.isClosed(runId)) {
      // Settle pending fire-and-forget IO (validation writer)
      await new Promise((r) => setTimeout(r, 50));
      return;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `swarm did not finish in ${timeoutMs}ms (state=${entry?.state}, closed=${swarmEventBus.isClosed(runId)})`,
      );
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

// ===========================================================================
// POST /api/swarm/runs
// ===========================================================================

describe('POST /api/swarm/runs', () => {
  it('valid body → 201 + runId + streamUrl', async () => {
    const res = await request(app).post('/api/swarm/runs').send({
      stockCode: '600519',
      presetId: 'investment_committee',
    });
    expect(res.status).toBe(201);
    expect(res.body.runId).toMatch(/^swr_/);
    expect(res.body.streamUrl).toBe(`/api/swarm/runs/${res.body.runId}/events`);
  });

  it('invalid stockCode → 400 INVALID_BODY', async () => {
    const res = await request(app).post('/api/swarm/runs').send({
      stockCode: 'abc',
      presetId: 'investment_committee',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_BODY');
  });

  it('missing presetId → 400 INVALID_BODY', async () => {
    const res = await request(app).post('/api/swarm/runs').send({
      stockCode: '600519',
    });
    expect(res.status).toBe(400);
  });

  it('LLM_API_KEY 未设置 → 503 NO_LLM_KEY', async () => {
    delete process.env.LLM_API_KEY;
    const res = await request(app).post('/api/swarm/runs').send({
      stockCode: '600519',
      presetId: 'investment_committee',
    });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('NO_LLM_KEY');
  });

  it('unknown presetId → 404 UNKNOWN_PRESET', async () => {
    const res = await request(app).post('/api/swarm/runs').send({
      stockCode: '600519',
      presetId: 'does_not_exist',
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('UNKNOWN_PRESET');
  });

  it('upstream UpstreamUnavailableError → 503', async () => {
    realtimeSpy.mockRejectedValue(new marketSvc.UpstreamUnavailableError('timeout'));
    const res = await request(app).post('/api/swarm/runs').send({
      stockCode: '600519',
      presetId: 'investment_committee',
    });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('STOCK_NOT_FOUND → 404', async () => {
    realtimeSpy.mockRejectedValue(new Error('STOCK_NOT_FOUND'));
    const res = await request(app).post('/api/swarm/runs').send({
      stockCode: '999999',
      presetId: 'investment_committee',
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('STOCK_NOT_FOUND');
  });

  it('成功创建后 runRegistry + eventBus 都有该 runId, meta.stockCode 正确', async () => {
    const res = await request(app).post('/api/swarm/runs').send({
      stockCode: '600519',
      presetId: 'investment_committee',
    });
    const { runId } = res.body;
    const entry = runRegistry.get(runId);
    expect(entry).toBeDefined();
    expect(entry?.meta.stockCode).toBe('600519');
    expect(entry?.meta.presetId).toBe('investment_committee');
  });

  it('background swarm 跑完后 mark done + 写入 validation 表', async () => {
    const res = await request(app).post('/api/swarm/runs').send({
      stockCode: '600519',
      presetId: 'investment_committee',
    });
    await waitForSwarmComplete(res.body.runId);
    expect(runRegistry.get(res.body.runId)?.state).toBe('done');

    // C3 validation file 应当存在
    const valFiles = await fs.readdir(join(tmpDataDir, 'validation')).catch(() => []);
    expect(valFiles.length).toBeGreaterThan(0);
    const valContent = await fs.readFile(
      join(tmpDataDir, 'validation', valFiles[0]),
      'utf8',
    );
    expect(valContent).toContain('600519');
    expect(valContent).toContain('swarm');
    expect(valContent).toContain('buy');
  });
});

// ===========================================================================
// GET /api/swarm/runs/:runId — status (C8 recovery)
// ===========================================================================

describe('GET /api/swarm/runs/:runId — status', () => {
  it('unknown → 404', async () => {
    const res = await request(app).get('/api/swarm/runs/swr_nope');
    expect(res.status).toBe(404);
  });

  it('已完成 run 返回 state=done + metadata', async () => {
    const start = await request(app).post('/api/swarm/runs').send({
      stockCode: '600519',
      presetId: 'investment_committee',
    });
    await waitForSwarmComplete(start.body.runId);
    const res = await request(app).get(`/api/swarm/runs/${start.body.runId}`);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('done');
    expect(res.body.stockCode).toBe('600519');
    expect(res.body.presetId).toBe('investment_committee');
    expect(typeof res.body.createdAt).toBe('number');
    expect(typeof res.body.finishedAt).toBe('number');
  });

  it('进行中 run 返回 state=running, finishedAt=null', async () => {
    executorSpy.mockImplementation(() => new Promise(() => undefined));
    const start = await request(app).post('/api/swarm/runs').send({
      stockCode: '600519',
      presetId: 'investment_committee',
    });
    // 等 markRunning
    await new Promise((r) => setTimeout(r, 30));
    const res = await request(app).get(`/api/swarm/runs/${start.body.runId}`);
    expect(res.status).toBe(200);
    expect(['pending', 'running']).toContain(res.body.state);
    expect(res.body.finishedAt).toBeNull();
  });
});

// ===========================================================================
// POST /api/swarm/runs/:runId/abort
// ===========================================================================

describe('POST /api/swarm/runs/:runId/abort', () => {
  it('abort 正在跑的 run → 204 + signal aborted', async () => {
    // 让 executor 永远等待, 模拟正在跑
    executorSpy.mockImplementation(
      () => new Promise(() => undefined),
    );

    const start = await request(app).post('/api/swarm/runs').send({
      stockCode: '600519',
      presetId: 'investment_committee',
    });
    const { runId } = start.body;

    const abort = await request(app).post(`/api/swarm/runs/${runId}/abort`).send();
    expect(abort.status).toBe(204);

    const entry = runRegistry.get(runId);
    expect(entry?.state).toBe('aborted');
    expect(entry?.ctrl.signal.aborted).toBe(true);
  });

  it('abort unknown runId → 404', async () => {
    const res = await request(app).post('/api/swarm/runs/swr_nope/abort').send();
    expect(res.status).toBe(404);
  });

  it('abort 已完成 run → 204 noop, state 保持 done', async () => {
    const start = await request(app).post('/api/swarm/runs').send({
      stockCode: '600519',
      presetId: 'investment_committee',
    });
    const { runId } = start.body;
    await waitForSwarmComplete(runId);

    const abort = await request(app).post(`/api/swarm/runs/${runId}/abort`).send();
    expect(abort.status).toBe(204);
    expect(runRegistry.get(runId)?.state).toBe('done');
  });
});

// ===========================================================================
// POST /api/swarm/runs/:runId/feedback (C4)
// ===========================================================================

describe('POST /api/swarm/runs/:runId/feedback (C4)', () => {
  async function startCompleteRun(): Promise<string> {
    const res = await request(app).post('/api/swarm/runs').send({
      stockCode: '600519',
      presetId: 'investment_committee',
    });
    await waitForSwarmComplete(res.body.runId);
    return res.body.runId;
  }

  it('accept → 204 + jsonl 写入', async () => {
    const runId = await startCompleteRun();
    const res = await request(app)
      .post(`/api/swarm/runs/${runId}/feedback`)
      .send({ decision: 'accept' });
    expect(res.status).toBe(204);
    expect(feedbackWriter.has(runId)).toBe(true);
  });

  it('reject → 204', async () => {
    const runId = await startCompleteRun();
    const res = await request(app)
      .post(`/api/swarm/runs/${runId}/feedback`)
      .send({ decision: 'reject' });
    expect(res.status).toBe(204);
  });

  it('modify 需要 modifiedPositionPct, 缺失 → 400', async () => {
    const runId = await startCompleteRun();
    const res = await request(app)
      .post(`/api/swarm/runs/${runId}/feedback`)
      .send({ decision: 'modify' });
    expect(res.status).toBe(400);
  });

  it('modify 带 modifiedPositionPct → 204', async () => {
    const runId = await startCompleteRun();
    const res = await request(app)
      .post(`/api/swarm/runs/${runId}/feedback`)
      .send({ decision: 'modify', modifiedPositionPct: 20 });
    expect(res.status).toBe(204);
  });

  it('重复 feedback 同一 runId → 409 DUPLICATE', async () => {
    const runId = await startCompleteRun();
    await request(app).post(`/api/swarm/runs/${runId}/feedback`).send({ decision: 'accept' });
    const dup = await request(app)
      .post(`/api/swarm/runs/${runId}/feedback`)
      .send({ decision: 'reject' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('DUPLICATE');
  });

  it('未完成 run → 409 NOT_COMPLETED', async () => {
    executorSpy.mockImplementation(() => new Promise(() => undefined));
    const start = await request(app).post('/api/swarm/runs').send({
      stockCode: '600519',
      presetId: 'investment_committee',
    });
    const res = await request(app)
      .post(`/api/swarm/runs/${start.body.runId}/feedback`)
      .send({ decision: 'accept' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('NOT_COMPLETED');
  });

  it('unknown runId → 404', async () => {
    const res = await request(app)
      .post('/api/swarm/runs/swr_unknown/feedback')
      .send({ decision: 'accept' });
    expect(res.status).toBe(404);
  });

  it('invalid decision enum → 400', async () => {
    const runId = await startCompleteRun();
    const res = await request(app)
      .post(`/api/swarm/runs/${runId}/feedback`)
      .send({ decision: 'maybe' });
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// POST /api/swarm/batch-runs (C5)
// ===========================================================================

describe('POST /api/swarm/batch-runs (C5)', () => {
  it('valid body → 201 + batchId + runs[] 每只股票', async () => {
    const res = await request(app).post('/api/swarm/batch-runs').send({
      stockCodes: ['600519', '000858', '300750'],
      presetId: 'investment_committee',
    });
    expect(res.status).toBe(201);
    expect(res.body.batchId).toMatch(/^swb_/);
    expect(res.body.runs).toHaveLength(3);
    expect(res.body.runs[0]).toMatchObject({
      stockCode: '600519',
      runId: expect.stringMatching(/^swr_/),
      streamUrl: expect.stringContaining('/api/swarm/runs/'),
    });
  });

  it('每个 runId 都在 registry + bus 中, meta.stockCode 正确', async () => {
    const res = await request(app).post('/api/swarm/batch-runs').send({
      stockCodes: ['600519', '000858'],
      presetId: 'investment_committee',
    });
    for (const run of res.body.runs) {
      const entry = runRegistry.get(run.runId);
      expect(entry).toBeDefined();
      expect(entry?.meta.stockCode).toBe(run.stockCode);
    }
  });

  it('全部 swarm 完成后 state=done', async () => {
    const res = await request(app).post('/api/swarm/batch-runs').send({
      stockCodes: ['600519', '000858'],
      presetId: 'investment_committee',
    });
    for (const run of res.body.runs) {
      await waitForSwarmComplete(run.runId, 5000);
      expect(runRegistry.get(run.runId)?.state).toBe('done');
    }
  });

  it('empty stockCodes → 400', async () => {
    const res = await request(app).post('/api/swarm/batch-runs').send({
      stockCodes: [],
      presetId: 'investment_committee',
    });
    expect(res.status).toBe(400);
  });

  it('超 10 只 → 400', async () => {
    const codes = Array.from({ length: 11 }, (_, i) =>
      String(600000 + i).padStart(6, '0'),
    );
    const res = await request(app).post('/api/swarm/batch-runs').send({
      stockCodes: codes,
      presetId: 'investment_committee',
    });
    expect(res.status).toBe(400);
  });

  it('invalid stockCode (非 6 位数字) → 400', async () => {
    const res = await request(app).post('/api/swarm/batch-runs').send({
      stockCodes: ['abc', '600519'],
      presetId: 'investment_committee',
    });
    expect(res.status).toBe(400);
  });

  it('unknown presetId → 404', async () => {
    const res = await request(app).post('/api/swarm/batch-runs').send({
      stockCodes: ['600519'],
      presetId: 'no_such_preset',
    });
    expect(res.status).toBe(404);
  });

  it('LLM_API_KEY 未设置 → 503', async () => {
    delete process.env.LLM_API_KEY;
    const res = await request(app).post('/api/swarm/batch-runs').send({
      stockCodes: ['600519'],
      presetId: 'investment_committee',
    });
    expect(res.status).toBe(503);
  });

  it('一只 fetch 失败时其他仍跑通 (各自独立 runId)', async () => {
    // 让第一只 fetch 失败 (rejecting), 其他正常
    realtimeSpy.mockImplementation((code: string) => {
      if (code === '999999') return Promise.reject(new Error('STOCK_NOT_FOUND'));
      return Promise.resolve(FIXTURE_MARKET);
    });
    const res = await request(app).post('/api/swarm/batch-runs').send({
      stockCodes: ['999999', '600519'],
      presetId: 'investment_committee',
    });
    expect(res.status).toBe(201);
    expect(res.body.runs).toHaveLength(2);

    // 等所有 run 结束
    await Promise.all(
      res.body.runs.map((r: { runId: string }) =>
        waitForSwarmComplete(r.runId, 5000).catch(() => undefined),
      ),
    );

    const failed = runRegistry.get(res.body.runs[0].runId);
    const ok = runRegistry.get(res.body.runs[1].runId);
    expect(failed?.state).toBe('error');
    expect(ok?.state).toBe('done');
  });
});

// ===========================================================================
// GET /api/swarm/runs/:runId/events (SSE)
// ===========================================================================

describe('GET /api/swarm/runs/:runId/events', () => {
  it('unknown runId → 404', async () => {
    const res = await request(app).get('/api/swarm/runs/swr_nope/events');
    expect(res.status).toBe(404);
  });

  it('完成的 run → 立即返回全部 events + res.end (SSE replay)', async () => {
    const start = await request(app).post('/api/swarm/runs').send({
      stockCode: '600519',
      presetId: 'investment_committee',
    });
    await waitForSwarmComplete(start.body.runId);

    const res = await request(app)
      .get(`/api/swarm/runs/${start.body.runId}/events`)
      .buffer(true)
      .parse((r, cb) => {
        let raw = '';
        r.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')));
        r.on('end', () => cb(null, raw));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.headers['x-accel-buffering']).toBe('no');

    const text = res.body as string;
    expect(text).toContain('"type":"swarm_started"');
    expect(text).toContain('"type":"agent_started"');
    expect(text).toContain('"type":"swarm_completed"');
    // 5 agent 都应出现
    expect(text).toContain('"agentId":"bull_advocate"');
    expect(text).toContain('"agentId":"portfolio_manager"');
    expect(text).toContain('"agentId":"synthesizer"');
  });
});
