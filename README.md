# AI 交易系统

基于 Next.js + Express 的 A 股智能交易分析系统。输入股票代码，自动分析行情数据，生成破冰号交易终端的最优配置文件。

## 功能

- **实时行情**: 接入东方财富 API，获取 A 股实时价格、涨跌幅、成交量、换手率
- **智能分析**: 规则引擎计算布林带、ATR、均线、支撑阻力位，自动判断市场状态
- **策略推荐**: 震荡市推荐网格交易，趋势市推荐条件单，带置信度评分
- **做T模式**: 支持半仓底仓 + 半仓做T的仓位管理
- **AI 分析** (可选): 两种模式
  - **单次模式**: 单次 Claude API 调用，快速给出综合点评 + 信号 + 调参建议
  - **辩论模式** (swarm, v1): 5 角色 AI 投资委员会流式辩论 (看多 / 看空 / 风控 / PM / 总结)，
    A 股本地化色 + verdict 卡 + 用户反馈记录。详见 [docs/designs/](docs/designs/)
- **智能选股** (screener): 全市场扫描 + 因子引擎 + 历史回看 + 收藏
- **配置生成**: 输出破冰号交易终端格式的配置文件，支持简洁/完整两种模式，一键下载 .txt

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | Next.js 15 + TypeScript + Tailwind CSS 4 |
| 后端 | Express + TypeScript |
| 共享 | pnpm workspace + 共享类型包 |
| 数据 | 东方财富免费 API |
| AI | Claude API (可选) |

## 项目结构

```
ai-trade-system/
├── apps/
│   ├── server/              # Express 后端 (端口 4001)
│   │   ├── data/                    # 运行时数据 (gitignored, favorites/history/feedback)
│   │   ├── scripts/
│   │   │   ├── test-swarm.ts        # swarm 端到端 smoke
│   │   │   └── backfill-validation.ts  # outcome validation 5d 走势回填
│   │   └── src/
│   │       ├── index.ts             # 入口
│   │       ├── routes/
│   │       │   ├── api.ts                # 综合分析 + AI single
│   │       │   ├── screener.ts           # 智能选股
│   │       │   ├── favorites.ts          # 收藏
│   │       │   ├── history.ts            # 扫描历史
│   │       │   ├── backup.ts             # 备份导入导出
│   │       │   └── swarm.ts              # AI 辩论 (5 endpoint + SSE)
│   │       ├── services/
│   │       │   ├── market.ts             # 东方财富行情
│   │       │   ├── analyzer.ts           # 规则引擎
│   │       │   ├── ai-analyzer.ts        # AI single 模式
│   │       │   ├── config-generator.ts   # 破冰号配置
│   │       │   ├── screener/             # 选股引擎 + 因子
│   │       │   ├── favorites/, history/, backup/, storage/  # 持久化
│   │       │   └── swarm/                # ★ AI 辩论引擎 (W1-W3)
│   │       │       ├── runtime.ts            # sequential 编排
│   │       │       ├── worker.ts             # Anthropic SDK 流式 + zod
│   │       │       ├── grounding.ts          # 行情/指标注入 prompt
│   │       │       ├── run-registry.ts       # 状态机 + 30s TTL abort
│   │       │       ├── event-bus.ts          # SSE pub-sub + replay buffer
│   │       │       ├── preset-loader.ts      # YAML preset zod 校验
│   │       │       ├── presets/              # YAML preset (5 agent)
│   │       │       ├── semaphore.ts          # batch 并发限流
│   │       │       ├── validation-writer.ts  # 季度 markdown 表
│   │       │       └── feedback-writer.ts    # jsonl atomic append
│   │       └── utils/indicators.ts       # 技术指标
│   └── web/                 # Next.js 前端 (端口 4000)
│       └── src/
│           ├── app/                 # 页面 + 布局 (trade/screener/...)
│           ├── components/
│           │   ├── trade/                # trade 页面组件
│           │   │   ├── AISummaryCard.tsx       # AI single 卡
│           │   │   ├── SwarmAgentTimeline.tsx  # ★ 5 agent 时间线
│           │   │   ├── SwarmVerdictCard.tsx    # ★ verdict 卡 (A 股本地化色)
│           │   │   └── SwarmDebateCard.tsx     # ★ swarm 组合卡 (5 状态)
│           │   ├── screener/             # screener 组件
│           │   └── StockDetailDialog.tsx # 含 "🏛 AI 委员会" 入口
│           ├── hooks/
│           │   ├── useKLineData.ts
│           │   └── useSwarmStream.ts     # ★ EventSource subscribe + reducer
│           └── lib/
│               ├── api.ts                # API 客户端 (含 swarm helpers)
│               └── swarm-recovery.ts     # ★ localStorage TTL 5min recovery
├── packages/shared/         # 共享 TypeScript 类型 (含 swarm-types.ts)
├── docs/designs/            # 设计文档 (screener / stock-detail / swarm)
├── DESIGN.md                # 设计系统 token (含 §八 swarm 规范)
└── TODOS.md                 # v1.1+ follow-up 清单
```

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 10

### 安装

```bash
git clone <repo-url> && cd ai-trade-system
pnpm install
```

### 启动

**后端** (端口 4001):

```bash
pnpm dev:server
```

**前端** (端口 4000):

```bash
pnpm dev:web
```

**同时启动:**

```bash
pnpm dev
```

打开浏览器访问 `http://localhost:4000`

### AI 分析 (可选)

如需启用 AI，配置 `apps/server/.env`:

```bash
LLM_API_KEY=sk-ant-...                              # 必填
LLM_API_BASE=https://api.anthropic.com/v1           # 可选 (OpenAI-compatible 协议)
LLM_MODEL=claude-sonnet-4-5-20250929                # 可选
```

不设置则自动跳过 AI，仅使用规则引擎 + 选股 + 备份等功能。

### 跑 swarm smoke 端到端 (首次使用必跑一次)

```bash
pnpm swarm:smoke                 # 默认: 固定 600519 fixture, 验证 LLM + 编排
pnpm swarm:smoke --live 600519   # 真实拉行情后跑
```

预期 ~75-125 秒，5 个 agent 依次流式输出 JSON，最后打印 PM verdict + synthesizer 总结。

### Outcome validation (上线后 3 周)

跑 ≥10 次辩论后，5 个交易日 (~1 周) 等市场出方向：

```bash
pnpm swarm:backfill          # dry-run, 显示会回填什么
pnpm swarm:backfill --write  # 实际写回 docs/validation/*.md 5d_direction 列
```

输出 swarm vs single 方向命中率。premise validation 阈值: swarm ≥ 6/10 且 swarm > single。

## API 接口

### 实时行情

```
GET /api/market/realtime/:code
```

示例: `GET /api/market/realtime/600519`

### 历史 K 线

```
GET /api/market/kline/:code?days=60
```

示例: `GET /api/market/kline/600519?days=60`

### 综合分析

```
POST /api/analyze
Content-Type: application/json

{
  "stockCode": "600519",
  "totalCapital": 100000,
  "mode": "auto",
  "isT0Mode": false,
  "useAI": false
}
```

### AI single 模式

```
POST /api/ai-analyze       body: { market, analysis, ... }
```

### AI 辩论 (swarm)

```
POST /api/swarm/runs                  body: { stockCode, presetId }
                                      → 201 { runId, streamUrl }
GET  /api/swarm/runs/:id              → 状态 (C8 recovery)
GET  /api/swarm/runs/:id/events       → SSE 流 (swarm_started → agent_* → swarm_completed)
POST /api/swarm/runs/:id/abort        → 204
POST /api/swarm/runs/:id/feedback     body: { decision: accept|reject|modify, modifiedPositionPct? }
POST /api/swarm/batch-runs            body: { stockCodes[], presetId } (并发上限 2)
```

详细 SSE 事件 schema 见 `packages/shared/src/swarm-types.ts` 与 `DESIGN.md §八`.

### Screener (智能选股)

```
GET  /api/screener/strategies
POST /api/screener/run            body: { strategyIds[], market?, includeGEM?, includeSTAR? }
GET  /api/screener/progress/:jobId
DELETE /api/screener/jobs/:jobId
```

## 免责声明

本系统仅供学习研究使用，不构成任何投资建议。股市有风险，投资需谨慎。
