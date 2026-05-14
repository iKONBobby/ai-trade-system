# TODOS

> AI-Trade-System 长期跟踪清单。当前 plan 之外、未来值得做的工作。
> Active plan：`~/.gstack/projects/ai-trade-system/ceo-plans/2026-05-14-ai-analysis-swarm-engine.md`

## v1.1 — Swarm 引擎下一波（在 MVP 上线 + outcome validation 通过后再做）

来自 cathedral vision，由 `/plan-ceo-review` SELECTIVE EXPANSION 模式 deferred。

### T1. 扩展 agent 团到 8 人（macro / sentiment / volume / news_event）

- **What**: 在 investment_committee preset 上增加 4 个 agent，提供宏观、舆情、量价、事件 4 个独立分析视角
- **Why**: 当前 4 个 agent（bull/bear/risk/PM）+ synthesizer 主要覆盖技术面 + 基本面；缺消息面、宏观面、量能、事件驱动
- **Pros**: 决策维度更全；触发"AI 看到我没看到的角度"机会变大
- **Cons**: +4 次 LLM 调用，单次成本翻倍；辩论时间 ~3 分钟
- **Context**: 前置条件—MVP 验证通过（≥6/10 swarm > single）后再扩
- **Effort**: M (human ~3 天 / CC ~5h)
- **Priority**: P2
- **Depends on**: MVP outcome validation 通过

### T2. screener 整池组合辩论

- **What**: 从 C5（screener 批量 5 只各跑一次）升级为"整池一次性辩论"—— PM 给出整体组合配置建议（持仓比例、轮动顺序）
- **Why**: 现状是逐只买卖建议，缺组合视角（相关性、行业暴露、仓位平衡）
- **Pros**: 给出"今天该买这 3 只各 X%"的可执行组合
- **Cons**: prompt 设计复杂（要喂 N 只股票的指标 + 让 PM 做 cross-comparison）；成本 +1 次大 prompt 调用
- **Context**: 依赖 T1 完成（需要更多视角支持组合判断）
- **Effort**: L (human ~1 周)
- **Priority**: P3
- **Depends on**: T1, C5 完成并稳定

### T3. 辩论历史持久化 + 后验跟踪自动化

- **What**: 把每次辩论的 verdict 存到 `apps/server/src/services/history/`（已存在），后台 cron 每天回填 5 交易日后的实际走势，自动算 verdict 方向胜率
- **Why**: 当前 C3 validation 是 markdown 手动方式；持久化后能做长期 dashboard，跟踪"哪种 thesis 模式胜率高"
- **Pros**: 自动化后验，给改进 prompt 提供数据；长期复盘
- **Cons**: 引入 cron / scheduled job；history 表结构要扩
- **Context**: MVP 阶段不持久化是有意为之（design doc Lines 273-275），让流程先跑通
- **Effort**: M (human ~3-4 天)
- **Priority**: P2
- **Depends on**: MVP 上线 + 至少跑 50 次辩论积累样本

### T4. A 股本地化 skill 完整版

- **What**: 新增/完善 skill 模板：北向资金流（hk-connect-flow）、龙虎榜、ST/*ST 过滤、涨跌停板规则、A 股特有事件（解禁、分红送转）
- **Why**: 当前 grounding 走通用 MA/MACD/RSI，没用 A 股独有信号；Vibe-Trading 部分 skill 偏美股/加密
- **Pros**: A 股决策质量与"通用模板"显著拉开差距
- **Cons**: 数据源需要扩展（market.ts 目前只走东方财富实时 + K 线，没接北向/龙虎榜）；skill prompt 编写需要 A 股专业知识
- **Context**: 与 C7（skill 内联 YAML）的张力—— A 股 skill 多个 preset 复用价值高，可能需要反向把 skill 重新外抽
- **Effort**: M-L (human ~1 周)
- **Priority**: P2
- **Depends on**: 数据源扩展（market.ts 加北向/龙虎榜）

### T6. E2E framework (Playwright)

- **What**: 加 Playwright + ~5 个 E2E 场景：swarm 主流程 (trade → 5 agent → verdict → 采纳) / cancel mid-debate / batch (C5) / toggle single↔swarm / TTL abort (C1)
- **Why**: MVP 上线后 screener / trade / swarm 多模块交互，手动验证会越来越慢；新增 preset 也需要 regression 防护
- **Pros**: 所有后续 UI PR 受益；regression 防护；新 preset 上线快速验收
- **Cons**: +1 天设置 + Playwright runtime ~150MB；MVP 期间 UI 还可能变，过早 lock E2E 反成负担
- **Context**: plan-eng-review F2 (2026-05-14) 决策 defer。MVP 阶段手动验证 critical paths (见 `bobby-main-eng-review-test-plan-*.md`)
- **Effort**: M (human ~1 day / CC ~3h)
- **Priority**: P2
- **Depends on**: MVP 上线 + UI 趋于稳定（建议第 2 个 preset 落地前后再上）

### T5. Preset 选择器从隐藏改为暴露

- **What**: C6 在 MVP 实现但 hidden（presets.length===1 时不显示）。第 2 个 preset 落地后 unhide
- **Why**: MVP UX 避坑：空 dropdown 是反 UX
- **Pros**: feature flag 切换简单
- **Cons**: 无
- **Context**: 自动触发条件（presets.length >= 2）
- **Effort**: XS (~10min unhide)
- **Priority**: P3
- **Depends on**: 任意第 2 个 preset 实现（建议 risk_committee）
