import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { JsonStore } from '../json-store.js';

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jsonstore-'));
  filePath = path.join(tmpDir, 'data.json');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('JsonStore.read', () => {
  it('returns default when file does not exist (ENOENT)', async () => {
    const store = new JsonStore<{ items: number[] }>(filePath, { items: [] });
    const data = await store.read();
    expect(data).toEqual({ items: [] });
  });

  it('returns a deep copy of the default so callers cannot mutate it', async () => {
    const defaultVal = { items: [1, 2] };
    const store = new JsonStore<{ items: number[] }>(filePath, defaultVal);
    const data = await store.read();
    data.items.push(99);
    const data2 = await store.read();
    expect(data2.items).toEqual([1, 2]);
  });

  it('throws SyntaxError on malformed JSON (caller decides recovery)', async () => {
    await fs.writeFile(filePath, '{ not json', 'utf8');
    const store = new JsonStore<{ items: number[] }>(filePath, { items: [] });
    await expect(store.read()).rejects.toThrow(SyntaxError);
  });

  it('reads valid JSON', async () => {
    await fs.writeFile(filePath, JSON.stringify({ items: [1, 2, 3] }), 'utf8');
    const store = new JsonStore<{ items: number[] }>(filePath, { items: [] });
    expect(await store.read()).toEqual({ items: [1, 2, 3] });
  });
});

describe('JsonStore.update', () => {
  it('persists mutated value atomically', async () => {
    const store = new JsonStore<{ items: number[] }>(filePath, { items: [] });
    await store.update((data) => ({ items: [...data.items, 1] }));
    await store.update((data) => ({ items: [...data.items, 2] }));
    expect(await store.read()).toEqual({ items: [1, 2] });
  });

  it('serializes 10 concurrent mutators (no lost updates)', async () => {
    const store = new JsonStore<{ items: number[] }>(filePath, { items: [] });
    const promises = Array.from({ length: 10 }, (_, i) =>
      store.update((data) => ({ items: [...data.items, i] })),
    );
    await Promise.all(promises);
    const final = await store.read();
    expect(final.items).toHaveLength(10);
    expect([...final.items].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('releases the lock after mutator throws so subsequent updates succeed', async () => {
    const store = new JsonStore<{ items: number[] }>(filePath, { items: [] });
    await store.update(() => ({ items: [1] }));
    await expect(
      store.update(() => {
        throw new Error('mutator boom');
      }),
    ).rejects.toThrow('mutator boom');
    const next = await store.update((data) => ({ items: [...data.items, 2] }));
    expect(next).toEqual({ items: [1, 2] });
  });

  it('does not leave .tmp file behind on success', async () => {
    const store = new JsonStore<{ items: number[] }>(filePath, { items: [] });
    await store.update(() => ({ items: [42] }));
    const files = await fs.readdir(tmpDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tmpFiles).toEqual([]);
  });

  it('creates parent directory if it does not exist', async () => {
    const nested = path.join(tmpDir, 'deep', 'nested', 'data.json');
    const store = new JsonStore<{ items: number[] }>(nested, { items: [] });
    await store.update(() => ({ items: [1] }));
    expect(await store.read()).toEqual({ items: [1] });
  });

  it('supports async mutator', async () => {
    const store = new JsonStore<{ items: number[] }>(filePath, { items: [] });
    await store.update(async (data) => {
      await new Promise((r) => setTimeout(r, 1));
      return { items: [...data.items, 7] };
    });
    expect(await store.read()).toEqual({ items: [7] });
  });
});
