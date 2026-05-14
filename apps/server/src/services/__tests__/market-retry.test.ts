import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchRealtime, fetchKLine, UpstreamUnavailableError } from '../market.js';

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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('fetchRealtime retry behavior', () => {
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

describe('fetchKLine retry — also supports legacy signal-only signature', () => {
  it('accepts an AbortSignal as third arg (backwards compat with engine.ts)', async () => {
    const spy = vi.fn(async () => makeOk(makeKlineJson()));
    globalThis.fetch = spy as unknown as typeof fetch;

    const controller = new AbortController();
    const klines = await fetchKLine('600519', 60, controller.signal);
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

    const promise = fetchKLine('600519', 60, { retries: 1, timeoutMs: 1000 });
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
