import type { MarketData, KLine } from '@trade/shared';

/**
 * Convert A-share stock code to EastMoney market code.
 * 6xxxxx -> SH (1.xxxxxx), others -> SZ (0.xxxxxx)
 */
function getMarketCode(code: string): string {
  return code.startsWith('6') ? `1.${code}` : `0.${code}`;
}

interface EastMoneyRealtimeResponse {
  data?: {
    f43: number | null;  // price * 100
    f44: number | null;  // high * 100
    f45: number | null;  // low * 100
    f46: number | null;  // open * 100
    f47: number | null;  // volume
    f58: string | null;  // name
    f60: number | null;  // preClose * 100
    f168: number | null; // turnover * 100
    f170: number | null; // change * 100
  } | null;
}

/**
 * Fetch realtime market data for a given stock code.
 * Throws 'STOCK_NOT_FOUND' if the stock is not found or no data returned.
 */
export async function fetchRealtime(code: string): Promise<MarketData> {
  const marketCode = getMarketCode(code);
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${marketCode}&fields=f43,f44,f45,f46,f47,f48,f50,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170,f171`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`EastMoney API error: ${res.status}`);
  }

  const json: EastMoneyRealtimeResponse = await res.json();

  if (!json.data || json.data.f43 == null || json.data.f43 === 0) {
    throw new Error('STOCK_NOT_FOUND');
  }

  const d = json.data;

  return {
    code,
    name: d.f58 ?? '',
    price: (d.f43 ?? 0) / 100,
    change: (d.f170 ?? 0) / 100,
    volume: d.f47 ?? 0,
    turnover: (d.f168 ?? 0) / 100,
    open: (d.f46 ?? 0) / 100,
    high: (d.f44 ?? 0) / 100,
    low: (d.f45 ?? 0) / 100,
    preClose: (d.f60 ?? 0) / 100,
  };
}

interface EastMoneyKLineResponse {
  data?: {
    klines?: string[];
  } | null;
}

/**
 * Fetch K-line (daily) data for a given stock code.
 * @param code Stock code
 * @param days Number of trading days (default 60)
 */
export async function fetchKLine(code: string, days = 60): Promise<KLine[]> {
  const marketCode = getMarketCode(code);
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${marketCode}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&end=20500101&lmt=${days}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`EastMoney KLine API error: ${res.status}`);
  }

  const json: EastMoneyKLineResponse = await res.json();

  if (!json.data?.klines || json.data.klines.length === 0) {
    throw new Error('STOCK_NOT_FOUND');
  }

  return json.data.klines.map((item: string) => {
    const parts = item.split(',');
    const date = parts[0];
    const open = parseFloat(parts[1]);
    const close = parseFloat(parts[2]);
    const high = parseFloat(parts[3]);
    const low = parseFloat(parts[4]);
    const volume = parseFloat(parts[5]);

    return { date, open, high, low, close, volume };
  });
}
