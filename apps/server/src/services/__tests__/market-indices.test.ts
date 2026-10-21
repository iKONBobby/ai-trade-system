import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchIndices, __resetRealtimeBatchCacheForTest } from '../market.js';

const ORIG_FETCH = globalThis.fetch;

function makeOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function indexJson(point: number, changePct: number, name = 'IDX') {
  // eastmoney f43 = 点位 ×100, f170 = 涨跌幅 ×100
  return { data: { f43: point * 100, f58: name, f170: changePct * 100 } };
}

afterEach(() => {
  __resetRealtimeBatchCacheForTest();
  globalThis.fetch = ORIG_FETCH;
  vi.restoreAllMocks();
});

describe('fetchIndices', () => {
  it('3 个指数全部成功 → label/value/changePct 正确', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeOk(indexJson(3245.67, 0.83))) // 上证
      .mockResolvedValueOnce(makeOk(indexJson(9856.12, 1.15))) // 深证
      .mockResolvedValueOnce(makeOk(indexJson(1927.84, -0.21))); // 创业板
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchIndices();
    expect(result).toEqual([
      { label: '上证指数', value: 3245.67, changePct: 0.83 },
      { label: '深证成指', value: 9856.12, changePct: 1.15 },
      { label: '创业板指', value: 1927.84, changePct: -0.21 },
    ]);
  });

  it('请求 3 个固定 secid (上证 1.000001 / 深证 0.399001 / 创业板 0.399006)', async () => {
    // mockImplementation: 每次返回 fresh Response (body 只能读一次)
    const fetchMock = vi.fn().mockImplementation(async () => makeOk(indexJson(1, 1)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await fetchIndices();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain('secid=1.000001');
    expect(urls[1]).toContain('secid=0.399001');
    expect(urls[2]).toContain('secid=0.399006');
  });

  it('单个指数失败 → 该项 fallback 到 0/0, 其余正常', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeOk(indexJson(3245.67, 0.83)))
      .mockResolvedValueOnce(new Response('err', { status: 500 })) // 深证 500
      .mockResolvedValueOnce(makeOk(indexJson(1927.84, -0.21)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchIndices();
    expect(result[0]).toEqual({ label: '上证指数', value: 3245.67, changePct: 0.83 });
    expect(result[1]).toEqual({ label: '深证成指', value: 0, changePct: 0 });
    expect(result[2]).toEqual({ label: '创业板指', value: 1927.84, changePct: -0.21 });
  });

  it('data 缺失 (f43 null) → 该项 fallback', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeOk({ data: { f43: null } }))
      .mockResolvedValueOnce(makeOk(indexJson(9856.12, 1.15)))
      .mockResolvedValueOnce(makeOk(indexJson(1927.84, -0.21)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchIndices();
    expect(result[0]).toEqual({ label: '上证指数', value: 0, changePct: 0 });
    expect(result[1].value).toBe(9856.12);
  });

  it('全部失败 → 返回 3 个 fallback (不 throw)', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response('x', { status: 503 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await fetchIndices();
    expect(result).toEqual([
      { label: '上证指数', value: 0, changePct: 0 },
      { label: '深证成指', value: 0, changePct: 0 },
      { label: '创业板指', value: 0, changePct: 0 },
    ]);
  });

  it('负涨跌幅正确 (创业板 -0.21%)', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => makeOk(indexJson(1927.84, -0.21)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await fetchIndices();
    expect(result[2].changePct).toBeCloseTo(-0.21, 2);
  });
});
