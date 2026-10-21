import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchRealtime,
  fetchRealtimeBatch,
  fetchRealtimeTencent,
  fetchRealtimeBatchTencent,
  fetchRealtimeFromSource,
  fetchKLine,
  UpstreamUnavailableError,
  __resetRealtimeBatchCacheForTest,
} from '../market.js';

const ORIG_FETCH = globalThis.fetch;

function makeRealtimeJson() {
  return {
    data: {
      f43: 100, f44: 102, f45: 98, f46: 99, f47: 1000,
      f58: 'TEST', f60: 99, f168: 120, f170: 150,
    },
  };
}

function makeKlineJson() {
  return { data: { klines: ['2026-05-11,10,10.5,10.6,9.8,1000'] } };
}

function makeOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function makeTencentResponse(code = '600519'): Response {
  const fields = Array.from({ length: 39 }, () => '');
  fields[1] = '贵州茅台';
  fields[3] = '1688.50';
  fields[4] = '1667.66';
  fields[5] = '1668.00';
  fields[6] = '1234';
  fields[32] = '1.25';
  fields[33] = '1700.00';
  fields[34] = '1650.00';
  fields[38] = '2.10';
  return new Response(`v_sh${code}="${fields.join('~')}";`, { status: 200 });
}

/** Emulate undici's connect-timeout shape so isRetryableNetworkError returns true. */
function makeConnectTimeoutError(): Error {
  const cause = Object.assign(new Error('Connect Timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' });
  const err = new Error('fetch failed');
  (err as { cause?: unknown }).cause = cause;
  return err;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  globalThis.fetch = ORIG_FETCH;
  __resetRealtimeBatchCacheForTest();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('fetchRealtimeBatch', () => {
  it('loads requested stocks from one full-market page using float fields', async () => {
    const spy = vi.fn(async () => makeOk({
      data: {
        total: 2,
        diff: [
          { f2: 1688.5, f3: 1.25, f5: 1234, f8: 2.1, f12: '600519', f14: '贵州茅台', f15: 1700, f16: 1650, f17: 1668, f18: 1667.66 },
          { f2: 12.3, f3: -0.5, f5: 4321, f8: 1.2, f12: '000001', f14: '平安银行', f15: 12.5, f16: 12.1, f17: 12.4, f18: 12.36 },
        ],
      },
    }));
    globalThis.fetch = spy as unknown as typeof fetch;

    const result = await fetchRealtimeBatch(['600519']);

    expect(result.size).toBe(1);
    expect(result.get('600519')).toMatchObject({ price: 1688.5, change: 1.25, preClose: 1667.66 });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('fetchRealtime retry behavior', () => {
  it('retries native AbortSignal.timeout TimeoutError failures', async () => {
    const reason = new DOMException('The operation timed out', 'TimeoutError');
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort(reason));
    const spy = vi.fn()
      .mockRejectedValueOnce(reason)
      .mockResolvedValueOnce(makeOk(makeRealtimeJson()));
    globalThis.fetch = spy as typeof fetch;

    const promise = fetchRealtime('600519', { retries: 1 });
    await vi.advanceTimersByTimeAsync(500);
    expect((await promise).code).toBe('600519');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('normalizes exhausted native timeouts to an upstream error', async () => {
    const reason = new DOMException('The operation timed out', 'TimeoutError');
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort(reason));
    globalThis.fetch = vi.fn().mockRejectedValue(reason) as typeof fetch;
    await expect(fetchRealtime('600519')).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('returns on first success without retry', async () => {
    const spy = vi.fn(async () => makeOk(makeRealtimeJson()));
    globalThis.fetch = spy as unknown as typeof fetch;

    const data = await fetchRealtime('600519', { retries: 2 });
    expect(data.code).toBe('600519');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('retries on UND_ERR_CONNECT_TIMEOUT and succeeds on 2nd attempt', async () => {
    let calls = 0;
    const spy = vi.fn(async () => {
      calls++;
      if (calls === 1) throw makeConnectTimeoutError();
      return makeOk(makeRealtimeJson());
    });
    globalThis.fetch = spy as unknown as typeof fetch;

    const promise = fetchRealtime('600519', { retries: 2 });
    // first attempt fails synchronously; backoff is 500ms
    await vi.advanceTimersByTimeAsync(500);
    const data = await promise;
    expect(data.code).toBe('600519');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('throws UpstreamUnavailableError after exhausting retries', async () => {
    const spy = vi.fn(async () => {
      throw makeConnectTimeoutError();
    });
    globalThis.fetch = spy as unknown as typeof fetch;

    const promise = fetchRealtime('600519', { retries: 2 });
    // attach the rejection expectation first to avoid unhandled rejection
    // while timers advance through the backoff windows
    const assertion = expect(promise).rejects.toBeInstanceOf(UpstreamUnavailableError);
    // backoff steps: 500ms then 1500ms
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(spy).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('does NOT retry on STOCK_NOT_FOUND (200 body, no f43)', async () => {
    const spy = vi.fn(async () => makeOk({ data: null }));
    globalThis.fetch = spy as unknown as typeof fetch;

    await expect(fetchRealtime('999999', { retries: 2 })).rejects.toThrow('STOCK_NOT_FOUND');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 4xx', async () => {
    const spy = vi.fn(async () => new Response('', { status: 404 }));
    globalThis.fetch = spy as unknown as typeof fetch;

    await expect(fetchRealtime('600519', { retries: 2 })).rejects.toThrow(/404/);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('retries on 500', async () => {
    let calls = 0;
    const spy = vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response('', { status: 500 });
      return makeOk(makeRealtimeJson());
    });
    globalThis.fetch = spy as unknown as typeof fetch;

    const promise = fetchRealtime('600519', { retries: 1 });
    await vi.advanceTimersByTimeAsync(500);
    const data = await promise;
    expect(data.code).toBe('600519');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('aborts immediately when external signal is cancelled', async () => {
    const controller = new AbortController();
    const spy = vi.fn(async () => {
      throw makeConnectTimeoutError();
    });
    globalThis.fetch = spy as unknown as typeof fetch;

    const promise = fetchRealtime('600519', { retries: 5, signal: controller.signal });
    const assertion = expect(promise).rejects.toThrow();
    controller.abort();
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
    // first attempt may have started before abort, but no retries after
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('Tencent realtime source', () => {
  it('fetches stocks missing from a fresh cache instead of returning an empty result', async () => {
    const spy = vi.fn()
      .mockResolvedValueOnce(makeTencentResponse())
      .mockResolvedValueOnce(makeTencentResponse('600000'));
    globalThis.fetch = spy as typeof fetch;

    await fetchRealtimeBatchTencent(['600519']);
    const result = await fetchRealtimeBatchTencent(['600000']);
    expect(result.get('600000')?.price).toBe(1688.5);
    expect(spy).toHaveBeenCalledTimes(2);
    await fetchRealtimeBatchTencent(['600000']);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('auto switches immediately instead of retrying the failed primary and then skips its open circuit', async () => {
    const spy = vi.fn(async (input) => {
      if (String(input).includes('eastmoney')) throw makeConnectTimeoutError();
      return makeTencentResponse();
    });
    globalThis.fetch = spy as typeof fetch;
    for (let n = 0; n < 4; n++) {
      expect((await fetchRealtimeFromSource('600519', 'auto', { retries: 2 })).source).toBe('tencent');
    }
    expect(spy.mock.calls.filter(([url]) => String(url).includes('eastmoney'))).toHaveLength(3);
    expect(spy.mock.calls.filter(([url]) => String(url).includes('gtimg'))).toHaveLength(4);
  });

  it('switches on HTTP 429 without retrying or consuming a throttle response as quote data', async () => {
    globalThis.fetch = vi.fn(async (input) => String(input).includes('eastmoney')
      ? new Response('rate limited', { status: 429 }) : makeTencentResponse()) as typeof fetch;
    expect((await fetchRealtimeFromSource('600519', 'auto', { retries: 2 })).source).toBe('tencent');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('caller cancellation stops automatic failover', async () => {
    const controller = new AbortController();
    globalThis.fetch = vi.fn(async () => { controller.abort(); throw controller.signal.reason; }) as typeof fetch;
    await expect(fetchRealtimeFromSource('600519', 'auto', { signal: controller.signal })).rejects.toThrow();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('parses a Tencent quote and reports the actual provider', async () => {
    globalThis.fetch = vi.fn(async () => makeTencentResponse()) as unknown as typeof fetch;

    const data = await fetchRealtimeTencent('600519');

    expect(data).toMatchObject({
      code: '600519', price: 1688.5, change: 1.25,
      preClose: 1667.66, source: 'tencent',
    });
  });

  it('auto mode falls back to Tencent when EastMoney has no quote', async () => {
    globalThis.fetch = vi.fn(async (input) =>
      String(input).includes('eastmoney') ? makeOk({ data: null }) : makeTencentResponse(),
    ) as unknown as typeof fetch;

    const data = await fetchRealtimeFromSource('600519', 'auto');

    expect(data.source).toBe('tencent');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('fetchKLine retry — also supports legacy signal-only signature', () => {
  it('accepts an AbortSignal as third arg (backwards compat with engine.ts)', async () => {
    const spy = vi.fn(async () => makeOk(makeKlineJson()));
    globalThis.fetch = spy as unknown as typeof fetch;

    const controller = new AbortController();
    const klines = await fetchKLine('600519', 60, { signal: controller.signal, skipTushare: true, skipBaoStock: true });
    expect(klines).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('accepts FetchOpts with retries', async () => {
    let calls = 0;
    const spy = vi.fn(async () => {
      calls++;
      if (calls === 1) throw makeConnectTimeoutError();
      return makeOk(makeKlineJson());
    });
    globalThis.fetch = spy as unknown as typeof fetch;

    const promise = fetchKLine('600519', 60, {
      retries: 1,
      timeoutMs: 1000,
      skipTushare: true,
      skipBaoStock: true,
    });
    await vi.advanceTimersByTimeAsync(500);
    const klines = await promise;
    expect(klines).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('UpstreamUnavailableError', () => {
  it('preserves cause chain', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw makeConnectTimeoutError();
    }) as unknown as typeof fetch;

    const promise = fetchRealtime('600519', { retries: 1 });
    const caught = promise.catch((err) => err);
    await vi.advanceTimersByTimeAsync(2000);
    const err = await caught;
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    expect((err as UpstreamUnavailableError).message).toContain('push2.eastmoney.com');
    expect((err as UpstreamUnavailableError).cause).toBeDefined();
  });
});
