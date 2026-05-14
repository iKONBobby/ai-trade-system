# 智能选股持久化方案 — 选股日记

> 状态：ACTIVE（待实施）
> 评审：/plan-ceo-review SELECTIVE EXPANSION 模式
> 决策日期：2026-05-11
> 分支：main

## 一、问题陈述

当前智能选股 (`apps/web/src/app/screener/page.tsx`) 存在两个核心痛点：

1. **历史无存档**：扫描完成后，结果只在内存的 `ScanningJob` 里活 10 分钟（`engine.ts:152-162`），刷新页面或重启服务即焚。
2. **收藏不可靠**：收藏存在浏览器 `localStorage`（`WatchlistPanel.tsx:7-18`），清缓存、换浏览器、隐私模式都会丢。

**目标**：把"一次性扫描工具"升级为"按日期归档的选股日记"。

## 二、范围决策（来自 /plan-ceo-review）

### 已接受（本次实施）

| # | 范围项 | 备注 |
|---|--------|------|
| 1 | 服务端 JSON 文件持久化（history + favorites） | 基线 |
| 2 | 首次加载自动迁移 localStorage 收藏 → 服务端 | D3-A |
| 3 | 按日期归档历史 | 基线 |
| 4 | 扫描结束自动入库 + 快照对比 | D4-A |
| 5 | 收藏标签（1-3 个）+ 备注 | D4-B |
| 6 | 历史日期筛选（今天/7天/30天/全部）+ 策略维度竖看 | D4-C |
| 7 | 一键 JSON 备份 / 恢复 | D4-D |

### 明确不在范围（NOT in scope）

- **多用户/认证系统**：单机单用户本地工具，无需 user_id 概念。
- **SQLite/数据库**：JSON 文件够用，数据量未来 1 年内不会破 10MB。
- **跨设备同步**：通过备份/恢复手动完成（D4-D），不做云端同步。
- **回测引擎**：策略胜率分析是 Phase 2，本次只存数据让它有基础。
- **图表化历史趋势**：本次只做表格 + diff，K 线复用现有 `klineSnapshot`。

### 进入 TODO（未来 Phase 2）

- 策略胜率聚合面板（基于 history 数据）
- 历史扫描"重跑"按钮（用当时的策略+今天数据再扫一遍）
- 收藏到达预设条件时的提醒

## 三、数据模型

### 3.1 文件布局

```
apps/server/data/
├── stocks.json                  # 现有，股票列表 fallback
├── history/
│   ├── index.json               # 新增，HistoryIndex[]（仅元数据）
│   └── {jobId}.json             # 新增，每份 snapshot 一个文件
├── favorites.json               # 新增，收藏池
└── .gitignore                   # 新增，忽略 history/ + favorites.json
```

**决策 D2**：history 采用 index + 分片布局。`history/index.json` 仅存元数据（id/date/timestamp/strategyIds/totalResults），实际 `ScreenerResult[]` 在 `history/{jobId}.json`。理由：单文件方案一年后 ~35MB，每次 GET /history（只为列表）和每次扫描完成都得读写 35MB；分片让 IO 与数据量解耦。

`history/` 整目录和 `favorites.json` 进 `.gitignore`，因为是用户数据；`stocks.json` 已有，是公共数据保留。

### 3.2 类型定义（`packages/shared/src/types.ts` 追加）

```ts
// 历史快照：一次完整的扫描结果
export interface ScanSnapshot {
  id: string;              // job_xxx，复用 jobId
  date: string;            // ISO date "2026-05-11"
  timestamp: string;       // ISO datetime
  strategyIds: string[];
  marketFilter: string;    // 'all' | 'sh' | 'sz' | 'hs300'
  durationMs: number;
  results: Record<string, ScreenerResult[]>; // strategyId → results (top 50)
}

// 历史索引（按日期分组，UI 用）
export interface HistoryIndex {
  date: string;
  snapshots: Array<{
    id: string;
    timestamp: string;
    strategyIds: string[];
    totalResults: number;
  }>;
}

// 收藏（扩展现有 ScreenerResult，加 tags + note + addedAt）
export interface FavoriteEntry {
  stock: ScreenerResult;
  tags: string[];          // 用户自定义，最多 3 个
  note: string;            // 备注，最多 200 字
  addedAt: string;         // ISO datetime
}

// 快照对比结果
export interface SnapshotDiff {
  fromId: string;
  toId: string;
  strategyId: string;
  newcomers: ScreenerResult[];   // 仅 toId 出现
  dropouts: ScreenerResult[];    // 仅 fromId 出现
  retained: Array<{              // 两边都在
    stock: ScreenerResult;
    scoreDelta: number;
  }>;
}

// 备份格式
export interface BackupBundle {
  version: 1;
  exportedAt: string;
  history: ScanSnapshot[];
  favorites: FavoriteEntry[];
}
```

### 3.3 文件结构

`history.json`：单个数组，按 timestamp 升序，最多保留 365 条（约一年）。超出滚动删除最旧的。

```json
[
  { "id": "job_1715...", "date": "2026-05-11", "timestamp": "...", "strategyIds": ["ma_bullish"], "marketFilter": "all", "durationMs": 47230, "results": { "ma_bullish": [ ... ] } }
]
```

`favorites.json`：单个数组，无上限警示（前端仍提示 50）。

```json
[
  { "stock": { "code": "600519", ... }, "tags": ["长线"], "note": "护城河深", "addedAt": "..." }
]
```

## 四、API 契约

新增 `apps/server/src/routes/history.ts` 和 `routes/favorites.ts`，在 `index.ts` 挂载到 `/api/history` 和 `/api/favorites`。

### History

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/history` | 查询参数 `range=today\|7d\|30d\|all`，返回 `HistoryIndex[]` |
| GET | `/api/history/:id` | 单条 snapshot 完整结果 |
| GET | `/api/history/diff?from=ID&to=ID&strategyId=X` | 返回 `SnapshotDiff` |
| DELETE | `/api/history/:id` | 删除单条（可选 UI，但 API 留着） |

### Favorites

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/favorites` | 返回 `FavoriteEntry[]` |
| POST | `/api/favorites` | body: `{ stock, tags?, note? }`，添加 |
| PATCH | `/api/favorites/:code` | body: `{ tags?, note? }`，更新元数据 |
| DELETE | `/api/favorites/:code` | 移除 |
| POST | `/api/favorites/bulk-import` | body: `ScreenerResult[]`，迁移用，已存在的 code 跳过 |

### Backup

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/backup/export` | 返回 `BackupBundle`，前端触发下载 |
| POST | `/api/backup/import` | body: `BackupBundle`，**覆盖** history + favorites（前端要弹确认） |

## 五、存储策略 — 并发与可靠性

### 5.1 写入安全 — 读改写原子性

**决策 D1**：JsonStore 必须暴露 `update(fn)` API 把读-改-写包成原子动作。直接调 `read()` + `write()` 会有 lost-update：两个并发 PATCH 各自基于"老快照"修改，后写覆盖前写。

```ts
// apps/server/src/services/storage/json-store.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

export class JsonStore<T> {
  private lock: Promise<unknown> = Promise.resolve();

  constructor(private filePath: string, private defaultValue: T) {}

  // 只读，不进锁。仅用于无副作用的只读场景。
  async read(): Promise<T> {
    try {
      const buf = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(buf) as T;
    } catch (err: any) {
      if (err.code === 'ENOENT') return structuredClone(this.defaultValue);
      throw err;
    }
  }

  // 业务级原子操作：所有 mutator 串行化，含 read+modify+write 三步
  async update<R = void>(mutator: (data: T) => T | Promise<T>): Promise<T> {
    const chained = this.lock.then(async () => {
      const current = await this.read();
      const next = await mutator(current);
      await this.atomicWrite(next);
      return next;
    });
    // 即使 mutator 抛错，锁也要释放（不传染失败）
    this.lock = chained.catch(() => undefined);
    return chained;
  }

  private async atomicWrite(data: T): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmp, this.filePath); // POSIX 原子 rename
  }
}
```

**服务层调用约束**：所有改动 favorites / history 的代码路径必须走 `update(fn)`，禁止直接 `read()` + `write()` 组合。eslint 可加 no-restricted-syntax 规则约束。

### 5.2 损坏恢复

`read()` 抛错（`JSON.parse` 失败）时，service 层捕获：
1. 把损坏文件改名为 `history.json.corrupt.{timestamp}`
2. 用 default 值（空数组）启动
3. 用 `console.error` 打日志，包含路径和原始错误
4. **不**自动删除损坏文件 — 用户可手动检查

### 5.3 滚动策略（history）

`HistoryService.append(snapshot)` 在 index 的 mutex 内：
1. 写 `history/{jobId}.json`（shard 文件）
2. `indexStore.update(idx => { idx.unshift(meta); ... })`
3. 若 index 条数 > `MAX_HISTORY_ENTRIES`（= 365），从末尾切出多余 meta，**删对应 shard 文件**，再 update index
4. shard 删除失败不阻塞 index 更新（best-effort + log），下次扫描可再尝试 GC 孤儿文件

孤儿 shard 检测（启动时）：列出 `history/*.json`，与 index 比对，删除 index 里没有的（即"上次没删干净的")。

### 5.4 启动校验

服务器启动时（`index.ts` initStockList 之后）跑一次 `validateStores()`：
- 读 history.json + favorites.json
- 验证是数组、每条有必需字段
- 失败则走 5.2 损坏恢复流程

## 六、迁移：localStorage → 服务端

### 6.1 时机

前端 `screener/page.tsx` 的 `useEffect` 内，**首次进入页面**时：

```ts
useEffect(() => {
  (async () => {
    const serverFavs = await fetchFavorites();
    if (serverFavs.length === 0) {
      const localRaw = localStorage.getItem('screener_favorites');
      if (localRaw) {
        try {
          const localFavs = JSON.parse(localRaw) as ScreenerResult[];
          if (Array.isArray(localFavs) && localFavs.length > 0) {
            await bulkImportFavorites(localFavs);
            localStorage.removeItem('screener_favorites'); // 清掉
            console.log(`[迁移] ${localFavs.length} 条收藏从 localStorage 迁到服务端`);
          }
        } catch { /* 静默忽略损坏数据 */ }
      }
    }
    setFavorites(await fetchFavorites());
  })();
}, []);
```

### 6.2 风险

- **双写期**：迁移之前如果用户在不同浏览器有不同 localStorage 数据，只迁移本次打开的浏览器的。这是单用户单机工具，可接受。
- **失败回退**：`bulkImportFavorites` 失败时**不**清 localStorage，下次重试。

## 七、前端改动

### 7.1 路由 + 导航

`Sidebar.tsx` 增加"历史"入口 → 新建 `apps/web/src/app/screener/history/page.tsx`

### 7.2 ScreenerPage 改动

- `loadFavorites` / `saveFavorites` 全部替换为 API 调用
- 扫描完成的 `useEffect` 里：检测 `allDone` 后，post-record 不再调本地 `recordScan`，因为服务端已经在 job done 时自动入库
- 加"刚刚扫的 vs 历史" 提示横幅：扫描完成后显示"对比上次同策略扫描？→ 跳到 history page"

### 7.3 History 页面（新）

布局：
```
┌─────────────────────────────────────────────────┐
│ 历史扫描   [今天][7天][30天][全部] [备份][恢复] │
├─────────────────────────────────────────────────┤
│ 2026-05-11                                       │
│   14:32  ma_bullish · all · 23 命中  [查看][对比] │
│   09:15  pullback · sh · 11 命中     [查看][对比] │
│ 2026-05-10                                       │
│   ...                                            │
└─────────────────────────────────────────────────┘
```

点"对比"打开侧边栏选另一个 snapshot，渲染 `SnapshotDiff`（3 个 tab：新进/跌出/留存）。

### 7.4 WatchlistPanel 改造

- 顶部加标签筛选 chip：`[全部] [长线] [短线] [观察]`（标签来源是 favorites 里所有 tags 的并集）
- 每个收藏卡右键/悬浮显示"编辑标签 + 备注" 小弹窗

## 八、错误与异常映射（Section 2: Error & Rescue Map）

| 代码路径 | 失败模式 | 异常类 | 处理 | 用户看到 |
|---------|---------|--------|------|---------|
| `JsonStore.read` | 文件不存在 | ENOENT | 返回 default | 透明 |
| `JsonStore.read` | JSON parse 失败 | SyntaxError | 改名 .corrupt + log + default | 控制台报警，UI 空数据 |
| `JsonStore.read` | 权限 | EACCES | 抛出 | 500 + "服务器无法读取存储" |
| `JsonStore.write` | 磁盘满 | ENOSPC | 抛出 | 500 + "存储空间不足" |
| `JsonStore.write` | 权限 | EACCES | 抛出 | 500 + "服务器无法写入存储" |
| `POST /favorites` | tags > 3 | 业务错误 | 400 + INVALID_TAGS | "最多 3 个标签" |
| `POST /favorites` | note > 200 字 | 业务错误 | 400 + NOTE_TOO_LONG | "备注最多 200 字" |
| `POST /backup/import` | version 不匹配 | 业务错误 | 400 + VERSION_MISMATCH | "备份版本不兼容" |
| `POST /backup/import` | 非数组 / 字段缺失 | 业务错误 | 400 + INVALID_BUNDLE | "备份文件格式错误" |
| 引擎 done 后入库 | 持久化失败 | 任意 | catch + log，**不影响** UI 返回结果 | UI 正常显示结果，但下次进入 history 看不到这条 |

**关键原则**：扫描结果展示流不能被持久化失败阻塞。入库是 best-effort，失败有日志。

## 九、测试计划

服务端用 vitest（已配置 `apps/server/package.json`）。前端无测试框架，UI 流程手动验。

| 类型 | 文件 | 必须覆盖的用例 |
|------|------|----------------|
| Unit | `services/storage/json-store.test.ts` | (1) read ENOENT 返 default (2) read parse 错抛 SyntaxError (3) `update(fn)` 并发 10 个 mutator 串行化（验证 lost update 已修） (4) mutator throw 后下次 update 仍成功（锁释放） (5) 原子 rename 失败时不留半文件 |
| Unit | `services/history.test.ts` | (1) append 写 index + shard 双文件 (2) 滚动到 366 条删最旧 + 对应 shard 文件被删 (3) 启动时孤儿 shard 被清 (4) list(range) 按 today/7d/30d/all 过滤 (5) get(id) shard 缺失时返回 404 不是崩溃 |
| Unit | `services/favorites.test.ts` | (1) add 满足约束 (2) tags > 3 抛 INVALID_TAGS (3) note > 200 抛 NOTE_TOO_LONG (4) bulk import 已存在 code 跳过 (5) **并发对同一 code 调 update 不丢更新**（D1 mutex 校验） |
| Unit | `services/diff.test.ts` | (1) newcomers/dropouts/retained 三种情况 (2) scoreDelta 正负 (3) 边界：fromId == toId 全部 retained (4) 边界：strategyId 在某 snapshot 不存在 → 各空数组 |
| Unit | **新增** `engine.test.ts` | (D3) Mock JsonStore.update 抛错 → 验证 job.status 仍 'done' + results 完整 + console.error 被调用，规避未来"best-effort"被改成 await throw |
| Integration | `routes/history.test.ts` | 全部 endpoint 200/400/404 |
| Integration | `routes/favorites.test.ts` | 同上 + bulk-import 幂等 + tags/note 边界 |
| Integration | `routes/backup.test.ts` | (1) export → 修改 → import 恢复一致 (2) import version 不匹配 400 (3) import 非数组 400 (4) import 字段缺失 400 |
| Manual | `apps/web` | 迁移流程（首次/重复加载/损坏 localStorage）、对比 UI、备份下载/上传、标签编辑 |

## 十、可观测性

- 每次 history 写入 `console.log('[HISTORY:WRITE] id=xxx results=N')`
- 损坏文件改名时 `console.error('[STORAGE:CORRUPT] file=xxx renamed=xxx')`
- 迁移成功 `console.log('[MIGRATE] favorites: N items localStorage → server')`
- 备份导入 `console.log('[BACKUP:IMPORT] history=N favorites=M version=1')`

## 十一、部署

- 单文件部署，无 schema migration
- 首次启动自动创建 `apps/server/data/` 目录
- `.gitignore` 加 `apps/server/data/history.json`、`apps/server/data/favorites.json`
- 回滚：删两个 JSON 文件 → 回到初始状态（不会丢现有 stocks.json）

## 十二、长期轨迹

- **可逆性 5/5**：纯加法，删 JSON 文件即回退
- **路径依赖**：JSON 文件结构有 `version` 字段（隐式 v1），未来要换 SQLite 写个一次性迁移脚本
- **生态契合**：保持 Node.js 原生 `fs`，无新依赖

## 十三、实施阶段

### Phase 1：基线持久化（必须先做）

1. 新建 `JsonStore<T>` 工具
2. 新建 `services/history.ts`、`services/favorites.ts`
3. 新建 `routes/history.ts`、`routes/favorites.ts`，挂到 `index.ts`
4. 共享类型扩展
5. engine.ts 在 `job.status = 'done'` 后调用 history 写入（best-effort）
6. 前端 `api.ts` 加新方法
7. 前端 `screener/page.tsx` 加首次加载迁移 + 替换 localStorage 收藏
8. Unit + Integration 测试

### Phase 2：增强 UI

9. 新建 `app/screener/history/page.tsx` + 路由 + Sidebar 入口
10. SnapshotDiff 渲染组件
11. WatchlistPanel 标签筛选 + 编辑弹窗
12. 备份/恢复按钮

### Phase 3：QA

13. 手动跑一遍：扫两次 → 对比 → 加标签 → 备份 → 删数据 → 恢复
14. 制造损坏：手动改坏 history.json 一个字符 → 重启 → 验证 .corrupt 改名

## 十四、决策日志

| ID | 来源 | 决策 | 理由 |
|----|------|------|------|
| CEO-D1 | /plan-ceo-review | 选 JSON 文件而非 SQLite | 单用户单机，零依赖，可直接 vi 检查 |
| CEO-D2 | /plan-ceo-review | SELECTIVE EXPANSION 模式 | 基线 + cherry-pick，避免静默扩散 |
| CEO-D3 | /plan-ceo-review | 首次加载自动迁移 localStorage | 代价低，避免静默丢失老数据 |
| CEO-D4 | /plan-ceo-review | 全部接受 4 个增强项 | 用户明确选了完整选股日记愿景 |
| ENG-D1 | /plan-eng-review | JsonStore 暴露 `update(fn)` 业务级 mutex | 修读改写丢失更新；API 强制原子性 |
| ENG-D2 | /plan-eng-review | history 拆 index + 分片 | 35MB/年 单文件 IO 不可接受；分片让 IO 与数据量解耦 |
| ENG-D3 | /plan-eng-review | engine.ts 加 regression test | 锁死"持久化失败不阻塞 UI"契约，防未来重构静默退化 |
| ENG-D4 | /plan-eng-review | 跳过 outside voice | 单用户本机工具，三道架构问题已锁，价值/时间比低 |
| 隐式 | — | 365 条 history 上限 | 一年的元数据 ~30KB，shard 文件按需读 |
| 隐式 | — | tags 上限 3、note 上限 200 | 防 UI 失控，后端强制校验 |
| 隐式 | — | 持久化失败不阻塞扫描 UI | 数据展示是核心路径，存储是次要 |

## 十五、TODO（不在本次范围，进入后续）

| # | 项目 | 上下文 | 优先级 |
|---|------|--------|--------|
| 1 | HS300 market filter 修复 | `engine.ts:216` 注释"hs300 handled later"，目前 'hs300' 与 'all' 行为相同。需要在 stock list 里打 HS300 标记或拉成分股列表过滤 | P2 |
| 2 | 策略胜率聚合面板 | 基于 history.json 数据计算"某策略最近 30 天选中股票的平均/中位涨幅" | P3，Phase 2 |
| 3 | 历史扫描重跑 | "用今天的行情数据 + 当时的策略" 再扫一遍，看哪些股票仍命中 | P3，Phase 2 |
| 4 | 收藏阈值提醒 | 收藏股票股价/得分跌破阈值时高亮 | P3，Phase 2 |
| 5 | 前端测试基础设施 | 加 vitest + react testing library，至少覆盖 migration 流程；目前 `apps/web` 完全无测试 | P3，开发体验改进 |
| 6 | eslint 规则禁止直接 read+write | 防止有人绕过 `update(fn)` 业务原子性 | P3，DX 护栏 |

## 十六、未解决决策

无。所有 AskUserQuestion 已收到回答。
