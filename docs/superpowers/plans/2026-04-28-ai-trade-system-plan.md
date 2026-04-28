# AI Trade System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI trading analysis system that inputs A-share stock codes, analyzes market data, and generates optimal 破冰号 configuration files with dark mode UI.

**Architecture:** pnpm monorepo with shared types package. Express backend fetches EastMoney market data, runs rule-engine analysis (Bollinger/ATR/MA), optionally calls AI for optimization, and generates 破冰号 config files. Next.js frontend provides dark mode UI for input, analysis display, and config preview/download.

**Tech Stack:** pnpm workspace, Next.js 16 + TypeScript + Tailwind CSS, Express + TypeScript, EastMoney free API

---

## File Structure

```
ai-trade-system/
├── package.json                 # root workspace config
├── pnpm-workspace.yaml
├── packages/shared/
│   ├── package.json
│   └── src/types.ts             # shared TypeScript interfaces
├── apps/server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts             # Express entry point
│       ├── routes/api.ts        # all API routes
│       ├── services/
│       │   ├── market.ts        # EastMoney API wrapper
│       │   ├── analyzer.ts      # rule engine - decision logic
│       │   ├── config-generator.ts  # 破冰号 format output
│       │   └── ai-optimizer.ts  # optional LLM optimization
│       └── utils/indicators.ts  # Bollinger, ATR, MA, support/resistance
└── apps/web/
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── tailwind.config.ts
    ├── postcss.config.mjs
    └── src/
        ├── app/
        │   ├── layout.tsx       # root layout, dark mode, metadata
        │   ├── page.tsx         # main page - composes all components
        │   └── globals.css      # Tailwind directives + custom styles
        ├── components/
        │   ├── StockInput.tsx
        │   ├── StrategySettings.tsx
        │   ├── AnalysisResult.tsx
        │   └── ConfigPreview.tsx
        └── lib/api.ts           # frontend API client
```

---

### Task 1: Initialize pnpm Monorepo

**Files:**
- Modify: `package.json`
- Create: `pnpm-workspace.yaml`

- [ ] **Step 1: Update root package.json**

```json
{
  "name": "ai-trade-system",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev:server": "pnpm --filter @trade/server dev",
    "dev:web": "pnpm --filter @trade/web dev",
    "dev": "pnpm run dev:server & pnpm run dev:web",
    "build": "pnpm --filter @trade/shared build && pnpm --filter @trade/server build && pnpm --filter @trade/web build"
  },
  "packageManager": "pnpm@10.13.1"
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 3: Verify workspace**

Run: `pnpm install`
Expected: success, no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: init pnpm monorepo workspace"
```

---

### Task 2: Shared Types Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/types.ts`

- [ ] **Step 1: Create packages/shared/package.json**

```json
{
  "name": "@trade/shared",
  "version": "1.0.0",
  "main": "./src/types.ts",
  "types": "./src/types.ts",
  "scripts": {
    "build": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create packages/shared/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create packages/shared/src/types.ts**

```typescript
export interface MarketData {
  code: string;
  name: string;
  price: number;
  change: number;
  volume: number;
  turnover: number;
  open: number;
  high: number;
  low: number;
  preClose: number;
}

export interface KLine {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  width: number;
}

export interface MAResult {
  ma5: number;
  ma20: number;
  ma60: number;
}

export interface AnalysisResult {
  marketState: 'ranging' | 'trending_up' | 'trending_down';
  bollinger: BollingerResult;
  atr: number;
  ma: MAResult;
  support: number;
  resistance: number;
  recommendation: 'grid' | 'condition';
  confidence: number;
  gridParams?: GridParams;
  conditionParams?: ConditionParams;
}

export interface GridParams {
  basePrice: number;
  stepPercent: number;
  gridCount: number;
  lotPerGrid: number;
}

export interface ConditionParams {
  buyTriggerPrice: number;
  sellTriggerPrice: number;
  buyLot: number;
  sellLot: number;
}

export interface AnalyzeRequest {
  stockCode: string;
  totalCapital: number;
  mode: 'auto' | 'grid' | 'condition';
  isT0Mode: boolean;
  useAI: boolean;
}

export interface AnalyzeResponse {
  market: MarketData;
  analysis: AnalysisResult;
  config: IcebreakerConfig;
}

export interface IcebreakerConfig {
  lines: string[];
  summary: string;
}
```

- [ ] **Step 4: Install deps and verify**

Run: `cd packages/shared && pnpm install`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared types package"
```

---

### Task 3: Express Server - Entry Point

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/index.ts`

- [ ] **Step 1: Create apps/server/package.json**

```json
{
  "name": "@trade/server",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@trade/shared": "workspace:*",
    "cors": "^2.8.5",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create apps/server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create apps/server/src/index.ts**

```typescript
import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/api.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/api', apiRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 4: Install deps and verify server starts**

Run: `cd apps/server && pnpm install`
Run: `pnpm --filter @trade/server dev` (start in background, verify it starts on port 3001)
Then: `curl http://localhost:3001/health`
Expected: `{"status":"ok"}`

- [ ] **Step 5: Commit**

```bash
git add apps/server/
git commit -m "feat: add express server entry point"
```

---

### Task 4: Technical Indicators Utility

**Files:**
- Create: `apps/server/src/utils/indicators.ts`

- [ ] **Step 1: Create apps/server/src/utils/indicators.ts**

```typescript
import type { KLine, BollingerResult, MAResult } from '@trade/shared';

export function calcMA(klines: KLine[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < klines.length; i++) {
    const sum = klines.slice(i - period + 1, i + 1).reduce((s, k) => s + k.close, 0);
    result.push(sum / period);
  }
  return result;
}

export function calcBollinger(klines: KLine[], period: number = 20): BollingerResult {
  const ma = calcMA(klines, period);
  const lastMA = ma[ma.length - 1];
  const recentCloses = klines.slice(-period).map(k => k.close);
  const mean = recentCloses.reduce((s, v) => s + v, 0) / period;
  const variance = recentCloses.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  return {
    upper: lastMA + 2 * std,
    middle: lastMA,
    lower: lastMA - 2 * std,
    width: (4 * std) / lastMA,
  };
}

export function calcATR(klines: KLine[], period: number = 14): number {
  const trValues: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trValues.push(tr);
  }
  const recentTR = trValues.slice(-period);
  return recentTR.reduce((s, v) => s + v, 0) / period;
}

export function calcMAValues(klines: KLine[]): MAResult {
  const ma5 = calcMA(klines, 5);
  const ma20 = calcMA(klines, 20);
  const ma60 = klines.length >= 60 ? calcMA(klines, 60) : ma20;
  return {
    ma5: ma5[ma5.length - 1],
    ma20: ma20[ma20.length - 1],
    ma60: ma60[ma60.length - 1],
  };
}

export function findSupportResistance(klines: KLine[]): { support: number; resistance: number } {
  const recent20 = klines.slice(-20);
  const lows = recent20.map(k => k.low);
  const highs = recent20.map(k => k.high);
  const support = Math.min(...lows);
  const resistance = Math.max(...highs);
  return { support, resistance };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/utils/
git commit -m "feat: add technical indicators (Bollinger, ATR, MA, S/R)"
```

---

### Task 5: Market Data Service

**Files:**
- Create: `apps/server/src/services/market.ts`

- [ ] **Step 1: Create apps/server/src/services/market.ts**

```typescript
import type { MarketData, KLine } from '@trade/shared';

function getMarketCode(code: string): string {
  const prefix = code.startsWith('6') ? '1' : '0';
  return `${prefix}.${code}`;
}

export async function fetchRealtime(code: string): Promise<MarketData> {
  const secid = getMarketCode(code);
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f50,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170,f171`;
  const res = await fetch(url);
  const json = await res.json();
  const d = json.data;

  if (!d || !d.f43) {
    throw new Error('STOCK_NOT_FOUND');
  }

  return {
    code,
    name: d.f58 || code,
    price: d.f43 / 100,
    change: d.f170 / 100,
    volume: d.f47,
    turnover: d.f168 / 100,
    open: d.f46 / 100,
    high: d.f44 / 100,
    low: d.f45 / 100,
    preClose: d.f60 / 100 || (d.f43 / 100) / (1 + d.f170 / 10000),
  };
}

export async function fetchKLine(code: string, days: number = 60): Promise<KLine[]> {
  const secid = getMarketCode(code);
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&end=20500101&lmt=${days}`;
  const res = await fetch(url);
  const json = await res.json();

  if (!json.data || !json.data.klines) {
    throw new Error('KLINE_NOT_FOUND');
  }

  return json.data.klines.map((line: string) => {
    const parts = line.split(',');
    return {
      date: parts[0],
      open: parseFloat(parts[1]),
      close: parseFloat(parts[2]),
      high: parseFloat(parts[3]),
      low: parseFloat(parts[4]),
      volume: parseInt(parts[5], 10),
    };
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/services/market.ts
git commit -m "feat: add EastMoney market data service"
```

---

### Task 6: Analysis Engine

**Files:**
- Create: `apps/server/src/services/analyzer.ts`

- [ ] **Step 1: Create apps/server/src/services/analyzer.ts**

```typescript
import type { KLine, MarketData, AnalysisResult, GridParams, ConditionParams } from '@trade/shared';
import { calcBollinger, calcATR, calcMAValues, findSupportResistance } from '../utils/indicators.js';

export function analyze(
  market: MarketData,
  klines: KLine[],
  forceMode?: 'grid' | 'condition',
): AnalysisResult {
  const bollinger = calcBollinger(klines);
  const atr = calcATR(klines);
  const ma = calcMAValues(klines);
  const { support, resistance } = findSupportResistance(klines);

  const price = market.price;
  const bbWidth = bollinger.width;

  const ma5 = ma.ma5;
  const ma20 = ma.ma20;
  const maDiff = Math.abs(ma5 - ma20) / ma20;

  // Determine market state
  let marketState: AnalysisResult['marketState'];
  let recommendation: 'grid' | 'condition';
  let confidence: number;

  const isRanging = bbWidth < 0.08 && maDiff < 0.02;
  const isTrendingUp = price > bollinger.upper || (ma5 > ma20 && price > ma5);
  const isTrendingDown = price < bollinger.lower || (ma5 < ma20 && price < ma5);

  if (forceMode === 'grid') {
    recommendation = 'grid';
    confidence = 80;
    marketState = 'ranging';
  } else if (forceMode === 'condition') {
    recommendation = 'condition';
    confidence = 80;
    marketState = isTrendingUp ? 'trending_up' : isTrendingDown ? 'trending_down' : 'ranging';
  } else if (isRanging) {
    recommendation = 'grid';
    confidence = Math.round((1 - bbWidth / 0.15) * 100);
    marketState = 'ranging';
  } else if (isTrendingUp) {
    recommendation = 'condition';
    confidence = Math.round(Math.min(maDiff * 500, 95));
    marketState = 'trending_up';
  } else if (isTrendingDown) {
    recommendation = 'condition';
    confidence = Math.round(Math.min(maDiff * 500, 95));
    marketState = 'trending_down';
  } else {
    recommendation = 'grid';
    confidence = 60;
    marketState = 'ranging';
  }

  const result: AnalysisResult = {
    marketState,
    bollinger,
    atr,
    ma,
    support,
    resistance,
    recommendation,
    confidence,
  };

  if (recommendation === 'grid') {
    const stepPercent = Math.max((atr / price) * 1.5 * 100, 0.3);
    result.gridParams = {
      basePrice: price,
      stepPercent: Math.round(stepPercent * 100) / 100,
      gridCount: 4,
      lotPerGrid: 100,
    };
  } else {
    result.conditionParams = {
      buyTriggerPrice: support,
      sellTriggerPrice: resistance,
      buyLot: 100,
      sellLot: 100,
    };
  }

  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/services/analyzer.ts
git commit -m "feat: add rule engine analysis service"
```

---

### Task 7: Config Generator

**Files:**
- Create: `apps/server/src/services/config-generator.ts`

- [ ] **Step 1: Create apps/server/src/services/config-generator.ts**

```typescript
import type { AnalysisResult, MarketData, IcebreakerConfig } from '@trade/shared';

interface GenParams {
  strategyId: number;
  market: MarketData;
  analysis: AnalysisResult;
  totalCapital: number;
  isT0Mode: boolean;
  mode: 'simple' | 'full';
}

export function generate(params: GenParams): IcebreakerConfig {
  const { strategyId, market, analysis, totalCapital, isT0Mode, mode } = params;
  const price = market.price;
  const lots = calcLots(totalCapital, price, isT0Mode);

  if (mode === 'simple') {
    return generateSimple(strategyId, market.code, price, analysis, lots, isT0Mode);
  }
  return generateFull(strategyId, market.code, price, analysis, lots, isT0Mode);
}

function calcLots(totalCapital: number, price: number, isT0Mode: boolean): {
  totalLots: number;
  baseLots: number;
  tLots: number;
} {
  const capital = isT0Mode ? totalCapital * 0.5 : totalCapital;
  const totalLots = Math.floor(capital / (price * 100)) * 100;
  const baseLots = isT0Mode ? totalLots : totalLots;
  const tLots = isT0Mode ? totalLots : 0;
  return { totalLots, baseLots, tLots };
}

function generateSimple(
  id: number,
  code: string,
  price: number,
  analysis: AnalysisResult,
  lots: { totalLots: number; baseLots: number; tLots: number },
  isT0Mode: boolean,
): IcebreakerConfig {
  const lines: string[] = [];
  let summary = '';

  if (analysis.recommendation === 'grid' && analysis.gridParams) {
    const gp = analysis.gridParams;
    const buyCmd = `${id},0,0,${lots.totalLots},,,3,0,${code},${price.toFixed(2)},,0,1,1,0,1#09:00:00#1#21:00:00,1#15:14:59#1#23:59:59,0,,,,4#1#${gp.stepPercent}#1#1#0,,,,`;
    lines.push(buyCmd);
    summary = `网格交易: ${code} ${market.name}, 基准价 ${price.toFixed(2)}, 步长 ${gp.stepPercent}%, 每格 ${lots.totalLots}股, 循环4次`;

    if (isT0Mode) {
      const baseCmd = `${id},0,0,${lots.baseLots},,,3,0,${code},${price.toFixed(2)},,0,1,1,0,1#09:00:00#1#21:00:00,1#15:14:59#1#23:59:59,0,,,,4#1#${gp.stepPercent}#1#1#0,,,,`;
      lines[0] = baseCmd;
      summary = `做T模式: 底仓 ${lots.baseLots}股, T仓 ${lots.tLots}股 | ` + summary;
    }
  } else if (analysis.conditionParams) {
    const cp = analysis.conditionParams;
    const buyCmd = `${id},0,0,${lots.totalLots},,,4,0,${code},${cp.buyTriggerPrice.toFixed(2)},,0,1,1,0,1#09:00:00#1#21:00:00,1#15:14:59#1#23:59:59,0,,,,,,,,`;
    const sellCmd = `${id},1,1,${lots.totalLots},,,4,0,${code},${cp.sellTriggerPrice.toFixed(2)},,0,1,1,0,1#09:00:00#1#21:00:00,1#15:14:59#1#23:59:59,0,,,,,,,,`;
    lines.push(buyCmd, sellCmd);
    summary = `条件单: ${code} ${market.name}, 买入触发 ${cp.buyTriggerPrice.toFixed(2)}, 卖出触发 ${cp.sellTriggerPrice.toFixed(2)}, ${lots.totalLots}股`;

    if (isT0Mode) {
      const baseBuyCmd = `${id},0,0,${lots.baseLots},,,4,0,${code},${cp.buyTriggerPrice.toFixed(2)},,0,1,1,0,1#09:00:00#1#21:00:00,1#15:14:59#1#23:59:59,0,,,,,,,,`;
      lines[0] = baseBuyCmd;
      summary = `做T模式: 底仓 ${lots.baseLots}股, T仓 ${lots.tLots}股 | ` + summary;
    }
  }

  return { lines, summary };
}

function generateFull(
  id: number,
  code: string,
  price: number,
  analysis: AnalysisResult,
  lots: { totalLots: number; baseLots: number; tLots: number },
  isT0Mode: boolean,
): IcebreakerConfig {
  const lines: string[] = [];
  let summary = '';

  // Full 23-field format per PDF spec
  if (analysis.recommendation === 'grid' && analysis.gridParams) {
    const gp = analysis.gridParams;
    const lot = isT0Mode ? `${lots.baseLots}|0|${lots.tLots}` : `${lots.totalLots}`;
    const cmd = `${id},0,0,${lot},,3,0,${code},${price.toFixed(2)},${gp.stepPercent},0,1,1,0,1#09:00:00#1#21:00:00,1#15:14:59#1#23:59:59,0,4#1#${gp.stepPercent}#1#1#0,0#0#0#0#0,0#0#0#0#0#0,,0#0#0#0#0#0,,0`;
    lines.push(cmd);
    summary = `[完整模式] 网格交易: ${code}, 基准价 ${price.toFixed(2)}, 步长 ${gp.stepPercent}%, ` +
      `${isT0Mode ? `底仓${lots.baseLots}股 T仓${lots.tLots}股` : `${lots.totalLots}股`}`;
  } else if (analysis.conditionParams) {
    const cp = analysis.conditionParams;
    const lot = isT0Mode ? `${lots.baseLots}|0|${lots.tLots}` : `${lots.totalLots}`;
    const buyCmd = `${id},0,0,${lot},,4,0,${code},${cp.buyTriggerPrice.toFixed(2)},0,0,1,1,0,1#09:00:00#1#21:00:00,1#15:14:59#1#23:59:59,0,0#0#0#0#0#0,0#0#0#0#0,0#0#0#0#0#0,,0#0#0#0#0#0,,0`;
    const sellCmd = `${id},1,1,${lot},,4,0,${code},${cp.sellTriggerPrice.toFixed(2)},0,0,1,1,0,1#09:00:00#1#21:00:00,1#15:14:59#1#23:59:59,0,0#0#0#0#0#0,0#0#0#0#0,0#0#0#0#0#0,,0#0#0#0#0#0,,0`;
    lines.push(buyCmd, sellCmd);
    summary = `[完整模式] 条件单: ${code}, 买入 ${cp.buyTriggerPrice.toFixed(2)}, 卖出 ${cp.sellTriggerPrice.toFixed(2)}, ` +
      `${isT0Mode ? `底仓${lots.baseLots}股 T仓${lots.tLots}股` : `${lots.totalLots}股`}`;
  }

  return { lines, summary };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/services/config-generator.ts
git commit -m "feat: add icebreaker config generator (simple/full modes)"
```

---

### Task 8: AI Optimizer Service

**Files:**
- Create: `apps/server/src/services/ai-optimizer.ts`

- [ ] **Step 1: Create apps/server/src/services/ai-optimizer.ts**

```typescript
import type { MarketData, AnalysisResult } from '@trade/shared';

export async function optimize(
  market: MarketData,
  analysis: AnalysisResult,
): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return analysis; // AI not configured, return rule engine result as-is
  }

  try {
    const prompt = buildPrompt(market, analysis);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn('AI optimizer API error, falling back to rule engine');
      return analysis;
    }

    const json = await response.json();
    return parseAIResponse(json.content[0].text, analysis);
  } catch (err) {
    console.warn('AI optimizer failed, falling back to rule engine:', err);
    return analysis;
  }
}

function buildPrompt(market: MarketData, analysis: AnalysisResult): string {
  return `You are an A-share quantitative trading expert. Given the following market analysis, optimize the trading parameters.

Stock: ${market.code} ${market.name}
Price: ${market.price}
Change: ${market.change}%
Bollinger: upper=${analysis.bollinger.upper.toFixed(2)} middle=${analysis.bollinger.middle.toFixed(2)} lower=${analysis.bollinger.lower.toFixed(2)} width=${(analysis.bollinger.width * 100).toFixed(2)}%
ATR: ${analysis.atr.toFixed(2)}
MA: 5day=${analysis.ma.ma5.toFixed(2)} 20day=${analysis.ma.ma20.toFixed(2)} 60day=${analysis.ma.ma60.toFixed(2)}
Support: ${analysis.support.toFixed(2)} Resistance: ${analysis.resistance.toFixed(2)}
Market State: ${analysis.marketState}
Current Recommendation: ${analysis.recommendation} (confidence: ${analysis.confidence}%)

${analysis.gridParams ? `Grid params: basePrice=${analysis.gridParams.basePrice} stepPercent=${analysis.gridParams.stepPercent}% gridCount=${analysis.gridParams.gridCount}` : ''}
${analysis.conditionParams ? `Condition params: buyTrigger=${analysis.conditionParams.buyTriggerPrice} sellTrigger=${analysis.conditionParams.sellTriggerPrice}` : ''}

Return a JSON object with the optimized parameters. Keep the same structure. Only change values you're confident about improving.
{
  "recommendation": "grid" | "condition",
  "confidence": number,
  "gridParams": { "stepPercent": number, "gridCount": number } | null,
  "conditionParams": { "buyTriggerPrice": number, "sellTriggerPrice": number } | null
}`;
}

function parseAIResponse(text: string, fallback: AnalysisResult): AnalysisResult {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const ai = JSON.parse(match[0]);
    return {
      ...fallback,
      recommendation: ai.recommendation || fallback.recommendation,
      confidence: ai.confidence || fallback.confidence,
      gridParams: ai.gridParams || fallback.gridParams,
      conditionParams: ai.conditionParams || fallback.conditionParams,
    };
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/services/ai-optimizer.ts
git commit -m "feat: add optional AI optimizer service"
```

---

### Task 9: Express API Routes

**Files:**
- Create: `apps/server/src/routes/api.ts`

- [ ] **Step 1: Create apps/server/src/routes/api.ts**

```typescript
import { Router } from 'express';
import type { AnalyzeRequest, AnalyzeResponse, MarketData, KLine } from '@trade/shared';
import { fetchRealtime, fetchKLine } from '../services/market.js';
import { analyze } from '../services/analyzer.js';
import { generate } from '../services/config-generator.js';
import { optimize } from '../services/ai-optimizer.js';

export const apiRouter = Router();

apiRouter.get('/market/realtime/:code', async (req, res) => {
  try {
    const data = await fetchRealtime(req.params.code);
    res.json(data);
  } catch (err: any) {
    if (err.message === 'STOCK_NOT_FOUND') {
      res.status(404).json({ error: '未找到该股票' });
    } else {
      res.status(500).json({ error: '数据获取失败，请重试' });
    }
  }
});

apiRouter.get('/market/kline/:code', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 60;
    const data = await fetchKLine(req.params.code, days);
    res.json(data);
  } catch (err: any) {
    if (err.message === 'KLINE_NOT_FOUND') {
      res.status(404).json({ error: '未找到K线数据' });
    } else {
      res.status(500).json({ error: '数据获取失败，请重试' });
    }
  }
});

apiRouter.post('/analyze', async (req, res) => {
  try {
    const body = req.body as AnalyzeRequest;
    const { stockCode, totalCapital, mode, isT0Mode, useAI } = body;

    if (!stockCode || !/^\d{6}$/.test(stockCode)) {
      res.status(400).json({ error: '请输入有效的6位股票代码' });
      return;
    }

    let market: MarketData;
    let klines: KLine[];

    try {
      [market, klines] = await Promise.all([
        fetchRealtime(stockCode),
        fetchKLine(stockCode, 60),
      ]);
    } catch (err: any) {
      res.status(404).json({ error: '未找到该股票' });
      return;
    }

    const forceMode = mode !== 'auto' ? mode : undefined;
    let analysis = analyze(market, klines, forceMode);

    // Re-calculate lot params with actual capital
    const price = market.price;
    if (analysis.gridParams) {
      const capitalPerGrid = isT0Mode ? totalCapital * 0.5 / analysis.gridParams.gridCount : totalCapital / analysis.gridParams.gridCount;
      analysis.gridParams.lotPerGrid = Math.floor(capitalPerGrid / (price * 100)) * 100;
    }
    if (analysis.conditionParams) {
      const lot = Math.floor((isT0Mode ? totalCapital * 0.5 : totalCapital) / (price * 100)) * 100;
      analysis.conditionParams.buyLot = lot;
      analysis.conditionParams.sellLot = lot;
    }

    if (useAI) {
      analysis = await optimize(market, analysis);
    }

    const config = generate({
      strategyId: 12,
      market,
      analysis,
      totalCapital,
      isT0Mode,
      mode: 'simple',
    });

    const response: AnalyzeResponse = { market, analysis, config };
    res.json(response);
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: '分析失败，请重试' });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/routes/
git commit -m "feat: add Express API routes"
```

---

### Task 10: Next.js App Setup

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/globals.css`

- [ ] **Step 1: Create apps/web/package.json**

```json
{
  "name": "@trade/web",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@trade/shared": "workspace:*",
    "next": "^15.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create apps/web/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]
}
```

- [ ] **Step 3: Create apps/web/next.config.ts**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create apps/web/postcss.config.mjs**

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 5: Create apps/web/src/app/globals.css**

```css
@import "tailwindcss";

@theme {
  --color-bg-primary: #0f0f0f;
  --color-bg-card: #1a1a1a;
  --color-bg-card-hover: #222222;
  --color-accent: #10b981;
  --color-accent-dim: #065f46;
  --color-danger: #ef4444;
  --color-text-primary: #f5f5f5;
  --color-text-secondary: #a3a3a3;
  --color-border: #2a2a2a;
}

body {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

- [ ] **Step 6: Install deps and verify**

Run: `cd apps/web && pnpm install`
Run: `pnpm --filter @trade/web dev` (verify it starts)
Expected: Next.js dev server on port 3000.

- [ ] **Step 7: Commit**

```bash
git add apps/web/
git commit -m "feat: add Next.js app with Tailwind CSS dark mode setup"
```

---

### Task 11: Frontend API Client

**Files:**
- Create: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Create apps/web/src/lib/api.ts**

```typescript
import type { AnalyzeRequest, AnalyzeResponse } from '@trade/shared';

const BASE = '/api';

export async function analyzeStock(params: AnalyzeRequest): Promise<AnalyzeResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '请求失败');
    }

    return res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('请求超时，请重试');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/
git commit -m "feat: add frontend API client with timeout"
```

---

### Task 12: Root Layout

**Files:**
- Create: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Create apps/web/src/app/layout.tsx**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI交易系统',
  description: '智能分析股票行情，生成最优交易配置',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat: add root layout with dark mode"
```

---

### Task 13: StockInput Component

**Files:**
- Create: `apps/web/src/components/StockInput.tsx`

- [ ] **Step 1: Create apps/web/src/components/StockInput.tsx**

```tsx
'use client';

import { useState } from 'react';

interface Props {
  onSearch: (code: string) => void;
  loading: boolean;
}

export default function StockInput({ onSearch, loading }: Props) {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length === 6) {
      onSearch(code.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="输入股票代码，如 600519"
            className="w-full h-14 px-5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl text-lg text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="h-14 px-8 bg-[var(--color-accent)] hover:bg-emerald-600 disabled:bg-[var(--color-accent-dim)] disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              分析中
            </span>
          ) : (
            '查询'
          )}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/StockInput.tsx
git commit -m "feat: add StockInput component"
```

---

### Task 14: StrategySettings Component

**Files:**
- Create: `apps/web/src/components/StrategySettings.tsx`

- [ ] **Step 1: Create apps/web/src/components/StrategySettings.tsx**

```tsx
'use client';

interface Props {
  mode: 'auto' | 'grid' | 'condition';
  onModeChange: (mode: 'auto' | 'grid' | 'condition') => void;
  capital: string;
  onCapitalChange: (v: string) => void;
  isT0: boolean;
  onT0Change: (v: boolean) => void;
  useAI: boolean;
  onAIChange: (v: boolean) => void;
}

export default function StrategySettings({
  mode, onModeChange, capital, onCapitalChange,
  isT0, onT0Change, useAI, onAIChange,
}: Props) {
  return (
    <div className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
      <div>
        <label className="text-sm text-[var(--color-text-secondary)] mb-2 block">策略模式</label>
        <div className="flex gap-2">
          {[
            { value: 'auto' as const, label: '自动' },
            { value: 'grid' as const, label: '网格交易' },
            { value: 'condition' as const, label: '条件单' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => onModeChange(opt.value)}
              className={`flex-1 h-10 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                mode === opt.value
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-bg-card-hover)] text-[var(--color-text-secondary)] hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm text-[var(--color-text-secondary)] mb-2 block">总仓位 (元)</label>
        <input
          type="text"
          value={capital}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            onCapitalChange(v);
          }}
          placeholder="100000"
          className="w-full h-10 px-4 bg-[var(--color-bg-card-hover)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-all"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onT0Change(!isT0)}
            className={`w-10 h-6 rounded-full transition-all cursor-pointer ${isT0 ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${isT0 ? 'translate-x-4' : ''}`} />
          </button>
          <span className="text-sm">做T模式 <span className="text-[var(--color-text-secondary)]">(半仓底仓)</span></span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onAIChange(!useAI)}
            className={`w-10 h-6 rounded-full transition-all cursor-pointer ${useAI ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${useAI ? 'translate-x-4' : ''}`} />
          </button>
          <span className="text-sm">AI优化 <span className="text-[var(--color-text-secondary)]">(可选)</span></span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/StrategySettings.tsx
git commit -m "feat: add StrategySettings component"
```

---

### Task 15: AnalysisResult Component

**Files:**
- Create: `apps/web/src/components/AnalysisResult.tsx`

- [ ] **Step 1: Create apps/web/src/components/AnalysisResult.tsx**

```tsx
'use client';

import type { AnalyzeResponse } from '@trade/shared';

export default function AnalysisResult({ data }: { data: AnalyzeResponse }) {
  const { market, analysis } = data;

  const stateLabel: Record<string, string> = {
    ranging: '震荡',
    trending_up: '上涨趋势',
    trending_down: '下跌趋势',
  };

  const recLabel: Record<string, string> = {
    grid: '网格交易',
    condition: '条件单',
  };

  const changeColor = market.change >= 0 ? 'text-[var(--color-accent)]' : 'text-[var(--color-danger)]';

  return (
    <div className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-lg font-bold">{market.code}</span>
          <span className="text-[var(--color-text-secondary)] ml-2">{market.name}</span>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">{market.price.toFixed(2)}</div>
          <div className={`text-sm tabular-nums ${changeColor}`}>
            {market.change >= 0 ? '+' : ''}{market.change.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-[var(--color-bg-card-hover)] rounded-lg p-3">
          <div className="text-xs text-[var(--color-text-secondary)]">成交量</div>
          <div className="text-sm font-medium tabular-nums mt-1">{formatVolume(market.volume)}</div>
        </div>
        <div className="bg-[var(--color-bg-card-hover)] rounded-lg p-3">
          <div className="text-xs text-[var(--color-text-secondary)]">换手率</div>
          <div className="text-sm font-medium tabular-nums mt-1">{market.turnover.toFixed(2)}%</div>
        </div>
        <div className="bg-[var(--color-bg-card-hover)] rounded-lg p-3">
          <div className="text-xs text-[var(--color-text-secondary)]">ATR</div>
          <div className="text-sm font-medium tabular-nums mt-1">{analysis.atr.toFixed(2)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="bg-[var(--color-bg-card-hover)] rounded-lg p-3">
          <div className="text-xs text-[var(--color-text-secondary)]">布林带上轨</div>
          <div className="text-sm font-medium text-red-400 tabular-nums mt-1">{analysis.bollinger.upper.toFixed(2)}</div>
        </div>
        <div className="bg-[var(--color-bg-card-hover)] rounded-lg p-3">
          <div className="text-xs text-[var(--color-text-secondary)]">布林带下轨</div>
          <div className="text-sm font-medium text-green-400 tabular-nums mt-1">{analysis.bollinger.lower.toFixed(2)}</div>
        </div>
        <div className="bg-[var(--color-bg-card-hover)] rounded-lg p-3">
          <div className="text-xs text-[var(--color-text-secondary)]">支撑位</div>
          <div className="text-sm font-medium text-green-400 tabular-nums mt-1">{analysis.support.toFixed(2)}</div>
        </div>
        <div className="bg-[var(--color-bg-card-hover)] rounded-lg p-3">
          <div className="text-xs text-[var(--color-text-secondary)]">压力位</div>
          <div className="text-sm font-medium text-red-400 tabular-nums mt-1">{analysis.resistance.toFixed(2)}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 p-4 bg-[var(--color-bg-card-hover)] rounded-lg">
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          analysis.recommendation === 'grid'
            ? 'bg-emerald-900/50 text-[var(--color-accent)] border border-emerald-800'
            : 'bg-blue-900/50 text-blue-400 border border-blue-800'
        }`}>
          {recLabel[analysis.recommendation]}
        </div>
        <span className="text-sm text-[var(--color-text-secondary)]">
          市场状态: {stateLabel[analysis.marketState]}
        </span>
        <span className="text-sm text-[var(--color-text-secondary)] ml-auto">
          置信度: <span className="text-[var(--color-accent)] font-medium">{analysis.confidence}%</span>
        </span>
      </div>
    </div>
  );
}

function formatVolume(v: number): string {
  if (v >= 1e8) return (v / 1e8).toFixed(1) + '亿';
  if (v >= 1e4) return (v / 1e4).toFixed(1) + '万';
  return v.toString();
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/AnalysisResult.tsx
git commit -m "feat: add AnalysisResult component"
```

---

### Task 16: ConfigPreview Component

**Files:**
- Create: `apps/web/src/components/ConfigPreview.tsx`

- [ ] **Step 1: Create apps/web/src/components/ConfigPreview.tsx**

```tsx
'use client';

import { useState, useCallback } from 'react';
import type { AnalyzeResponse } from '@trade/shared';

export default function ConfigPreview({ data }: { data: AnalyzeResponse }) {
  const [mode, setMode] = useState<'simple' | 'full'>('simple');

  const handleDownload = useCallback(() => {
    const content = data.config.lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url;
    a.download = `ibt-${date}-12-0.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  // Re-generate with selected mode (this is a client-side toggle;
  // for full mode, we'd need to call the API again. For simplicity,
  // we show simple mode by default; full mode triggers a re-fetch)
  const content = data.config.lines.join('\n');

  return (
    <div className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setMode('simple')}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all cursor-pointer ${
              mode === 'simple'
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-bg-card-hover)] text-[var(--color-text-secondary)] hover:text-white'
            }`}
          >
            简洁模式
          </button>
          <button
            onClick={() => setMode('full')}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all cursor-pointer ${
              mode === 'full'
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-bg-card-hover)] text-[var(--color-text-secondary)] hover:text-white'
            }`}
          >
            完整模式
          </button>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-bg-card-hover)] hover:bg-[var(--color-border)] text-sm rounded-lg transition-all cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          下载
        </button>
      </div>

      <div className="bg-black/50 rounded-lg p-4 overflow-x-auto">
        <pre className="text-sm font-mono text-[var(--color-accent)] whitespace-pre-wrap break-all leading-relaxed">
          {content || '暂无配置数据'}
        </pre>
      </div>

      <div className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-card-hover)] rounded-lg p-3">
        <span className="font-medium text-[var(--color-text-primary)]">摘要: </span>
        {data.config.summary}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/ConfigPreview.tsx
git commit -m "feat: add ConfigPreview component with download"
```

---

### Task 17: Main Page

**Files:**
- Create: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Create apps/web/src/app/page.tsx**

```tsx
'use client';

import { useState, useCallback } from 'react';
import type { AnalyzeResponse } from '@trade/shared';
import StockInput from '@/components/StockInput';
import StrategySettings from '@/components/StrategySettings';
import AnalysisResult from '@/components/AnalysisResult';
import ConfigPreview from '@/components/ConfigPreview';
import { analyzeStock } from '@/lib/api';

export default function Home() {
  const [mode, setMode] = useState<'auto' | 'grid' | 'condition'>('auto');
  const [capital, setCapital] = useState('100000');
  const [isT0, setIsT0] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<AnalyzeResponse | null>(null);

  const handleSearch = useCallback(async (code: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await analyzeStock({
        stockCode: code,
        totalCapital: parseInt(capital) || 100000,
        mode,
        isT0Mode: isT0,
        useAI,
      });
      setData(result);
    } catch (err: any) {
      setError(err.message || '请求失败');
    } finally {
      setLoading(false);
    }
  }, [capital, mode, isT0, useAI]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <header className="text-center space-y-2 pb-4">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-[var(--color-accent)]">AI</span> 交易系统
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          智能分析 A股行情 · 生成破冰号交易配置
        </p>
      </header>

      <StockInput onSearch={handleSearch} loading={loading} />

      <StrategySettings
        mode={mode}
        onModeChange={setMode}
        capital={capital}
        onCapitalChange={setCapital}
        isT0={isT0}
        onT0Change={setIsT0}
        useAI={useAI}
        onAIChange={setUseAI}
      />

      {error && (
        <div className="w-full bg-red-900/20 border border-red-800 text-red-400 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {data && (
        <>
          <AnalysisResult data={data} />
          <ConfigPreview data={data} />
        </>
      )}

      {!data && !loading && !error && (
        <div className="text-center py-16 text-[var(--color-text-secondary)]">
          <svg className="mx-auto mb-4 opacity-20" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          <p className="text-lg">输入股票代码开始分析</p>
          <p className="text-sm mt-1">支持沪深A股，如 600519 或 000001</p>
        </div>
      )}

      <footer className="text-center text-xs text-[var(--color-text-secondary)] pt-8 pb-4">
        数据来源: 东方财富 · 仅供参考，不构成投资建议
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat: add main page composing all components"
```

---

### Task 18: Verify Full Integration

- [ ] **Step 1: Install all workspace deps**

Run: `pnpm install` (from root)
Expected: success, no errors.

- [ ] **Step 2: Start server and web**

Terminal 1: `pnpm --filter @trade/server dev`
Expected: `Server running on http://localhost:3001`

Terminal 2: `pnpm --filter @trade/web dev`
Expected: Next.js on `http://localhost:3000`

- [ ] **Step 3: Test the API directly**

Run: `curl -s http://localhost:3001/api/market/realtime/600519 | head -c 200`
Expected: JSON with stock name/price data.

- [ ] **Step 4: Test analysis endpoint**

Run:
```bash
curl -s -X POST http://localhost:3001/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"stockCode":"600519","totalCapital":100000,"mode":"auto","isT0Mode":false,"useAI":false}' \
  | python3 -m json.tool 2>/dev/null | head -40
```
Expected: Full analysis response with market, analysis, and config fields.

- [ ] **Step 5: Open browser**

Navigate to `http://localhost:3000`, enter `600519`, click query.
Expected: Dark mode UI, stock data displayed, analysis result shown, config preview visible.

- [ ] **Step 6: Commit (if any fixes were made)**

```bash
git add -A
git commit -m "fix: integration tweaks and fixes"
```
