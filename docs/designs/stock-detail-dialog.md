# 股票详情弹窗 + K 线组件

> 状态：ACTIVE（待实施）
> 评审：/plan-ceo-review SELECTIVE EXPANSION 模式
> 决策日期：2026-05-11
> 分支：main

## 一、问题陈述

智能选股扫出结果后，用户点击股票卡片当前 **跳转到 `/trade?code=X` 同窗口**（`apps/web/src/app/screener/page.tsx:317`、`:393`），失去选股结果的上下文。要快速过 30 只票时，30 次跳页 + 30 次返回让节奏破碎。

**目标：** 把"点击 → 跳走"改为"点击 → 原地浮出 K 线弹窗"，并把这个弹窗封装为可复用组件，未来在收藏池、历史快照、对比 diff 页面任意位置都能点出。

## 二、范围决策

### 已接受（本次实施）

| # | 范围项 | 来源 |
|---|--------|------|
| 1 | 弹窗外壳 + 日 K 蜡烛 + 成交量 bar + 十字光标 + ESC/点外关闭 | 基线 |
| 2 | 顶部价格摘要：现价 / 涨跌幅 / 换手 / 今日高低 | 基线（D3 推荐归入） |
| 3 | 数据源复用 EastMoney `fetchKLine`（D1 决议） | 基线 |
| 4 | 图表库：`lightweight-charts`（TradingView，D4 决议） | 基线 |
| 5 | A — 多周期切换（日/周/月/5/15/30/60 分） | cherry-pick |
| 6 | B — MA5 / MA10 / MA20 均线 overlay | cherry-pick |
| 7 | C — 底部 CTA：加入收藏 + 跳详情页 | cherry-pick |
| 8 | 封装为 `<StockDetailDialog>` 可复用组件 | 基线 |

### 明确不在范围

- **mootdx / 通达信 Python sidecar**：D1 决议复用 EastMoney。未来如果需要 L2、复权、财务数据等通达信独特能力再引入。
- **键盘快捷键 ← → 切换股票**：D3 跳过，进 TODO。
- **拖拽画趋势线 / 水平线工具**：lightweight-charts 不原生支持，需大量额外代码。
- **回放模式 / 时间线拖拽回看历史**：XL 工作量。
- **跨股票对比 overlay**：复杂的多 series 协调，进 TODO。

### TODO（未来）

| # | 项目 | 上下文 | 优先级 |
|---|------|--------|--------|
| T1 | 键盘快捷键：弹窗内 ← → 切换上下个股票，ESC 关闭 | 父组件传 `onPrev` / `onNext` 函数，弹窗里绑 keydown 监听 | P3 |
| T2 | 抽象 `KLineProvider` 接口 | 当前 EastMoney 直连，未来想切 mootdx / akshare / 其他源时有统一接口替换 | P3 |
| T3 | 趋势线 / 水平线画图 | klinecharts 原生支持但当前选了 lightweight-charts，画线需手动 overlay layer | P3 |

## 三、组件 API

`apps/web/src/components/StockDetailDialog.tsx`：

```tsx
import type { ScreenerResult, MarketData } from '@trade/shared';

export type KlinePeriod = 'daily' | 'weekly' | 'monthly' | '5min' | '15min' | '30min' | '60min';

export interface StockDetailDialogProps {
  /** 股票代码（6 位数字）。必填。 */
  code: string;

  /** 已知的股票元数据，避免组件内部重发 fetchRealtime。可选。 */
  initialMeta?: Pick<ScreenerResult | MarketData, 'name' | 'market'> & { price?: number; change?: number };

  /** 默认周期，默认 'daily'。 */
  defaultPeriod?: KlinePeriod;

  /** 关闭回调。 */
  onClose: () => void;

  /** 加入收藏成功回调（用于父组件刷新 favorites 列表）。可选。 */
  onAddedToFavorite?: (code: string) => void;

  /** 是否已收藏（控制底部按钮文案 "加入收藏" / "已收藏"）。 */
  isFavorited?: boolean;
}
```

调用示例：

```tsx
// screener/page.tsx
<StockDetailDialog
  code={selectedCode}
  initialMeta={{ name: stock.name, market: stock.market }}
  onClose={() => setSelectedCode(null)}
  isFavorited={favoriteCodes.has(selectedCode)}
  onAddedToFavorite={(code) => setFavorites(/* refresh */)}
/>
```

## 四、后端 API

**决策：** 扩展现有 `GET /api/market/kline/:code` —— 加可选 `period` 参数（默认 `daily`），保持向后兼容。

### 端点定义

```
GET /api/market/kline/:code?period=<period>&days=<n>
```

- `:code` — 6 位股票代码
- `period`（可选，默认 `daily`）— 必须在白名单：`daily | weekly | monthly | 5min | 15min | 30min | 60min`
- `days`（可选，默认 60，最大 1000）

返回：`KLine[]`（已有类型，`{ date, open, high, low, close, volume }`）

### EastMoney klt 映射

```ts
const PERIOD_TO_KLT: Record<KlinePeriod, number> = {
  '5min': 5,
  '15min': 15,
  '30min': 30,
  '60min': 60,
  daily: 101,
  weekly: 102,
  monthly: 103,
};
```

### 失败响应

| 场景 | HTTP | error code |
|------|------|-----------|
| 代码非 6 位 | 400 | `INVALID_CODE` |
| period 不在白名单 | 400 | `INVALID_PERIOD` |
| days < 1 或 > 1000 | 400 | `INVALID_DAYS` |
| 股票不存在 | 404 | `STOCK_NOT_FOUND` |
| EastMoney 不可达（已耗尽重试） | 503 | `UPSTREAM_UNAVAILABLE` |
| 本周期无 K 线（如周末请求 5min） | 200 | 返回空数组 `[]`（不是错误） |

**ENG-D1 决议实现细节：** `fetchKLine` 在 `market.ts:115-117` 对空 klines 抛 `STOCK_NOT_FOUND`（**保持不变**），以免污染 `/analyze` 现有行为。**新端点 `/api/market/kline/:code` 自己 catch**：

```ts
try {
  const klines = await fetchKLine(code, days, { period });
  res.json(klines);
} catch (err) {
  if (err instanceof Error && err.message === 'STOCK_NOT_FOUND') {
    // 分钟级周期 + STOCK_NOT_FOUND 实际是"本周期无成交"
    if (period === '5min' || period === '15min' || period === '30min' || period === '60min') {
      res.json([]);
      return;
    }
    res.status(404).json({ error: 'STOCK_NOT_FOUND', message: '股票代码未找到或已退市' });
    return;
  }
  // ... 其他错误处理
}
```

### 实施细节

`fetchKLine` 已经接受可选第三参，本次只需：

1. 在 `market.ts` 的 `fetchKLine` 签名加 `period?: KlinePeriod` 第四参（向后兼容），根据 period 替换 `klt=101` 为对应值
2. `routes/api.ts` 的 `/api/market/kline/:code` 解析 `req.query.period`、白名单校验、传给 `fetchKLine`

## 五、前端架构

### 5.1 组件树

```
ScreenerPage / WatchlistPanel / HistoryPage  (任意挂载点)
   │
   └── StockDetailDialog               // 弹窗外壳，复用 FavoriteEditDialog 的 modal 模式
        ├── DialogHeader               // 价格摘要：现价/涨跌/换手/今日高低
        ├── PeriodSegmentControl       // 多周期 segment chip
        ├── KLineChart                 // 真正的图表组件，封装 lightweight-charts
        │     ├── useKLineData()       // hook：fetch + AbortController + loading/error 状态
        │     └── 计算 MA5/MA10/MA20 (复用 utils/indicators.ts)
        └── DialogFooter               // CTA：加入收藏 / 跳详情页
```

### 5.2 `useKLineData` Hook

```ts
function useKLineData(code: string, period: KlinePeriod, days: number = 120) {
  const [data, setData] = useState<KLine[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    fetchKLineDetail(code, period, days, controller.signal)
      .then((klines) => {
        if (controller.signal.aborted) return;
        setData(klines);
        setStatus(klines.length === 0 ? 'empty' : 'success');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return; // 静默
        setError(err.message);
        setStatus('error');
      });
    return () => controller.abort();
  }, [code, period, days]);

  return { data, status, error };
}
```

**关键点：** `useEffect` 的 cleanup `controller.abort()` 处理了用户快速切换周期的竞态——前一请求被取消，UI 状态只反映最新请求。

### 5.3 `KLineChart` 封装（ENG-D2 决议：3-effect 拆分）

**关键决策（ENG-D2）：** 一个 useEffect 把 `[data, showMA]` 都当依赖会让周期切换时 chart 销毁重建，造成 80-150ms 闪烁。拆成 3 个 effect 各司其职。

```tsx
function KLineChart({ data, showMA = true }: { data: KLine[]; showMA?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<{
    candle: ISeriesApi<'Candlestick'>;
    volume: ISeriesApi<'Histogram'>;
    ma5: ISeriesApi<'Line'>;
    ma10: ISeriesApi<'Line'>;
    ma20: ISeriesApi<'Line'>;
  } | null>(null);

  // Effect 1: 创建 chart + series 一次，组件销毁时清理（deps=[]）
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: 'transparent' }, textColor: '#999' },
      grid: { vertLines: { color: '#222' }, horzLines: { color: '#222' } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;
    seriesRef.current = {
      candle: chart.addCandlestickSeries({
        upColor: '#ef4444', downColor: '#22c55e',
        borderUpColor: '#ef4444', borderDownColor: '#22c55e',
        wickUpColor: '#ef4444', wickDownColor: '#22c55e',
      }),
      volume: chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        scaleMargins: { top: 0.8, bottom: 0 },
      }),
      ma5: chart.addLineSeries({ color: '#f59e0b', lineWidth: 1 }),
      ma10: chart.addLineSeries({ color: '#3b82f6', lineWidth: 1 }),
      ma20: chart.addLineSeries({ color: '#a855f7', lineWidth: 1 }),
    };
    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Effect 2: data 变化时 setData 三个 series，不重建 chart（deps=[data]）
  useEffect(() => {
    const s = seriesRef.current;
    if (!s || data.length === 0) return;
    s.candle.setData(data.map((k) => ({
      time: k.date as Time, open: k.open, high: k.high, low: k.low, close: k.close,
    })));
    s.volume.setData(data.map((k) => ({
      time: k.date as Time, value: k.volume,
      color: k.close >= k.open ? '#ef444466' : '#22c55e66',
    })));
    s.ma5.setData(maToLineData(data, calcMA(data, 5)));
    s.ma10.setData(maToLineData(data, calcMA(data, 10)));
    s.ma20.setData(maToLineData(data, calcMA(data, 20)));
  }, [data]);

  // Effect 3: showMA toggle，独立控制可见性（deps=[showMA]）
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    [s.ma5, s.ma10, s.ma20].forEach((line) => line.applyOptions({ visible: showMA }));
  }, [showMA]);

  return <div ref={containerRef} className="h-[400px] w-full" />;
}

// UI 适配层：把纯数学 (number|null)[] 转 lightweight-charts 形状（ENG-D3 决议）
function maToLineData(klines: KLine[], ma: (number | null)[]): LineData[] {
  const out: LineData[] = [];
  for (let i = 0; i < klines.length; i++) {
    const v = ma[i];
    if (v != null) out.push({ time: klines[i].date as Time, value: v });
  }
  return out;
}
```

**关键点：**
- 单 chart 实例贯穿组件生命周期，周期切换只更新数据
- A 股颜色硬编码红涨绿跌（lightweight-charts 默认相反）
- 成交量 bar 颜色按收盘 vs 开盘判断红绿
- ResizeObserver 处理窗口/容器尺寸变化
- `maToLineData` 适配层把纯数学转 chart 形状，math 函数不耦合 UI 库

### 5.4 MA 计算（ENG-D3 决议：纯数学，UI 适配在调用点）

提取共享 `calcMA` 到 `packages/shared/src/indicators.ts`，返回 **纯数字数组**（与输入同长度，前 period-1 项为 null）。UI 形状转换由 `KLineChart` 内的 `maToLineData` 适配层完成（见 §5.3）。

```ts
// packages/shared/src/indicators.ts
/**
 * Simple moving average. Returns same-length array; the first (period-1)
 * entries are null because there is not enough data yet.
 *
 *   in  = [1, 2, 3, 4, 5, 6, 7]
 *   out = [null, null, null, 2.5, 3.5, 4.5, 5.5]  (period=4)
 */
export function calcMA(klines: { close: number }[], period: number): (number | null)[] {
  if (period <= 0) return klines.map(() => null);
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < klines.length; i++) {
    sum += klines[i].close;
    if (i >= period) sum -= klines[i - period].close;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}
```

**关键点：**
- 同长度数组，索引对齐 K 线 → 调用点逻辑简单
- 滚动窗口算法 O(N)，不是 O(N×period)
- 数学纯，无 chart-library 形状泄漏（ENG-D3）
- 后端 `apps/server/src/utils/indicators.ts` 也用这个共享版本（删重复实现）

`packages/shared/package.json` 需要把 `main` / `types` 从单文件 `./src/types.ts` 改成 barrel `./src/index.ts`：

```ts
// packages/shared/src/index.ts
export * from './types.js';
export * from './indicators.js';
```

## 六、UI 状态映射（Section 11 设计要求）

```
状态           什么时候               UI
────           ────────               ──
idle           组件刚 mount           （短暂闪过，过渡到 loading）
loading        fetch 进行中           skeleton：灰色矩形占位 + 顶部一个 spinner
success        有数据                 K 线 + MA + 成交量 + tooltip
empty          fetch 成功但 []        居中文字"本周期无 K 线数据"（如周末看 5min）
error          fetch 失败             居中错误条 + "重试" 按钮
```

## 七、错误与异常映射

| 路径 | 失败模式 | 异常类 | 处理 | 用户看到 |
|------|---------|--------|------|---------|
| GET /api/market/kline | period 非法 | 业务错误 | 400 + INVALID_PERIOD | "无效的周期参数"（前端兜底） |
| GET /api/market/kline | days 超限 | 业务错误 | 400 + INVALID_DAYS | "天数参数错误" |
| GET /api/market/kline | EastMoney 超时 | UpstreamUnavailableError | 503 | "行情服务暂时连不上"（已有友好消息） |
| GET /api/market/kline | 票不存在 | STOCK_NOT_FOUND | 404 | "股票代码未找到或已退市" |
| useKLineData fetch | network | TypeError(fetch failed) | catch + setStatus('error') | 弹窗内错误条 + 重试按钮 |
| useKLineData fetch | AbortError | DOMException | **静默不上屏** | 无（用户已切下个周期） |
| KLineChart createChart | data 格式坏 | Error | React error boundary | "图表渲染失败" |
| KLineChart 多次 useEffect 触发 | 旧实例未清 | 内存泄漏 | cleanup 必跑 chart.remove() | 不可见但能从 devtools heap 观察到 |

## 八、测试计划

### 后端（plan-eng-review 扩到 14 cases）

新增 `apps/server/src/routes/__tests__/market-kline.test.ts`：
- (1) `period` 缺省 → fetchKLine 收到 klt=101
- (2) `period=5min` → fetchKLine 收到 klt=5
- (3) `period=weekly` → fetchKLine 收到 klt=102
- (4) `period=invalid` → 400 `INVALID_PERIOD`
- (5) `days=0` → 400 `INVALID_DAYS`
- (6) `days=1001` → 400 `INVALID_DAYS`
- (7) `days=1000` 边界 → 200
- (8) `code=abc123` → 400 `INVALID_CODE`
- (9) **CRITICAL REGRESSION (ENG-D1)**：fetchKLine 抛 STOCK_NOT_FOUND + period=5min → 200 `[]`
- (10) **CRITICAL REGRESSION (ENG-D1)**：fetchKLine 抛 STOCK_NOT_FOUND + period=daily → 404
- (11) UpstreamUnavailableError 透传 503

新增 `packages/shared/src/__tests__/indicators.test.ts`：
- (12) `calcMA(period=5)` 同长度，前 4 项 null，第 5 项起滚动平均正确
- (13) `calcMA(period=N, klines<N)` → 全 null
- (14) `calcMA(period=0)` → 全 null（边界）

新增 `apps/server/src/services/__tests__/market-kline-period.test.ts`：
- 验证 `fetchKLine` 把 `opts.period` 透传到 EastMoney URL 的 klt 参数（mock fetch 检查 URL）

### 前端

无测试框架（TODO 项），手动 QA 清单：

1. 点击 screener 卡片 → 弹窗打开，显示日 K
2. 切换周期 daily → 5min → 30min，图表正确刷新，无残影
3. 快速连续切换周期（5 次），最终图表对应最后选的周期（验证 AbortController 生效）
4. 弹窗里点"加入收藏" → 卡片右上角星标亮起
5. 弹窗里点"跳详情页" → 新页打开 `/trade?code=X`
6. ESC 键 → 弹窗关闭
7. 点击 modal 外区域 → 弹窗关闭
8. 周末打开看 5min → 显示"本周期无 K 线"空态
9. 输入非法 code（手改 URL）→ 不崩溃
10. 关闭弹窗后 devtools heap → 无遗留 chart 实例

## 九、性能 & 可观测

- **bundle 影响：** `lightweight-charts` ~50KB gz，前端 First Load JS +5%
- **首次打开延迟：** ~80ms 图表初始化 + 200-500ms EastMoney fetch（已有 retry）
- **内存：** 单 chart 实例 ~2MB；cleanup 必须释放
- **日志：**
  - 前端 console.log on period change（含 from/to）
  - 后端 已有 fetchKLine 的 console.error UpstreamUnavailableError
  - 新增 `[KLINE:RENDER] code=600519 period=daily count=120` 记录每次成功渲染

## 十、长期轨迹

- **可逆性 5/5：** 加法变更，弹窗未集成时点击仍走旧的跳页逻辑。回滚 = `git revert`
- **平台潜力：** `<StockDetailDialog>` 是未来"行情瞬时浮窗"的雏形。下游可挂：
  - 收藏池里点股票（直接显示弹窗 vs 跳页）
  - 历史快照里点股票
  - 对比 diff 视图里 newcomers/dropouts 列表点股票
  - 财经资讯页里"提及股票"链接
- **路径依赖：** 与 mootdx 的关系——TODO T2 `KLineProvider` 接口抽象，让数据源可替换；现在以 EastMoney 为单一实现。这是"延迟决策直到必要"的正确姿态。

## 十一、实施阶段

### Phase 1：后端 + 共享 indicators

1. `packages/shared/src/indicators.ts` 新建 `calcMA`，覆写 server 旧实现
2. `apps/server/src/services/market.ts` 给 `fetchKLine` 加 `period` 参数
3. `apps/server/src/routes/api.ts` 给 `/api/market/kline/:code` 加 `period` 白名单
4. 后端单元 + 集成测试

### Phase 2：图表库 + 组件

5. `pnpm add lightweight-charts -F @trade/web`
6. `apps/web/src/lib/api.ts` 新增 `fetchKLineDetail(code, period, days, signal)`
7. `apps/web/src/components/KLineChart.tsx`
8. `apps/web/src/hooks/useKLineData.ts`
9. `apps/web/src/components/StockDetailDialog.tsx`

### Phase 3：集成 + 替换跳转

10. `apps/web/src/app/screener/page.tsx` 增加 dialog state，点击卡片改为打开弹窗
11. （选做）`WatchlistPanel.tsx`：点击 chip → 弹窗
12. （选做）`app/screener/history/page.tsx`：snapshot 详情里点股票 → 弹窗
13. 手动 QA 走 §八 清单 10 项

## 十二、决策日志

| ID | 来源 | 决策 | 理由 |
|----|------|------|------|
| CEO-D1 | /plan-ceo-review | 数据源用 EastMoney，不用 mootdx | 0 新依赖、0 新进程；日 K 数据零区别；通达信独特能力（L2、复权、财务）当前不需要 |
| CEO-D2 | /plan-ceo-review | SELECTIVE EXPANSION 模式 | 用户说"会加到其他地方" — 接口一次设计好 |
| CEO-D3 | /plan-ceo-review | A + B + C 三项 cherry-pick 接受 | A 多周期是 K 线核心；B MA 用现成计算；C CTA 闭环决策；D 键盘快捷键进 TODO |
| CEO-D4 | /plan-ceo-review | 图表库 lightweight-charts | TradingView 班底，文档/性能/社区最好；klinecharts 当前用不到 |
| ENG-D1 | /plan-eng-review | `fetchKLine` 不改，新端点自己 catch STOCK_NOT_FOUND 转 200+[] for minute periods | 保留 fetchKLine 原语义不污染 /analyze；语义转换在调用点 explicit |
| ENG-D2 | /plan-eng-review | KLineChart 拆 3 个 effect：创建 / setData / showMA toggle | 单 effect [data, showMA] 会让周期切换销毁重建 chart，闪烁 80-150ms |
| ENG-D3 | /plan-eng-review | calcMA 返 (number\|null)[]，UI 形状在 KLineChart 适配 | shared 包数学函数不耦合 lightweight-charts 形状；换 chart 库只改一处 |
| 隐式 | — | 扩展现有 /api/market/kline 而非新端点 | DRY；period 参数向后兼容（默认 daily 与旧行为一致） |
| 隐式 | — | MA 计算在客户端 | 数据已在 client，无需 round-trip |
| 隐式 | — | period 切换用 AbortController | 防 race，前一请求被新请求取消 |
| 隐式 | — | A 股红涨绿跌颜色硬编码 | 默认 lightweight-charts 是反的，本地约定 |
| 隐式 | — | shared 包改 barrel：`main: ./src/index.ts` re-export types + indicators | 加新模块就需要 barrel；mechanical 改 |

## 十三、未解决决策

无。
