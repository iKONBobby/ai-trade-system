// 简单 Semaphore for concurrency limit (C5 batch).
//
// 用法:
//   const sem = new Semaphore(2);
//   await sem.acquire();
//   try { /* critical */ } finally { sem.release(); }

export class Semaphore {
  private permits: number;
  private readonly waiters: Array<() => void> = [];

  constructor(initial: number) {
    if (initial < 0) throw new Error('semaphore initial < 0');
    this.permits = initial;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }

  /** 测试 / 监控用. */
  stats(): { permits: number; waiting: number } {
    return { permits: this.permits, waiting: this.waiters.length };
  }
}
