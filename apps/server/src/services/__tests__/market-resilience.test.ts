import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { protectedRequest, resetMarketResilience, CircuitOpenError, marketDelay } from '../market-resilience.js';

beforeEach(() => { vi.useFakeTimers(); resetMarketResilience(); vi.spyOn(console, 'info').mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('opens after three failures and admits only one recovery probe after cooldown', async () => {
  const fail = vi.fn().mockRejectedValue(new Error('offline'));
  for (let n = 0; n < 3; n++) await expect(protectedRequest('test', undefined, fail)).rejects.toThrow('offline');
  await expect(protectedRequest('test', undefined, fail)).rejects.toBeInstanceOf(CircuitOpenError);
  expect(fail).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(30_000);
  let release!: () => void;
  const probe = protectedRequest('test', undefined, () => new Promise<void>((resolve) => { release = resolve; }));
  await expect(protectedRequest('test', undefined, fail)).rejects.toBeInstanceOf(CircuitOpenError);
  release(); await probe;
  await expect(protectedRequest('test', undefined, async () => 'recovered')).resolves.toBe('recovered');
});

it('paces starts across callers and caps active requests at four', async () => {
  const starts: number[] = [];
  let active = 0, peak = 0;
  const jobs = Array.from({ length: 10 }, () => protectedRequest('test', undefined, async () => {
    starts.push(Date.now()); peak = Math.max(peak, ++active);
    await marketDelay(1000); active--;
  }, true));
  await vi.runAllTimersAsync(); await Promise.all(jobs);
  expect(peak).toBe(4);
  for (let n = 1; n < starts.length; n++) expect(starts[n] - starts[n - 1]).toBeGreaterThanOrEqual(200);
});

it('cancels queued calls without dispatch or poisoning circuit health', async () => {
  await protectedRequest('test', undefined, async () => {}, true);
  const controller = new AbortController();
  const call = vi.fn();
  const pending = protectedRequest('test', controller.signal, call, true);
  const rejected = expect(pending).rejects.toThrow();
  controller.abort(); await rejected;
  expect(call).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(200);
  await expect(protectedRequest('test', undefined, async () => 'ok', true)).resolves.toBe('ok');
});
