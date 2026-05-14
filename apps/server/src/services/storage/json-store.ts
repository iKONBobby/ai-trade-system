import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Atomic JSON file storage with business-level mutex.
 *
 *           ┌──────── update(fn) ────────┐
 *           │                            │
 *           ▼                            │
 *   ┌──────────────┐                    │
 *   │  read file   │                    │
 *   └──────┬───────┘                    │
 *          ▼                            │
 *   ┌──────────────┐                    │ all serialized
 *   │  mutator(x)  │                    │ via promise chain
 *   └──────┬───────┘                    │
 *          ▼                            │
 *   ┌──────────────┐                    │
 *   │ write temp   │                    │
 *   │ rename       │                    │
 *   └──────┬───────┘                    │
 *          ▼                            │
 *        next ─────────────────────────┘
 *
 * Direct read() is permitted for stateless reads. Any read-modify-write
 * MUST go through update(fn) to avoid lost-update races.
 */
export class JsonStore<T> {
  private lock: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly defaultValue: T,
  ) {}

  async read(): Promise<T> {
    try {
      const buf = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(buf) as T;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return structuredClone(this.defaultValue);
      }
      throw err;
    }
  }

  async update(mutator: (data: T) => T | Promise<T>): Promise<T> {
    const chained = this.lock.then(async () => {
      const current = await this.read();
      const next = await mutator(current);
      await this.atomicWrite(next);
      return next;
    });
    this.lock = chained.catch(() => undefined);
    return chained;
  }

  private async atomicWrite(data: T): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmp, this.filePath);
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
