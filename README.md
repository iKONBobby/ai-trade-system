# AI 交易系统

基于 Next.js + Express 的 A 股智能交易分析系统。输入股票代码，自动分析行情数据，生成破冰号交易终端的最优配置文件。

## 功能

- **实时行情**: 接入东方财富 API，获取 A 股实时价格、涨跌幅、成交量、换手率
- **智能分析**: 规则引擎计算布林带、ATR、均线、支撑阻力位，自动判断市场状态
- **策略推荐**: 震荡市推荐网格交易，趋势市推荐条件单，带置信度评分
- **做T模式**: 支持半仓底仓 + 半仓做T的仓位管理
- **AI 优化** (可选): 接入 Claude API 对规则引擎结果进行二次优化
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
│   │   └── src/
│   │       ├── index.ts             # 入口
│   │       ├── routes/api.ts        # API 路由
│   │       ├── services/
│   │       │   ├── market.ts        # 东方财富行情
│   │       │   ├── analyzer.ts      # 规则引擎
│   │       │   ├── config-generator.ts  # 破冰号配置生成
│   │       │   └── ai-optimizer.ts  # AI 优化 (可选)
│   │       └── utils/indicators.ts  # 技术指标
│   └── web/                 # Next.js 前端 (端口 4000)
│       └── src/
│           ├── app/                 # 页面 + 布局
│           ├── components/          # UI 组件
│           └── lib/api.ts           # API 客户端
└── packages/shared/         # 共享 TypeScript 类型
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

### AI 优化 (可选)

如需启用 AI 优化，设置环境变量：

```bash
export ANTHROPIC_API_KEY=your-api-key
```

不设置则自动跳过，仅使用规则引擎。

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

## 免责声明

本系统仅供学习研究使用，不构成任何投资建议。股市有风险，投资需谨慎。
