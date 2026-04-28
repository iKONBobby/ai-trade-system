# AI Trade System - Design Spec

## Overview

AI 交易查看系统：输入 A 股股票代码，自动分析行情，生成破冰号交易终端的最优配置文件。前后端分离，Next.js + Express，Dark Mode UI。

## Architecture

```
ai-trade-system/
├── apps/
│   ├── web/          # Next.js 前端 (App Router)
│   └── server/       # Express 后端
├── packages/
│   └── shared/       # 共享类型定义
└── package.json      # pnpm workspace
```

### Tech Stack

- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS (Dark Mode)
- **Backend**: Express + TypeScript
- **Monorepo**: pnpm workspace
- **Data Source**: 东方财富 (EastMoney) free API
- **AI (Optional)**: Claude/OpenAI API for config optimization

## Core Flow

```
User Input (stock code, position, mode)
  → Backend fetches market data from EastMoney API
  → Rule engine analyzes (Bollinger, ATR, MA, support/resistance)
  → (Optional) AI optimizer refines parameters
  → Config generator produces 破冰号 format file
  → Frontend displays analysis + config preview + download
```

## Backend Modules

### 1. Market Service (`/api/market`)
- `GET /api/market/realtime/:code` - 实时行情（价格、涨跌幅、成交量、换手率）
- `GET /api/market/kline/:code` - 历史日K线（默认60日）

### 2. Analysis Engine (`/api/analyze`)
- `POST /api/analyze` - 综合分析入口
- 规则引擎逻辑：
  - 计算布林带(20日)、ATR(14日)、MA(5/20/60)、支撑阻力位
  - 判断市场状态：震荡(Bollinger narrow + flat MA) → 网格交易
  - 判断市场状态：趋势(Bollinger breakout + directional MA) → 条件单
  - 网格参数：基准价=当前价, 步长=ATR*1.5, 循环次数基于资金
  - 条件单参数：买入触发=支撑位, 卖出触发=压力位

### 3. AI Optimizer (`/api/analyze/ai`) - Optional
- 输入：规则引擎结果 + 行情数据
- 输出：优化后的参数建议
- 通过环境变量配置 API Key，不配置则跳过

### 4. Config Generator
- 输出破冰号格式文件
- 简洁模式：策略ID、买卖方向、股票代码、触发价格、网格步长、手数、资金限制
- 完整模式：PDF 全部 23 字段
- 做T模式：先买半仓做底仓，剩半仓做T

### 5. Position Manager
- 用户设置总仓位金额
- 做T模式：自动拆分为底仓(50%) + T仓(50%)
- 计算每股手数 = 分配金额 / 当前股价 / 100 * 100（取整手）

## Frontend Pages

### 主面板 (`/`)
```
┌─────────────────────────────────────┐
│  AI交易系统                    🌙   │
│                                     │
│  ┌─ 股票代码 ────────────────────┐  │
│  │  [600519]  [查询]             │  │
│  └────────────────────────────────┘  │
│                                     │
│  ┌─ 策略设置 ────────────────────┐  │
│  │  ○ 自动  ○ 网格  ○ 条件单     │  │
│  │  总仓位: [100000] 元          │  │
│  │  [✓] 做T模式 (半仓底仓)       │  │
│  │  [✓] AI优化 (可选)            │  │
│  └────────────────────────────────┘  │
│                                     │
│  ┌─ 分析结果 ────────────────────┐  │
│  │  当前价: 1850.50  +2.3%       │  │
│  │  布林带上轨: 1900  下轨: 1780 │  │
│  │  ATR: 25.6  趋势: 震荡        │  │
│  │  建议策略: 网格交易 (85%置信)  │  │
│  └────────────────────────────────┘  │
│                                     │
│  ┌─ 配置预览 ────────────────────┐  │
│  │  [简洁] [完整]  [下载]        │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │ 12,0,0,300,...          │  │  │
│  │  └──────────────────────────┘  │  │
│  └────────────────────────────────┘  │
└─────────────────────────────────────┘
```

### API Routes (Next.js API proxy)
- `/api/proxy/*` → 转发到 Express 后端

## Data Models

```typescript
// 行情数据
interface MarketData {
  code: string;
  name: string;
  price: number;
  change: number;       // 涨跌幅%
  volume: number;
  turnover: number;     // 换手率%
  open: number;
  high: number;
  low: number;
  preClose: number;
}

// K线
interface KLine {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 分析结果
interface AnalysisResult {
  marketState: 'ranging' | 'trending_up' | 'trending_down';
  bollinger: { upper: number; middle: number; lower: number };
  atr: number;
  ma: { ma5: number; ma20: number; ma60: number };
  support: number;
  resistance: number;
  recommendation: 'grid' | 'condition';
  confidence: number;   // 0-100
}

// 配置生成参数
interface ConfigParams {
  strategyId: number;
  stockCode: string;
  totalCapital: number;
  mode: 'grid' | 'condition';
  isT0Mode: boolean;
  aiOptimized: boolean;
}

// 破冰号配置
interface IcebreakerConfig {
  lines: string[];       // 每行一个命令
  summary: string;       // 人类可读的摘要
}
```

## 破冰号配置输出格式

### 简洁模式字段（核心8字段）
`Policy_ID, BuyOrSell, EntryOrExit, Lot, CommandType, PriceType, InstrumentID, Price`

### 完整模式字段（全部23字段）
按 PDF 文档格式输出。

## UI Design

- **风格**: Dark Mode 默认，Modern Glass-morphism
- **配色**: 深灰背景(#0f0f0f)，卡片(#1a1a1a)，强调色绿色(#10b981)，红色(#ef4444)
- **字体**: Inter (系统默认)
- **组件**: 圆角卡片、数字滚动、策略标签、代码块样式的配置预览

## Error Handling

- 股票代码无效 → 前端提示"未找到该股票"
- API 超时 → 5秒超时，显示"数据获取失败，请重试"
- AI 服务不可用 → 降级使用纯规则引擎结果
