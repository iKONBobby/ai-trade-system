import { describe, it, expect, beforeEach } from 'vitest';
import { RunRegistry } from '../run-registry.js';

describe('RunRegistry', () => {
  let nowMs: number;
  let registry: RunRegistry;

  beforeEach(() => {
    nowMs = 1_000_000;
    registry = new RunRegistry(() => nowMs);
  });

  describe('create + lookup', () => {
    it('生成唯一 runId 前缀 swr_', () => {
      const a = registry.create();
      const b = registry.create();
      expect(a.runId).toMatch(/^swr_/);
      expect(b.runId).toMatch(/^swr_/);
      expect(a.runId).not.toBe(b.runId);
    });

    it('初始 state 为 pending', () => {
      const e = registry.create();
      expect(e.state).toBe('pending');
      expect(e.createdAt).toBe(nowMs);
      expect(e.lastHeartbeatAt).toBe(nowMs);
    });

    it('get() 命中 + miss', () => {
      const e = registry.create();
      expect(registry.get(e.runId)).toBe(e);
      expect(registry.get('unknown')).toBeUndefined();
    });
  });

  describe('state transitions', () => {
    it('pending → running via markRunning()', () => {
      const e = registry.create();
      registry.markRunning(e.runId);
      expect(e.state).toBe('running');
    });

    it('markRunning 在 running 之后是 noop', () => {
      const e = registry.create();
      registry.markRunning(e.runId);
      registry.markRunning(e.runId);
      expect(e.state).toBe('running');
    });

    it('markRunning 在 done 之后不会回退', () => {
      const e = registry.create();
      registry.markDone(e.runId);
      registry.markRunning(e.runId);
      expect(e.state).toBe('done');
    });

    it('markDone 设 finishedAt', () => {
      const e = registry.create();
      nowMs += 5000;
      registry.markDone(e.runId);
      expect(e.state).toBe('done');
      expect(e.finishedAt).toBe(nowMs);
    });

    it('markDone 在 aborted 之后是 noop (aborted 优先级高)', () => {
      const e = registry.create();
      registry.abort(e.runId, 'user_cancel');
      registry.markDone(e.runId);
      expect(e.state).toBe('aborted');
    });

    it('markError 设 state=error + finishedAt', () => {
      const e = registry.create();
      registry.markError(e.runId);
      expect(e.state).toBe('error');
      expect(e.finishedAt).toBe(nowMs);
    });
  });

  describe('heartbeat', () => {
    it('更新 lastHeartbeatAt', () => {
      const e = registry.create();
      registry.markRunning(e.runId);
      nowMs += 5000;
      registry.heartbeat(e.runId);
      expect(e.lastHeartbeatAt).toBe(nowMs);
    });

    it('terminal state 不接受 heartbeat', () => {
      const e = registry.create();
      const t0 = e.lastHeartbeatAt;
      registry.markDone(e.runId);
      nowMs += 5000;
      registry.heartbeat(e.runId);
      expect(e.lastHeartbeatAt).toBe(t0);
    });
  });

  describe('abort', () => {
    it('user_cancel 触发 ctrl.abort + state=aborted', () => {
      const e = registry.create();
      const result = registry.abort(e.runId, 'user_cancel');
      expect(result).toBe(true);
      expect(e.state).toBe('aborted');
      expect(e.ctrl.signal.aborted).toBe(true);
      expect((e.ctrl.signal.reason as Error)?.message).toBe('user_cancel');
    });

    it('ttl_timeout 同样路径但 reason 不同', () => {
      const e = registry.create();
      registry.abort(e.runId, 'ttl_timeout');
      expect((e.ctrl.signal.reason as Error)?.message).toBe('ttl_timeout');
    });

    it('已 terminal 时 abort 返回 false 不动状态', () => {
      const e = registry.create();
      registry.markDone(e.runId);
      const result = registry.abort(e.runId, 'user_cancel');
      expect(result).toBe(false);
      expect(e.state).toBe('done');
    });

    it('未知 runId 返回 false', () => {
      expect(registry.abort('unknown', 'user_cancel')).toBe(false);
    });
  });

  describe('TTL watcher (C1)', () => {
    it('running run 无心跳 31s → auto abort with ttl_timeout', () => {
      const e = registry.create();
      registry.markRunning(e.runId);
      nowMs += 31_000;
      registry.sweep();
      expect(e.state).toBe('aborted');
      expect((e.ctrl.signal.reason as Error)?.message).toBe('ttl_timeout');
    });

    it('running run 心跳保持 → 不被 abort', () => {
      const e = registry.create();
      registry.markRunning(e.runId);
      for (let i = 0; i < 5; i++) {
        nowMs += 20_000;
        registry.heartbeat(e.runId);
        registry.sweep();
      }
      expect(e.state).toBe('running');
    });

    it('done run 5min 后 sweep 清理', () => {
      const e = registry.create();
      registry.markDone(e.runId);
      expect(registry.size()).toBe(1);
      nowMs += 5 * 60_000 + 1000;
      registry.sweep();
      expect(registry.size()).toBe(0);
    });

    it('aborted run 5min 后 sweep 清理', () => {
      const e = registry.create();
      registry.abort(e.runId, 'user_cancel');
      nowMs += 5 * 60_000 + 1000;
      registry.sweep();
      expect(registry.size()).toBe(0);
    });

    it('error run 同样 5min 清理', () => {
      const e = registry.create();
      registry.markError(e.runId);
      nowMs += 5 * 60_000 + 1000;
      registry.sweep();
      expect(registry.size()).toBe(0);
    });

    it('多 run 混合: pending 心跳保持 + done 老旧 同时存在时 sweep 各自处理', () => {
      const fresh = registry.create();
      registry.markRunning(fresh.runId);
      const stale = registry.create();
      registry.markDone(stale.runId);

      nowMs += 6 * 60_000;
      // fresh 没有 heartbeat update, 但已 mock 时间过 6min, ttl 30s 早就触发
      registry.sweep();
      expect(fresh.state).toBe('aborted');
      // stale done 已 5min+, 应被 evict
      expect(registry.get(stale.runId)).toBeUndefined();
    });
  });
});
