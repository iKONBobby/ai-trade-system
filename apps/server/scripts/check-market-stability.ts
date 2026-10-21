/** Read-only, bounded real-network smoke test. Run with tsx from apps/server. */
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { fetchRealtimeFromSource, fetchRealtimeBatchFromSource, fetchKLine } from '../src/services/market.js';
import { hasHithinkApiKey } from '../src/services/hithink-market.js';
const codes = ['600519', '000001', '300750'];
const samples: Record<string, unknown>[] = [];
async function sample(label: string, run: () => Promise<unknown>) {
  const start = Date.now();
  try {
    const data = await run();
    samples.push({ label, ok: true, ms: Date.now() - start, data });
  } catch (error) {
    samples.push({ label, ok: false, ms: Date.now() - start, error: error instanceof Error ? error.message : 'unknown' });
  }
}
async function main() {
for (let round = 0; round < 10; round++) {
  for (const source of ['eastmoney', 'tencent', 'auto'] as const) {
    await sample(`${source}:${round}`, async () => {
      const quote = await fetchRealtimeFromSource(codes[round % codes.length], source, { retries: 0, timeoutMs: 2500, rateLimit: true });
      if (!Number.isFinite(quote.price) || quote.price <= 0) throw new Error('Invalid price');
      return { code: quote.code, source: quote.source, price: quote.price };
    });
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
const seed = JSON.parse(await readFile('src/data/stocks.json', 'utf8'));
const batchCodes = Array.isArray(seed) ? seed.slice(0, 100).map((stock: { code: string }) => stock.code) : codes;
await sample('auto:batch', async () => {
  const quotes = await fetchRealtimeBatchFromSource(batchCodes, 'auto', { retries: 0, timeoutMs: 2500, rateLimit: true });
  return { requested: batchCodes.length, received: quotes.size, sources: [...new Set([...quotes.values()].map(q => q.source))] };
});
await sample('eastmoney:kline', async () => {
  const rows = await fetchKLine('600519', 60, { skipTushare: true, skipBaoStock: true, skipHithink: true, timeoutMs: 2500, rateLimit: true });
  return { rows: rows.length, latestDate: rows.at(-1)?.date };
});
await sample('configured:kline', async () => {
  const rows = await fetchKLine('600519', 60, { timeoutMs: 2500, signal: AbortSignal.timeout(20_000) });
  return { rows: rows.length, latestDate: rows.at(-1)?.date };
});
const result = { at: new Date().toISOString(), hithinkConfigured: hasHithinkApiKey(), samples };
console.log('MARKET_SMOKE_RESULT', JSON.stringify(result, null, 2));
if (process.env.MARKET_CHECK_OUTPUT) await writeFile(process.env.MARKET_CHECK_OUTPUT, JSON.stringify(result, null, 2) + '\n');

}
main().catch(error => { console.error(error); process.exitCode = 1; });
