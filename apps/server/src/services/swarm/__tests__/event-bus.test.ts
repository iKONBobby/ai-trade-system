import { describe, it, expect, beforeEach } from 'vitest';
import type { SwarmEvent } from '@trade/shared';
import { SwarmEventBus } from '../event-bus.js';

function evt(type: SwarmEvent['type'], extra: Record<string, unknown> = {}): SwarmEvent {
  return { type, ...extra } as SwarmEvent;
}

describe('SwarmEventBus', () => {
  let bus: SwarmEventBus;

  beforeEach(() => {
    bus = new SwarmEventBus();
  });

  describe('init + emit + buffered', () => {
    it('未 init 的 runId 静默忽略 emit', () => {
      bus.emit('unknown', evt('swarm_started', { runId: 'x', presetId: 'p', agentIds: [] }));
      expect(bus.buffered('unknown')).toEqual([]);
    });

    it('init 后 emit 进 buffer', () => {
      bus.init('r1');
      bus.emit('r1', evt('swarm_started', { runId: 'r1', presetId: 'p', agentIds: [] }));
      bus.emit('r1', evt('agent_started', { agentId: 'bull_advocate', index: 0 }));
      const buf = bus.buffered('r1');
      expect(buf).toHaveLength(2);
      expect(buf[0].type).toBe('swarm_started');
    });

    it('buffered 返回 shallow copy, 修改不影响内部', () => {
      bus.init('r1');
      bus.emit('r1', evt('swarm_started', { runId: 'r1', presetId: 'p', agentIds: [] }));
      const buf = bus.buffered('r1');
      buf.pop();
      expect(bus.buffered('r1')).toHaveLength(1);
    });

    it('init 同一 runId 两次幂等', () => {
      bus.init('r1');
      bus.emit('r1', evt('swarm_started', { runId: 'r1', presetId: 'p', agentIds: [] }));
      bus.init('r1'); // 不应清空
      expect(bus.buffered('r1')).toHaveLength(1);
    });
  });

  describe('subscribe', () => {
    it('subscribe 后收到新 emit 的 event', () => {
      bus.init('r1');
      const received: SwarmEvent[] = [];
      bus.subscribe('r1', (e) => received.push(e));
      bus.emit('r1', evt('agent_started', { agentId: 'bull_advocate', index: 0 }));
      expect(received).toHaveLength(1);
    });

    it('多个 subscriber 都收到', () => {
      bus.init('r1');
      const r1: SwarmEvent[] = [];
      const r2: SwarmEvent[] = [];
      bus.subscribe('r1', (e) => r1.push(e));
      bus.subscribe('r1', (e) => r2.push(e));
      bus.emit('r1', evt('swarm_completed', { runId: 'r1', verdict: {}, durationMs: 100 }));
      expect(r1).toHaveLength(1);
      expect(r2).toHaveLength(1);
    });

    it('unsubscribe 后不再收到', () => {
      bus.init('r1');
      const received: SwarmEvent[] = [];
      const off = bus.subscribe('r1', (e) => received.push(e));
      bus.emit('r1', evt('agent_started', { agentId: 'bull_advocate', index: 0 }));
      off();
      bus.emit('r1', evt('agent_completed', { agentId: 'bull_advocate', output: {} }));
      expect(received).toHaveLength(1);
    });

    it('subscribe 不存在 runId → no-op unsubscribe', () => {
      const off = bus.subscribe('unknown', () => {});
      expect(typeof off).toBe('function');
      off(); // 不应抛
    });
  });

  describe('终止事件 + closed', () => {
    it('swarm_completed 触发 closed, 后续 emit 静默忽略', () => {
      bus.init('r1');
      const received: SwarmEvent[] = [];
      bus.subscribe('r1', (e) => received.push(e));
      bus.emit('r1', evt('swarm_completed', { runId: 'r1', verdict: {}, durationMs: 100 }));
      expect(bus.isClosed('r1')).toBe(true);
      bus.emit('r1', evt('agent_chunk', { agentId: 'bull_advocate', text: 'late', done: false }));
      expect(received).toHaveLength(1);
      expect(bus.buffered('r1')).toHaveLength(1);
    });

    it('swarm_error 同样关闭', () => {
      bus.init('r1');
      bus.emit('r1', evt('swarm_error', { message: 'x' }));
      expect(bus.isClosed('r1')).toBe(true);
    });

    it('swarm_aborted 同样关闭', () => {
      bus.init('r1');
      bus.emit('r1', evt('swarm_aborted', { reason: 'user_cancel' }));
      expect(bus.isClosed('r1')).toBe(true);
    });

    it('agent_completed 不算终止 (整 swarm 还可能没完)', () => {
      bus.init('r1');
      bus.emit('r1', evt('agent_completed', { agentId: 'bull_advocate', output: {} }));
      expect(bus.isClosed('r1')).toBe(false);
    });
  });

  describe('dispose', () => {
    it('dispose 后 buffered 返回空, 后续 emit 也 no-op', () => {
      bus.init('r1');
      bus.emit('r1', evt('swarm_started', { runId: 'r1', presetId: 'p', agentIds: [] }));
      bus.dispose('r1');
      expect(bus.buffered('r1')).toEqual([]);
      bus.emit('r1', evt('agent_started', { agentId: 'bull_advocate', index: 0 }));
      expect(bus.buffered('r1')).toEqual([]);
    });

    it('dispose 移除全部 listener', () => {
      bus.init('r1');
      let count = 0;
      bus.subscribe('r1', () => count++);
      bus.dispose('r1');
      bus.init('r1'); // 重建
      bus.emit('r1', evt('agent_started', { agentId: 'bull_advocate', index: 0 }));
      expect(count).toBe(0);
    });
  });

  describe('size', () => {
    it('反映 active channel 数', () => {
      expect(bus.size()).toBe(0);
      bus.init('r1');
      bus.init('r2');
      expect(bus.size()).toBe(2);
      bus.dispose('r1');
      expect(bus.size()).toBe(1);
    });
  });
});
