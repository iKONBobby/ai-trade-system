import { describe, it, expect } from 'vitest';
import { Semaphore } from '../semaphore.js';

describe('Semaphore', () => {
  it('initial>0 时立即 acquire', async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    expect(sem.stats()).toEqual({ permits: 1, waiting: 0 });
    await sem.acquire();
    expect(sem.stats()).toEqual({ permits: 0, waiting: 0 });
  });

  it('permits=0 时 acquire 阻塞, release 唤醒', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    let resolved = false;
    const p = sem.acquire().then(() => {
      resolved = true;
    });
    // 还没 release, 应该 pending
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);
    sem.release();
    await p;
    expect(resolved).toBe(true);
  });

  it('多个 waiter 按 FIFO 唤醒', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    const order: number[] = [];
    const tasks = [1, 2, 3].map((i) =>
      sem.acquire().then(() => order.push(i)),
    );
    sem.release();
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual([1]);
    sem.release();
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual([1, 2]);
    sem.release();
    await Promise.all(tasks);
    expect(order).toEqual([1, 2, 3]);
  });

  it('initial=0 拒绝立即 acquire', async () => {
    const sem = new Semaphore(0);
    let acquired = false;
    sem.acquire().then(() => {
      acquired = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(acquired).toBe(false);
  });

  it('initial<0 抛错', () => {
    expect(() => new Semaphore(-1)).toThrow();
  });

  it('并发限制 2 — 6 个任务最多 2 并行', async () => {
    const sem = new Semaphore(2);
    let inFlight = 0;
    let maxInFlight = 0;
    async function task() {
      await sem.acquire();
      try {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
      } finally {
        inFlight--;
        sem.release();
      }
    }
    await Promise.all(Array.from({ length: 6 }, () => task()));
    expect(maxInFlight).toBe(2);
  });
});
