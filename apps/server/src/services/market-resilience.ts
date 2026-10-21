/** Process-wide upstream protection; no URLs, tokens or response bodies in logs. */
export function marketLog(event: string, fields: Record<string, unknown>): void {
  console.info('[MARKET]', JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

export function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Cancelled', 'AbortError');
}

export function marketDelay(ms: number, signal?: AbortSignal): Promise<void> {
  checkCancelled(signal);
  return new Promise((resolve, reject) => {
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export class CircuitOpenError extends Error {
  constructor(public readonly host: string) { super(`Circuit open: ${host}`); }
}

interface HostState { failures: number; until: number; probe: boolean; active: number; nextStart: number }
const hosts = new Map<string, HostState>();
export function resetMarketResilience(): void { hosts.clear(); }

/** Limit to four active requests per host; scan callers also share five starts/second. */
export async function protectedRequest<T>(host: string, signal: AbortSignal | undefined, run: () => Promise<T>, rateLimit = false): Promise<T> {
  let state = hosts.get(host);
  if (!state) { state = { failures: 0, until: 0, probe: false, active: 0, nextStart: 0 }; hosts.set(host, state); }
  const queuedAt = Date.now();
  while (true) {
    checkCancelled(signal);
    if (state.until > Date.now() || state.probe) throw new CircuitOpenError(host);
    if (state.active < 4 && (!rateLimit || state.nextStart <= Date.now())) break;
    await marketDelay(state.active >= 4 ? 50 : Math.max(1, Math.min(50, state.nextStart - Date.now())), signal);
  }
  const probe = state.until > 0;
  if (probe) state.probe = true;
  state.active++;
  if (rateLimit) state.nextStart = Date.now() + 200;
  const started = Date.now();
  try {
    const value = await run();
    // In-flight successes from before an open circuit cannot close it.
    if (probe || state.until === 0) { state.failures = 0; state.until = 0; }
    if (probe) marketLog('circuit_closed', { host });
    marketLog('request_ok', { host, elapsedMs: Date.now() - started, queuedMs: started - queuedAt });
    return value;
  } catch (error) {
    if (!signal?.aborted) {
      state.failures++;
      if (state.failures >= 3 || probe) {
        state.until = Date.now() + 30_000;
        marketLog('circuit_open', { host, cooldownMs: 30_000, failures: state.failures });
      }
      marketLog('request_failed', { host, elapsedMs: Date.now() - started, error: error instanceof Error ? error.name : 'UnknownError', status: (error as { status?: number })?.status, code: (error as { cause?: { code?: string } })?.cause?.code });
    }
    throw error;
  } finally {
    state.active--;
    if (probe) state.probe = false;
  }
}
