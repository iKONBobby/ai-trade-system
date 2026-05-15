// RunRegistry: 内存级 runId → AbortController + state 映射.
//
// 职责:
//   - 创建 runId (UUID v4)
//   - 维护每个 run 的 AbortController, state, last-heartbeat 时间戳
//   - C1: TTL watcher — 30s 无心跳的 run 自动 abort
//   - 完成或 aborted 后 5min TTL 清理
//
// 单用户内存级实现; server 重启即丢. design doc 已 flag 此约束.
//
//   STATE MACHINE:
//
//     [pending] ─── first heartbeat ──▶ [running]
//                                         │
//        ┌────────────────────────────────┤
//        │                                │
//        │ all agents done            external POST abort / TTL timeout
//        ▼                                ▼
//     [done] ─── 5min ──▶ [evicted]   [aborted] ─── 5min ──▶ [evicted]

import { randomUUID } from 'node:crypto';

export type RunState = 'pending' | 'running' | 'done' | 'aborted' | 'error';

export interface RunMetadata {
  stockCode?: string;
  presetId?: string;
}

export interface RunEntry {
  runId: string;
  state: RunState;
  ctrl: AbortController;
  createdAt: number;
  lastHeartbeatAt: number;
  finishedAt?: number;
  meta: RunMetadata;
}

const TTL_NO_HEARTBEAT_MS = 30_000; // C1: SSE 断开 30s 后 auto abort
const TTL_FINISHED_MS = 5 * 60_000; // done/aborted 5min 后清理
const WATCHER_INTERVAL_MS = 10_000;

export class RunRegistry {
  private readonly entries = new Map<string, RunEntry>();
  private watcher: NodeJS.Timeout | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  start(): void {
    if (this.watcher) return;
    this.watcher = setInterval(() => this.sweep(), WATCHER_INTERVAL_MS);
    // 不让 watcher 阻止 Node 退出
    this.watcher.unref?.();
  }

  stop(): void {
    if (this.watcher) {
      clearInterval(this.watcher);
      this.watcher = null;
    }
  }

  create(meta: RunMetadata = {}): RunEntry {
    const runId = `swr_${randomUUID().slice(0, 12)}`;
    const ctrl = new AbortController();
    const now = this.now();
    const entry: RunEntry = {
      runId,
      state: 'pending',
      ctrl,
      createdAt: now,
      lastHeartbeatAt: now,
      meta: { ...meta },
    };
    this.entries.set(runId, entry);
    return entry;
  }

  get(runId: string): RunEntry | undefined {
    return this.entries.get(runId);
  }

  markRunning(runId: string): void {
    const entry = this.entries.get(runId);
    if (entry && entry.state === 'pending') {
      entry.state = 'running';
    }
  }

  heartbeat(runId: string): void {
    const entry = this.entries.get(runId);
    if (entry && (entry.state === 'pending' || entry.state === 'running')) {
      entry.lastHeartbeatAt = this.now();
    }
  }

  markDone(runId: string): void {
    const entry = this.entries.get(runId);
    if (entry && entry.state !== 'aborted') {
      entry.state = 'done';
      entry.finishedAt = this.now();
    }
  }

  markError(runId: string): void {
    const entry = this.entries.get(runId);
    if (entry && entry.state !== 'aborted') {
      entry.state = 'error';
      entry.finishedAt = this.now();
    }
  }

  // 外部 abort (POST /abort) 或 TTL watcher 都走这条路径
  abort(runId: string, reason: 'user_cancel' | 'ttl_timeout'): boolean {
    const entry = this.entries.get(runId);
    if (!entry) return false;
    if (entry.state === 'done' || entry.state === 'aborted' || entry.state === 'error') {
      return false; // 已 terminal, noop
    }
    entry.state = 'aborted';
    entry.finishedAt = this.now();
    // 把 reason 通过 AbortController 的 reason 字段传出去; runtime 读它来 emit 正确事件
    entry.ctrl.abort(new Error(reason));
    return true;
  }

  // TTL sweep: 单次扫描, 由 watcher interval 触发或测试直接调用
  sweep(): void {
    const now = this.now();
    for (const [runId, entry] of this.entries) {
      if (entry.state === 'pending' || entry.state === 'running') {
        if (now - entry.lastHeartbeatAt > TTL_NO_HEARTBEAT_MS) {
          this.abort(runId, 'ttl_timeout');
        }
      } else if (entry.finishedAt && now - entry.finishedAt > TTL_FINISHED_MS) {
        this.entries.delete(runId);
      }
    }
  }

  // 测试/debug 用
  size(): number {
    return this.entries.size;
  }

  /** 测试 hook: 清空全部 entries. 仅 test 用. */
  _clearForTest(): void {
    this.entries.clear();
  }
}

// 模块级单例 (server 内部统一注册表)
export const runRegistry = new RunRegistry();
