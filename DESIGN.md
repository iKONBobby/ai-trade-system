# AI 交易系统 · 设计系统

> Established: 2026-05-12 (from `/screener` page redesign)
> Source: `~/.gstack/projects/ai-trade-system/designs/screener-20260511/finalized.html`

本文档是项目 UI 一致性的单一来源。新页面/组件先读这里，再决定要不要破例。

## 一、调性

- **Dark-first**：base #0a0b0d，三层 surface（1/2/3）逐级提亮
- **A 股惯例**：**红涨 (`--up: #ef4444`) / 绿跌 (`--down: #22c55e`)** — 严禁反转
- **Accent emerald** (`#10b981`)：所有"操作"调用色（按钮、链接、active 状态）
- **数据感至上**：数字一律 `tabular-nums`，标题用中文优化字体，数字用 Inter

## 二、CSS 自定义属性

### 颜色

```css
/* Surfaces */
--surface-base:  #0a0b0d;
--surface-1:     #14161a;    /* card / sidebar */
--surface-2:     #1c1f24;    /* hover / nested */
--surface-3:     #262a31;    /* nested-deeper */
--surface-hover: #20232a;

/* Text */
--text-1:        #f4f5f7;    /* primary */
--text-2:        #9ca3af;    /* secondary */
--text-3:        #6b7280;    /* tertiary / labels */
--text-disabled: #4b5563;

/* Borders */
--border-1:      #262a31;
--border-2:      #353a44;

/* A-share semantic */
--up:            #ef4444;
--up-bg:         rgba(239, 68, 68, 0.08);
--up-dim:        #7f1d1d;
--down:          #22c55e;
--down-bg:       rgba(34, 197, 94, 0.08);
--down-dim:      #14532d;
--flat:          #94a3b8;

/* Accent (actions) */
--accent:        #10b981;
--accent-strong: #059669;
--accent-bg:     rgba(16, 185, 129, 0.1);
--accent-border: rgba(16, 185, 129, 0.25);

/* Semantic states */
--info:          #3b82f6;
--info-bg:       rgba(59, 130, 246, 0.1);
--warning:       #f59e0b;
--warning-bg:    rgba(245, 158, 11, 0.1);
--danger:        #ef4444;
--danger-bg:     rgba(239, 68, 68, 0.1);
--success:       #10b981;
```

### 间距

```css
--sp-1: 4px;  --sp-2: 8px;   --sp-3: 12px;
--sp-4: 16px; --sp-5: 20px;  --sp-6: 24px;
--sp-8: 32px; --sp-10: 40px; --sp-12: 48px; --sp-16: 64px;
```

**规则**：禁止用 `px`/`rem` 魔数，所有 padding/margin/gap 走 token。

### 圆角

```css
--r-sm:   4px;     /* badges, tiny pills */
--r-md:   6px;     /* buttons, inputs */
--r-lg:   10px;    /* cards, panels */
--r-xl:   14px;    /* big modals, hero */
--r-pill: 9999px;  /* tags, dots */
```

### 阴影 / 层次

```css
--elev-1: 0 1px 2px rgba(0,0,0,0.4);             /* subtle */
--elev-2: 0 4px 12px rgba(0,0,0,0.3),
          0 1px 3px rgba(0,0,0,0.4);             /* card hover */
--elev-3: 0 12px 32px rgba(0,0,0,0.5),
          0 4px 8px rgba(0,0,0,0.3);             /* modal */
```

### 字体

```css
--font-sans: 'Noto Sans SC', -apple-system, BlinkMacSystemFont,
             'Segoe UI', Roboto, sans-serif;
--font-num:  'Inter', 'Noto Sans SC', sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;
```

CDN（`apps/web/src/app/layout.tsx` 加 `<link>`）：
```
https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap
```

### Type ramp

```css
--text-h1:    28px;    /* page hero */
--text-h2:    20px;    /* section */
--text-h3:    15px;    /* card / sub-section */
--text-body:  13px;    /* default */
--text-sm:    12px;    /* metadata, secondary */
--text-xs:    11px;    /* labels */
--text-tiny:  10px;    /* badges, micro */
```

### 数字规范

任何展示价格、涨跌幅、换手率、分数、计数的元素必须：

```css
font-family: var(--font-num);
font-variant-numeric: tabular-nums;
font-feature-settings: 'tnum', 'cv11';
```

简写 utility class：`.num { ... 同上 }`，整页 import 一次。

### 动效

```css
--ease:     cubic-bezier(0.16, 1, 0.3, 1);
--motion-1: 120ms;    /* hover, focus */
--motion-2: 200ms;    /* card lift, modal open */
--motion-3: 320ms;    /* progress, big transitions */
```

`prefers-reduced-motion: reduce` 应禁用 transform/transition（响应式 polish）。

## 三、组件规范

### Button

- 高度 36px；icon-only 36×36
- `.btn` 默认中性、`.btn-primary` 用 accent、`.btn-ghost` 透明边、`.btn-danger` 用 danger 色
- Icon 14×14 SVG，颜色继承
- `:focus-visible` 强制 2px accent 描边 + 2px offset

### Input / Select / Switch

- 高度 32px
- 圆角 `--r-md`
- 背景 `--surface-2`，边 `--border-1`
- Switch 32×18 滑钮，开启色 = accent

### Card (data card)

- 背景 `--surface-1`，圆角 `--r-lg`
- 左边 3px 颜色条标语义（涨/跌/默认/警示），hover 时显隐
- Hover：上抬 2px + `--elev-2`，背景升到 `--surface-2`
- 内 padding `--sp-4`

### Tag / Chip

- 高度 ~20px
- 圆角 `--r-pill`（tag）或 `--r-md`（chip）
- 字号 `--text-xs` 或 `--text-tiny`
- 内 padding 4px ×8px
- 默认 `--surface-2` + `--text-2`；active = accent 底 + 黑字

### Modal / Dialog

- Backdrop：`rgba(0,0,0,0.5)`（**统一不再分 40/50**）
- 圆角 `--r-xl`（14px）
- 边 `--border-1`
- 阴影 `--elev-3`
- 内 padding `--sp-5`（header/body/footer 各一份）
- ESC 关闭 + 点 backdrop 关闭

### Sidebar (主导航)

- 宽 220px，sticky 全高
- Logo 区 64px，下 1px border
- 链接 `.active` 用 accent-bg + 左侧 3px accent 条
- 底部状态栏：在线 dot + 版本号

### Progress bar

- Track 高 6px，圆角 `--r-pill`
- Fill：accent → accent-strong 线性渐变 + `box-shadow: 0 0 12px var(--accent)`
- Header 行：`pulse` 圆点 + label 左、百分比右（accent 色，`text-h3` size）
- Meta 行：扫描数 / 预计耗时

### Score ring (匹配分数)

- 36×36 conic-gradient 实现的环形进度
- `--p` CSS 变量控制百分比
- 高分 ≥80：`--up` 色；中 60-80：`--warning`；低 <60：`--accent` 色

## 四、布局规范

### Page shell

```
[sidebar 220px sticky] [main flex-1 max-width:1280px padding:sp-6 sp-8]
```

### Page 内 vertical rhythm

```
hero            — title + actions split row, mb sp-6
section gap     — mb sp-5
inner padding   — sp-4
component gap   — sp-3
inline gap      — sp-2
```

### Split view (例：screener)

```
[left rail 260px sticky] [results pane flex-1]   gap: sp-5
```

`<1024px`：栈式，左 rail 折回顶部、`max-height: 280px` 控制不过长。

## 五、AI slop 黑名单（永久排斥）

- 紫蓝渐变作为默认 accent
- 通用"3 列特性 + 居中文案"hero
- 装饰球 / 波浪 / 几何图（非数据图）
- 表情符号当装饰图标用
- Stock photo 占位
- 圆角卡片 + drop shadow 当万能容器
- "Get Started"/"Learn More" 这种泛 CTA

## 六、Accessibility

- 所有按钮 `:focus-visible` 必须可见
- Touch target ≥ 36×36（mobile 优先）
- 颜色对比 4.5:1 起步（text-2 over surface-1 = 7.2:1，已合规）
- 语义 HTML：`<main>`/`<aside>`/`<nav>`/`<section>`/`<header>`/`<article>`
- `aria-label` for icon-only buttons

## 七、新增模式（trade 页 v2，2026-05-12）

### 双行 input bar (`.input-bar`)

主行 = 用户的核心动作（如「搜索 + 提交」），副行 = 参数微调。

```
[search 44px h, flex-1] [primary btn 44px h]    ← input-row-primary
─────────────────────────────────────────────  ← 1px border-1
[label] [chip] [chip] [switch] [switch] ...    ← input-row-secondary
```

- 主行 input 高 44px、字号 `--text-h2`，焦点态背景升到 surface-1（突出感）
- 副行高 30px，所有元素 pill 圆角，密度紧凑

### Param chip (`.param-chip`)

参数容器，副行专用。`label + 输入 + unit`：

- 高 30px，`--r-pill`，背景 `--surface-2` + 边 `--border-1`
- `:focus-within` 边变 accent
- 内含 `.param-chip-input`（数字，宽 64px、`--font-num`）或 `.param-chip-select`（自绘 chevron，无浏览器原生样式）

### Icon button (`.icon-btn`)

36×36 通用 icon-only 按钮：

- 圆角 `--r-md`，背景 `--surface-1`
- `.active` 状态 = accent 色 + accent-bg
- 必须 `aria-label`
- 跟 §三 通用 `.btn` 区别在尺寸更紧凑、纯图标

### Hero 大盘指数 (`.market-indices`)

页面 hero 右侧常驻：上证 / 深证 / 创业板。

- 右对齐，每项 `min-width: 84px`
- 数值 `--text-body` + tabular-nums，涨跌 pct 用 `--up` / `--down`
- 配 `.hero-meta`（绿点 pulse + 数据时间，`--font-mono`），表达"实时数据流"感
- 900px 以下隐藏第 3 个指数 + 数据时间，避免挤压

### 指标主次分级

主指标（多值/结构）+ 次指标（单值）应可视化分级，而非统一 4 列网格：

```css
.ind-grid-primary    { grid-template-columns: repeat(2, 1fr); }  /* 大卡 2×2 */
.ind-grid-secondary  { grid-template-columns: repeat(4, 1fr); }  /* 小卡 1×4 */
```

- `.ind-card.primary`：padding `--sp-4 --sp-5`，value 字号 26px，下挂 `.ind-detail-grid` (3 列子值) 或 `.ind-range` (范围条)
- `.ind-card.compact`：padding 紧、value `--text-h3`、sub 10px
- 1100px 以下：primary 折成 1 列、secondary 折成 2 列

### Range bar (`.ind-range`)

价格在通道内位置可视化：

- 6px track，背景 `--surface-3`
- fill 用 `down-dim → accent → up-dim` 横向渐变（40% 不透明）
- marker：12px 圆点，外发光 accent（用 box-shadow 模拟 ring）
- 下方三 label 用 `space-between` 标边界

### K 线图配色

```
candle-up   = var(--up)      (红涨)
candle-down = var(--down)    (绿跌)
MA5         = #fbbf24        (琥珀)
MA20        = #a78bfa        (淡紫)
MA60        = #38bdf8        (天蓝)
vol-up/down = up/down @ 0.7 opacity
```

K 线主图 + 成交量副图比 = 260 : 90。X 轴 5 个时间 tick，Y 轴价格在右侧。

时间范围用 `.chart-range` segmented control（分时 / 5日 / 日K / 周K / 月K），active 态 = accent 底 + 黑字。

## 八、Swarm (AI 辩论) v1, 2026-05-14

新功能 "AI 投资委员会" 的视觉规范. 详细决策见 plan-design-review D2-D5
+ design doc `bobby-main-design-20260514-*.md`.

### 8.1 Agent 时间线 (`SwarmAgentTimeline`)

- 5 agent 垂直时间线 (移动端友好), 顺序 bull → bear → risk → pm → synthesizer
- 每个 block: 左 3px 角色色条 + 28px 单字徽章 + 角色名 + 状态点
- **不用 emoji** (违反 §五 AI slop 黑名单), 用单字徽章

### 8.2 角色色彩 (block 左条 + 徽章)

| Agent | 单字徽章 | 色彩 token | 含义 |
|---|---|---|---|
| bull_advocate | 多 | `--up` | 看涨 (A 股红) |
| bear_advocate | 空 | `--down` | 看跌 (A 股绿) |
| risk_officer | 险 | `--warning` | 风控警示 |
| portfolio_manager | 决 | `--accent` | 决策 |
| synthesizer | 总 | `--text-2` | 中立总结 |

### 8.3 Agent 状态点

| state | 色彩 | 动画 |
|---|---|---|
| pending | `--text-disabled` | 无 |
| streaming | `--accent` | pulse 1.2s |
| done | `--accent` | 无 |
| failed | `--danger` | 无 |
| aborted | `--text-3` | 无 |

`prefers-reduced-motion: reduce` 全部禁用 pulse.

### 8.4 Verdict 卡 (`SwarmVerdictCard`) — A 股本地化色

| verdict | 大字色 | 含义 |
|---|---|---|
| `buy` | `--up` (红) | 看涨买入 (A 股惯例, **严禁用 accent 绿**) |
| `sell` | `--down` (绿) | 看跌卖出 |
| `hold` | `--text-2` (灰) | 中性观望 |
| `avoid` | `--warning` (橙) | 警示规避 |

**关键区分**: `--accent` (emerald) **仅**用于"操作调用色"(按钮 / 链接 / active),
verdict 表达"情绪/方向"走 A 股 semantic 色, 不冲突.

### 8.5 Score ring (verdict 卡仓位可视化)

- 48×48 px SVG conic-style 进度环 (复用 §三 36×36 score ring 设计, 略放大)
- 进度色与 verdict 同色 (buy=红 / sell=绿 / hold=灰 / avoid=橙)
- 中心数字 `--font-num` + tabular-nums
- 下方 label "建议仓位"

### 8.6 Feedback 三按钮 (verdict 卡底部)

走 §三 `.btn` 系统:
- "采纳" → primary (accent 实底)
- "不采纳" → ghost
- "修改仓位" → ghost (点击弹 prompt 输入新 pct)
- 提交后整组 `disabled`, 选中态 `aria-pressed="true"`

### 8.7 5 状态 spec

| state | 触发 | UI 表现 |
|---|---|---|
| pending → running | `swarm_started` | progress + agent 流式 + Cancel button |
| done | `swarm_completed` | timeline + verdict 卡 + feedback |
| partial | `swarm_completed` 但有 agent failed | timeline + verdict + warning banner "1 位失败" |
| error | `swarm_error` | timeline + danger banner + "重新召开" |
| aborted | `swarm_aborted` (cancel / TTL) | timeline + muted banner + "重新召开" |

### 8.8 入口

- trade 页面顶部 toggle: "单次 · 快速" / "辩论 · 深度" (pill segment)
- screener 单股 dialog footer: "🏛 AI 委员会" 按钮 (跳 `/trade?code=X&ai=swarm&auto=1`)
- C8 recovery: trade page mount 时若 localStorage 有 < 5min 的 runId 且 server 仍有 → 显示 "上次辩论 X (Y 分钟前)" banner + 恢复按钮

### 8.9 A11y

- timeline: `<ol role="list">` + `<li role="listitem">`
- streaming text: `aria-live="polite"` + `aria-atomic="false"`
- verdict 卡: `<article role="status" aria-live="polite">`
- feedback 按钮: 选中后 `aria-pressed="true"`
- Touch targets ≥ 36×36 (DESIGN.md §六)

## 九、Reference

- screener v2 mockup：`~/.gstack/projects/ai-trade-system/designs/screener-20260511/finalized.html`
- trade v2 mockup：`~/.gstack/projects/ai-trade-system/designs/trade-20260512/finalized.html`
- 后续页面套这套 token，**别再重新发明颜色 / 间距 / 组件结构**。
