// Swarm HTTP endpoints + SSE.
//
// POST   /api/swarm/runs              → 启动 swarm, 返回 runId + streamUrl
// GET    /api/swarm/runs/:runId/events → SSE 流 (replay buffer + 推送 live)
// POST   /api/swarm/runs/:runId/abort → 用户主动 abort
// POST   /api/swarm/runs/:runId/feedback → C4 用户决策记录
//
// C1 TTL: runRegistry.start() 在 index.ts startup 调用.

import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type {
  SwarmEvent,
  PortfolioManagerOutput,
  MarketData,
  AnalysisResult,
} from '@trade/shared';
import { fetchRealtime, fetchKLine, UpstreamUnavailableError } from '../services/market.js';
import { analyze } from '../services/analyzer.js';
import {
  runSwarm,
  runRegistry,
  loadPreset,
  validatePreset,
} from '../services/swarm/index.js';
import type { PresetSpec } from '../services/swarm/types.js';
import { swarmEventBus } from '../services/swarm/event-bus.js';
import { ValidationWriter } from '../services/swarm/validation-writer.js';
import { feedbackWriter, DuplicateFeedbackError } from '../services/swarm/feedback-writer.js';
import { Semaphore } from '../services/swarm/semaphore.js';

void validatePreset; // 触发 type 检查, 防止 lint 抹掉 import

// ---- C5 batch 配置 ----

const MAX_BATCH = 10;
const BATCH_CONCURRENCY = 2; // plan-eng-review D4: Anthropic Tier 1 安全

// ---- Request schemas ----

const StartRunSchema = z.object({
  stockCode: z.string().regex(/^\d{6}$/, 'stockCode 必须是 6 位数字'),
  presetId: z.string().min(1),
  totalCapital: z.number().positive().optional(),
  tradeMode: z.enum(['grid', 'condition', 'auto']).optional(),
  isT0Mode: z.boolean().optional(),
});

const FeedbackSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('accept') }),
  z.object({ decision: z.literal('reject') }),
  z.object({
    decision: z.literal('modify'),
    modifiedPositionPct: z.number().min(0).max(100),
  }),
]);

// ---- Validation writer (lazy: 每次读 env, 让测试可改路径) ----

function getValidationWriter(): ValidationWriter {
  const dir =
    process.env.SWARM_VALIDATION_DIR ||
    `${process.cwd()}/../../docs/validation`;
  return new ValidationWriter(dir);
}

// ---- Helper: 把 emit 写入 event bus ----

function makeEmit(runId: string): (event: SwarmEvent) => void {
  return (event) => {
    swarmEventBus.emit(runId, event);
  };
}

// ---- 共享: 一个 run 的 background 跑完 + state 转移 + C3 validation ----

async function executeSwarmRun(
  runId: string,
  preset: PresetSpec,
  market: MarketData,
  analysis: AnalysisResult,
): Promise<void> {
  const entry = runRegistry.get(runId);
  if (!entry) return;
  runRegistry.markRunning(runId);
  try {
    await runSwarm({
      preset,
      market,
      analysis,
      runId,
      signal: entry.ctrl.signal,
      emit: makeEmit(runId),
      onHeartbeat: () => runRegistry.heartbeat(runId),
    });
  } catch (err) {
    console.error('[swarm] runSwarm threw:', err);
    swarmEventBus.emit(runId, {
      type: 'swarm_error',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // post-completion: 根据 last event 决定 registry state + C3
  const buffered = swarmEventBus.buffered(runId);
  const last = buffered[buffered.length - 1];
  if (last?.type === 'swarm_completed') {
    runRegistry.markDone(runId);
    const completed = last as Extract<SwarmEvent, { type: 'swarm_completed' }>;
    void getValidationWriter()
      .record(
        ValidationWriter.fromVerdict({
          market,
          verdict: completed.verdict as PortfolioManagerOutput,
          mode: 'swarm',
        }),
      )
      .catch((e) => console.error('[swarm] validation writer failed:', e));
  } else if (last?.type === 'swarm_error') {
    runRegistry.markError(runId);
  }
}

// ---- Router ----

export const swarmRouter: Router = Router();

/** POST /api/swarm/runs — 启动 */
swarmRouter.post('/runs', async (req: Request, res: Response) => {
  const parse = StartRunSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({
      error: 'INVALID_BODY',
      message: parse.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
    return;
  }
  const body = parse.data;

  if (!process.env.LLM_API_KEY) {
    res.status(503).json({
      error: 'NO_LLM_KEY',
      message: 'LLM_API_KEY 未配置, swarm 不可用. 请用 single 模式或配置 API key.',
    });
    return;
  }

  // load preset
  let preset;
  try {
    preset = loadPreset(body.presetId);
  } catch (err) {
    res.status(404).json({
      error: 'UNKNOWN_PRESET',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // fetch market + klines
  let market, klines;
  try {
    [market, klines] = await Promise.all([
      fetchRealtime(body.stockCode, { retries: 2, timeoutMs: 8000 }),
      fetchKLine(body.stockCode, 60, { retries: 2, timeoutMs: 8000, period: 'daily' }),
    ]);
  } catch (err) {
    if (err instanceof UpstreamUnavailableError) {
      res.status(503).json({ error: 'UPSTREAM_UNAVAILABLE', message: '行情服务暂时连不上' });
    } else if (err instanceof Error && err.message === 'STOCK_NOT_FOUND') {
      res.status(404).json({ error: 'STOCK_NOT_FOUND', message: '股票代码未找到' });
    } else {
      console.error('[swarm] fetch market failed:', err);
      res.status(500).json({ error: 'SERVER_ERROR', message: 'fetch market failed' });
    }
    return;
  }

  // analyze 接受 'grid' | 'condition' | undefined; 'auto' 等同 undefined (自动判定)
  const forceMode = body.tradeMode === 'grid' || body.tradeMode === 'condition'
    ? body.tradeMode
    : undefined;
  const analysis = analyze(market, klines, forceMode);

  // create run + bus
  const entry = runRegistry.create({ stockCode: body.stockCode, presetId: body.presetId });
  swarmEventBus.init(entry.runId);

  // 异步启动 swarm, 不等
  void executeSwarmRun(entry.runId, preset, market, analysis);

  res.status(201).json({
    runId: entry.runId,
    streamUrl: `/api/swarm/runs/${entry.runId}/events`,
  });
});

// ---- C5 Batch endpoint ----

const BatchRunSchema = z.object({
  stockCodes: z
    .array(z.string().regex(/^\d{6}$/, '股票代码必须是 6 位数字'))
    .min(1, '至少 1 只股票')
    .max(MAX_BATCH, `最多 ${MAX_BATCH} 只股票`),
  presetId: z.string().min(1),
  totalCapital: z.number().positive().optional(),
  tradeMode: z.enum(['grid', 'condition', 'auto']).optional(),
});

/** POST /api/swarm/batch-runs — 批量召开委员会 (C5, 并发上限 2) */
swarmRouter.post('/batch-runs', async (req: Request, res: Response) => {
  const parse = BatchRunSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({
      error: 'INVALID_BODY',
      message: parse.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
    return;
  }
  if (!process.env.LLM_API_KEY) {
    res.status(503).json({
      error: 'NO_LLM_KEY',
      message: 'LLM_API_KEY 未配置, swarm 不可用.',
    });
    return;
  }

  let preset: PresetSpec;
  try {
    preset = loadPreset(parse.data.presetId);
  } catch (err) {
    res.status(404).json({
      error: 'UNKNOWN_PRESET',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const batchId = `swb_${randomUUID().slice(0, 12)}`;
  const sem = new Semaphore(BATCH_CONCURRENCY);
  const tradeMode = parse.data.tradeMode;
  const forceMode = tradeMode === 'grid' || tradeMode === 'condition' ? tradeMode : undefined;

  // 为每个 code 创建 runId + 异步启动 (semaphore wrap)
  const runs = parse.data.stockCodes.map((code) => {
    const entry = runRegistry.create({ stockCode: code, presetId: parse.data.presetId });
    swarmEventBus.init(entry.runId);

    void (async () => {
      await sem.acquire();
      try {
        if (entry.ctrl.signal.aborted) {
          swarmEventBus.emit(entry.runId, { type: 'swarm_aborted', reason: 'user_cancel' });
          return;
        }
        const [market, klines] = await Promise.all([
          fetchRealtime(code, { retries: 2, timeoutMs: 8000 }),
          fetchKLine(code, 60, { retries: 2, timeoutMs: 8000, period: 'daily' }),
        ]);
        const analysis = analyze(market, klines, forceMode);
        await executeSwarmRun(entry.runId, preset, market, analysis);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[swarm] batch run ${code} failed:`, msg);
        swarmEventBus.emit(entry.runId, { type: 'swarm_error', message: msg });
        runRegistry.markError(entry.runId);
      } finally {
        sem.release();
      }
    })();

    return {
      stockCode: code,
      runId: entry.runId,
      streamUrl: `/api/swarm/runs/${entry.runId}/events`,
    };
  });

  res.status(201).json({ batchId, runs });
});

/** GET /api/swarm/runs/:runId — 状态查询 (C8 last-run recovery 用) */
swarmRouter.get('/runs/:runId', (req: Request, res: Response) => {
  const runId = String(req.params.runId);
  const entry = runRegistry.get(runId);
  if (!entry) {
    res.status(404).json({ error: 'UNKNOWN_RUN', message: 'runId 不存在或已过期' });
    return;
  }
  res.json({
    runId: entry.runId,
    state: entry.state,
    stockCode: entry.meta.stockCode ?? null,
    presetId: entry.meta.presetId ?? null,
    createdAt: entry.createdAt,
    finishedAt: entry.finishedAt ?? null,
  });
});

/** GET /api/swarm/runs/:runId/events — SSE 流 */
swarmRouter.get('/runs/:runId/events', (req: Request, res: Response) => {
  const runId = String(req.params.runId);
  const entry = runRegistry.get(runId);
  if (!entry) {
    res.status(404).json({ error: 'UNKNOWN_RUN', message: 'runId 不存在或已过期' });
    return;
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const writeEvent = (event: SwarmEvent): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Replay buffered
  for (const event of swarmEventBus.buffered(runId)) {
    writeEvent(event);
  }

  // 已 closed → 立即关闭
  if (swarmEventBus.isClosed(runId)) {
    res.end();
    return;
  }

  // 订阅 live events
  const unsubscribe = swarmEventBus.subscribe(runId, (event) => {
    writeEvent(event);
    if (
      event.type === 'swarm_completed' ||
      event.type === 'swarm_error' ||
      event.type === 'swarm_aborted'
    ) {
      cleanup();
      res.end();
    }
  });

  // Keepalive ping 15s (注释行不触发 onmessage)
  const ping = setInterval(() => {
    res.write(': ping\n\n');
    runRegistry.heartbeat(runId);
  }, 15_000);
  ping.unref?.();

  const cleanup = () => {
    unsubscribe();
    clearInterval(ping);
  };

  req.on('close', cleanup);
});

/** POST /api/swarm/runs/:runId/abort */
swarmRouter.post('/runs/:runId/abort', (req: Request, res: Response) => {
  const runId = String(req.params.runId);
  const entry = runRegistry.get(runId);
  if (!entry) {
    res.status(404).json({ error: 'UNKNOWN_RUN', message: 'runId 不存在' });
    return;
  }
  const aborted = runRegistry.abort(runId, 'user_cancel');
  if (!aborted) {
    // 已 terminal — noop 但返回 204 一致
    res.status(204).end();
    return;
  }
  // emit swarm_aborted 到 event bus (runtime 内部也会 emit, 但万一 runtime 没在 active 阶段, 这里兜底)
  if (!swarmEventBus.isClosed(runId)) {
    swarmEventBus.emit(runId, { type: 'swarm_aborted', reason: 'user_cancel' });
  }
  res.status(204).end();
});

/** POST /api/swarm/runs/:runId/feedback (C4) */
swarmRouter.post('/runs/:runId/feedback', async (req: Request, res: Response) => {
  const runId = String(req.params.runId);
  const entry = runRegistry.get(runId);
  if (!entry) {
    res.status(404).json({ error: 'UNKNOWN_RUN', message: 'runId 不存在' });
    return;
  }

  const parse = FeedbackSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({
      error: 'INVALID_BODY',
      message: parse.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
    return;
  }

  // 找出 swarm_completed 提取 verdict + stockCode (从 bus buffered)
  const buffered = swarmEventBus.buffered(runId);
  const completed = buffered.find((e) => e.type === 'swarm_completed') as
    | Extract<SwarmEvent, { type: 'swarm_completed' }>
    | undefined;
  if (!completed) {
    res.status(409).json({
      error: 'NOT_COMPLETED',
      message: 'swarm 未完成, 无 verdict 可反馈',
    });
    return;
  }

  const stockCode = entry.meta.stockCode ?? 'unknown';

  const entryToWrite = {
    runId,
    timestamp: new Date().toISOString(),
    stockCode,
    verdict: completed.verdict.verdict,
    decision: parse.data.decision,
    ...(parse.data.decision === 'modify'
      ? { modifiedPositionPct: parse.data.modifiedPositionPct }
      : {}),
  };

  try {
    await feedbackWriter.record(entryToWrite);
    res.status(204).end();
  } catch (err) {
    if (err instanceof DuplicateFeedbackError) {
      res.status(409).json({ error: 'DUPLICATE', message: '本次辩论已记录过反馈' });
    } else {
      console.error('[swarm] feedback writer failed:', err);
      res.status(500).json({ error: 'SERVER_ERROR', message: 'feedback write failed' });
    }
  }
});
