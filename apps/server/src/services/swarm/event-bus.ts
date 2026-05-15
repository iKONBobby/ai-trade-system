// SwarmEventBus: per-runId pub-sub + replay buffer.
//
// 职责拆分:
//   - run-registry: state machine + AbortController + TTL
//   - event-bus  : 事件 buffer + 订阅
//   - route      : 把两者粘合 (SSE handler 读 buffer + subscribe)
//
// 生命周期: 与 RunRegistry 同步. route 创建 runId 时同时 init bus;
// runRegistry sweep evict 时同步 dispose bus.

import { EventEmitter } from 'node:events';
import type { SwarmEvent } from '@trade/shared';

const EVENT_NAME = 'event';

interface RunChannel {
  buffer: SwarmEvent[];
  emitter: EventEmitter;
  closed: boolean;
}

export class SwarmEventBus {
  private readonly channels = new Map<string, RunChannel>();

  init(runId: string): void {
    if (this.channels.has(runId)) return;
    this.channels.set(runId, {
      buffer: [],
      emitter: new EventEmitter(),
      closed: false,
    });
  }

  /** 发送事件: 加入 buffer + 通知 subscribers. 不存在的 runId 静默忽略. */
  emit(runId: string, event: SwarmEvent): void {
    const ch = this.channels.get(runId);
    if (!ch || ch.closed) return;
    ch.buffer.push(event);
    ch.emitter.emit(EVENT_NAME, event);
    // 终止事件 → mark closed, 后续 emit 静默忽略, 但保留 buffer 供 replay
    if (
      event.type === 'swarm_completed' ||
      event.type === 'swarm_error' ||
      event.type === 'swarm_aborted'
    ) {
      ch.closed = true;
    }
  }

  /**
   * 订阅 runId 的事件流. 返回 unsubscribe 函数.
   * 注意: 不会自动 replay buffer; caller 自己读 buffered() 决定何时 replay.
   */
  subscribe(runId: string, listener: (event: SwarmEvent) => void): () => void {
    const ch = this.channels.get(runId);
    if (!ch) return () => {};
    ch.emitter.on(EVENT_NAME, listener);
    return () => ch.emitter.off(EVENT_NAME, listener);
  }

  /** 返回 buffered events 的 shallow copy (caller 不能 mutate 内部数组). */
  buffered(runId: string): SwarmEvent[] {
    return this.channels.get(runId)?.buffer.slice() ?? [];
  }

  isClosed(runId: string): boolean {
    return this.channels.get(runId)?.closed ?? false;
  }

  /** 清理 runId 的 buffer + emitter (RunRegistry evict 时调用). */
  dispose(runId: string): void {
    const ch = this.channels.get(runId);
    if (!ch) return;
    ch.emitter.removeAllListeners();
    this.channels.delete(runId);
  }

  size(): number {
    return this.channels.size;
  }
}

// 模块级单例 — server 内部统一总线
export const swarmEventBus = new SwarmEventBus();
