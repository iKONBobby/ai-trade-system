/**
 * Fetch A-share stock list from EastMoney and save as JSON.
 * Run: npx tsx scripts/update-stock-list.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const URL = 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5000&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14';

async function main() {
  const resp = await fetch(URL);
  const json = await resp.json() as {
    data?: { diff?: Array<{ f12: string; f14: string }> };
  };

  const items = (json.data?.diff ?? [])
    .filter((item) => /^\d{6}$/.test(item.f12))
    .map((item) => ({
      code: item.f12,
      name: item.f14,
      market: item.f12.startsWith('6') ? 'SH' : 'SZ',
    }));

  const outDir = path.resolve(__dirname, '../apps/server/src/data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'stocks.json'), JSON.stringify(items, null, 2));
  console.log(`Written ${items.length} stocks to stocks.json`);
}

main().catch(console.error);
