// Smoke test for swarm engine.
//
// Usage:
//   LLM_API_KEY=sk-ant-... pnpm tsx scripts/test-swarm.ts
//   LLM_API_KEY=sk-ant-... pnpm tsx scripts/test-swarm.ts --live 600519
//
// 默认模式: hardcoded fixture (无需网络), 仅测试 LLM 调用 + 编排 + 解析.
// --live: 从真实 market.ts 拉数据 (需要东方财富可达).

import 'dotenv/config';
import { fetchRealtime, fetchKLine } from '../src/services/market.js';
import { analyze } from '../src/services/analyzer.js';
import { runSwarm } from '../src/services/swarm/runtime.js';
import { loadPreset } from '../src/services/swarm/preset-loader.js';
import { runRegistry } from '../src/services/swarm/run-registry.js';
import type { MarketData, AnalysisResult, SwarmEvent } from '@trade/shared';

// ---- Fixtures (默认模式) ----

const FIXTURE_MARKET: MarketData = {
  code: '600519',
  name: '贵州茅台',
  price: 1680.5,
  change: 1.23,
  volume: 12_345_678,
  turnover: 0.45,
  open: 1670.0,
  high: 1685.2,
  low: 1668.3,
  preClose: 1660.1,
};

const FIXTURE_ANALYSIS: AnalysisResult = {
  marketState: 'trending_up',
  bollinger: { upper: 1700, middle: 1680, lower: 1660, width: 0.024 },
  atr: 25.3,
  ma: { ma5: 1675.2, ma20: 1650.8, ma60: 1620.4 },
  support: 1650,
  resistance: 1700,
  recommendation: 'grid',
  confidence: 75,
  advanced: {
    rsi: { value: 62.4, signal: 'neutral' },
    macd: { dif: 12.5, dea: 10.2, histogram: 2.3, signal: 'golden_cross' },
    kdj: { k: 65.1, d: 58.3, j: 78.7, signal: 'neutral' },
    wr: { value: -32.5, signal: 'neutral' },
    amplitude: 1.02,
    volumeRatio: 1.8,
    limitDistance: { up: 8.4, down: 11.6 },
    maArrangement: 'bullish_alignment',
  },
};

// ---- CLI ----

async function loadLive(stockCode: string): Promise<{ market: MarketData; analysis: AnalysisResult }> {
  console.log(`[live] 拉取 ${stockCode} 行情...`);
  const [market, klines] = await Promise.all([
    fetchRealtime(stockCode, { retries: 2, timeoutMs: 8000 }),
    fetchKLine(stockCode, 60, { retries: 2, timeoutMs: 8000, period: 'daily' }),
  ]);
  const analysis = analyze(market, klines, 'auto');
  return { market, analysis };
}

async function main() {
  if (!process.env.LLM_API_KEY) {
    console.error('❌ LLM_API_KEY 未设置. 用法: LLM_API_KEY=... pnpm tsx scripts/test-swarm.ts');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const stockCode = args.find((a) => /^\d{6}$/.test(a)) ?? '600519';

  let market: MarketData;
  let analysis: AnalysisResult;
  if (live) {
    ({ market, analysis } = await loadLive(stockCode));
  } else {
    market = FIXTURE_MARKET;
    analysis = FIXTURE_ANALYSIS;
    console.log(`[fixture] 用固定 ${market.name} ${market.code} 行情 (跳过 --live 用真实数据)`);
  }

  const preset = loadPreset('investment_committee');
  console.log(`[preset] 加载 ${preset.title} (${preset.agents.length} agent)\n`);

  runRegistry.start();
  const entry = runRegistry.create();
  console.log(`[run] runId=${entry.runId}\n`);

  // Ctrl-C abort
  const onSigint = () => {
    console.log('\n[smoke] 收到 Ctrl-C, 触发 abort...');
    runRegistry.abort(entry.runId, 'user_cancel');
  };
  process.once('SIGINT', onSigint);

  const startedAt = Date.now();
  let agentChunkCount = 0;

  await runSwarm({
    preset,
    market,
    analysis,
    runId: entry.runId,
    signal: entry.ctrl.signal,
    onHeartbeat: () => runRegistry.heartbeat(entry.runId),
    emit: (event: SwarmEvent) => {
      switch (event.type) {
        case 'swarm_started':
          console.log(`▶ swarm_started — agents: ${event.agentIds.join(', ')}`);
          break;
        case 'agent_started':
          console.log(`\n┃ ▶ ${event.agentId} (#${event.index}) 开始...`);
          break;
        case 'agent_chunk':
          // 不打印每个 chunk (太吵), 累计计数
          agentChunkCount++;
          process.stdout.write('.');
          break;
        case 'agent_completed':
          console.log(`\n┃ ✓ ${event.agentId} 完成`);
          console.log(`┃   output: ${JSON.stringify(event.output, null, 2).split('\n').join('\n┃   ')}`);
          break;
        case 'agent_failed':
          console.log(`\n┃ ❌ ${event.agentId} 失败: ${event.message}`);
          break;
        case 'swarm_completed':
          console.log(`\n\n✅ swarm_completed (${event.durationMs}ms, ${agentChunkCount} chunks)`);
          console.log('\n=== Final Verdict ===');
          console.log(JSON.stringify(event.verdict, null, 2));
          if (event.synthesis) {
            console.log('\n=== Synthesis ===');
            console.log(JSON.stringify(event.synthesis, null, 2));
          }
          break;
        case 'swarm_error':
          console.log(`\n\n❌ swarm_error: ${event.message}`);
          break;
        case 'swarm_aborted':
          console.log(`\n\n⏹ swarm_aborted: ${event.reason}`);
          break;
        default:
          console.log(`[?] unknown event: ${JSON.stringify(event)}`);
      }
    },
  });

  process.off('SIGINT', onSigint);
  runRegistry.stop();
  console.log(`\n[smoke] 总耗时 ${Date.now() - startedAt}ms`);
}

main().catch((err) => {
  console.error('❌ smoke test 失败:', err);
  process.exit(1);
});
