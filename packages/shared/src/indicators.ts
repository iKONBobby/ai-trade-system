/**
 * Simple moving average. Returns same-length array; the first (period-1)
 * entries are null because there is not enough data yet.
 *
 *   in  = [1, 2, 3, 4, 5, 6, 7]
 *   out = [null, null, null, 2.5, 3.5, 4.5, 5.5]  (period=4)
 *
 * O(N) rolling-window algorithm. Pure math — no UI shape coupling.
 */
export function calcMA(klines: { close: number }[], period: number): (number | null)[] {
  if (period <= 0) return klines.map(() => null);
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < klines.length; i++) {
    sum += klines[i].close;
    if (i >= period) sum -= klines[i - period].close;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}
