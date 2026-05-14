import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ScreenerResult } from '@trade/shared';
import { FavoritesService, FavoriteValidationError } from '../favorites-service.js';

let tmpDir: string;
let service: FavoritesService;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'favorites-'));
  service = new FavoritesService(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeStock(code: string): ScreenerResult {
  return {
    code,
    name: `stock-${code}`,
    market: 'SH',
    price: 10,
    change: 1,
    open: 10,
    high: 10.5,
    low: 9.8,
    preClose: 9.9,
    volume: 100000,
    turnover: 1.2,
    score: 7,
    triggeredFactors: [],
    klineSnapshot: [9, 9.5, 10],
  };
}

describe('FavoritesService.add', () => {
  it('adds with default tags=[] and note=""', async () => {
    await service.add({ stock: makeStock('600519') });
    const list = await service.list();
    expect(list).toHaveLength(1);
    expect(list[0].tags).toEqual([]);
    expect(list[0].note).toBe('');
    expect(list[0].addedAt).toBeTruthy();
  });

  it('skips duplicate code silently', async () => {
    await service.add({ stock: makeStock('600519'), tags: ['长线'] });
    await service.add({ stock: makeStock('600519'), tags: ['短线'] });
    const list = await service.list();
    expect(list).toHaveLength(1);
    expect(list[0].tags).toEqual(['长线']);
  });

  it('rejects > 3 tags', async () => {
    await expect(
      service.add({ stock: makeStock('A'), tags: ['a', 'b', 'c', 'd'] }),
    ).rejects.toThrow(FavoriteValidationError);
  });

  it('rejects note > 200 chars', async () => {
    await expect(
      service.add({ stock: makeStock('A'), note: 'x'.repeat(201) }),
    ).rejects.toThrow(FavoriteValidationError);
  });

  it('rejects empty-string tags', async () => {
    await expect(service.add({ stock: makeStock('A'), tags: [''] })).rejects.toThrow(
      FavoriteValidationError,
    );
  });
});

describe('FavoritesService.update', () => {
  it('patches tags and note', async () => {
    await service.add({ stock: makeStock('600519') });
    const updated = await service.update('600519', { tags: ['长线'], note: '护城河深' });
    expect(updated?.tags).toEqual(['长线']);
    expect(updated?.note).toBe('护城河深');
  });

  it('returns null for unknown code', async () => {
    expect(await service.update('missing', { note: 'x' })).toBeNull();
  });

  it('leaves unspecified fields unchanged', async () => {
    await service.add({ stock: makeStock('A'), tags: ['x'], note: 'orig' });
    await service.update('A', { note: 'new' });
    const list = await service.list();
    expect(list[0].tags).toEqual(['x']);
    expect(list[0].note).toBe('new');
  });

  it('rejects invalid patch values', async () => {
    await service.add({ stock: makeStock('A') });
    await expect(service.update('A', { tags: ['a', 'b', 'c', 'd'] })).rejects.toThrow(
      FavoriteValidationError,
    );
  });
});

describe('FavoritesService.remove', () => {
  it('removes by code and returns true', async () => {
    await service.add({ stock: makeStock('A') });
    expect(await service.remove('A')).toBe(true);
    expect(await service.list()).toHaveLength(0);
  });

  it('returns false when code not present', async () => {
    expect(await service.remove('missing')).toBe(false);
  });
});

describe('FavoritesService.bulkImport', () => {
  it('imports new stocks, skips existing', async () => {
    await service.add({ stock: makeStock('A') });
    const result = await service.bulkImport([makeStock('A'), makeStock('B'), makeStock('C')]);
    expect(result).toEqual({ added: 2, skipped: 1 });
    const codes = (await service.list()).map((f) => f.stock.code);
    expect(codes.sort()).toEqual(['A', 'B', 'C']);
  });

  it('is idempotent on second run', async () => {
    const stocks = [makeStock('A'), makeStock('B')];
    await service.bulkImport(stocks);
    const second = await service.bulkImport(stocks);
    expect(second).toEqual({ added: 0, skipped: 2 });
  });

  it('handles empty input', async () => {
    expect(await service.bulkImport([])).toEqual({ added: 0, skipped: 0 });
  });
});

describe('FavoritesService concurrent update (D1 mutex)', () => {
  it('does not lose updates when 10 different stocks added concurrently', async () => {
    const ops = Array.from({ length: 10 }, (_, i) =>
      service.add({ stock: makeStock(`stock_${i}`) }),
    );
    await Promise.all(ops);
    const list = await service.list();
    expect(list).toHaveLength(10);
  });

  it('does not lose updates when same code is patched concurrently with different fields', async () => {
    await service.add({ stock: makeStock('X') });
    await Promise.all([
      service.update('X', { tags: ['a'] }),
      service.update('X', { note: 'hello' }),
    ]);
    const list = await service.list();
    // last update wins for the OVERLAPPING field, but non-overlapping fields must both survive
    expect(list[0].tags).toEqual(['a']);
    expect(list[0].note).toBe('hello');
  });
});

describe('FavoritesService.replaceAll', () => {
  it('overwrites the list', async () => {
    await service.add({ stock: makeStock('OLD') });
    await service.replaceAll([
      {
        stock: makeStock('NEW'),
        tags: ['x'],
        note: 'fresh',
        addedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const list = await service.list();
    expect(list).toHaveLength(1);
    expect(list[0].stock.code).toBe('NEW');
  });

  it('validates each entry before replacing', async () => {
    await expect(
      service.replaceAll([
        {
          stock: makeStock('A'),
          tags: ['a', 'b', 'c', 'd'],
          note: '',
          addedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    ).rejects.toThrow(FavoriteValidationError);
  });
});
