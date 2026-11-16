export type HistoryDraw = [issue: string, date: string, front: number[], back: number[]];

export const TREND_CONFIGS = {
  ssq: { name: '双色球', front: 33, back: 16, cuts: [11, 22, 33], backLabel: '蓝球' },
  dlt: { name: '大乐透', front: 35, back: 12, cuts: [12, 24, 35], backLabel: '后区' },
} as const;

// Calculate before filtering or paging so omissions retain their historical context.
export function buildTrendRows(draws: HistoryDraw[], kind: keyof typeof TREND_CONFIGS) {
  const config = TREND_CONFIGS[kind];
  const misses = Array<number>(config.front + config.back).fill(0);
  return draws.map(([issue, date, front, back]) => {
    for (let index = 0; index < misses.length; index++) {
      const hit = index < config.front ? front.includes(index + 1) : back.includes(index - config.front + 1);
      misses[index] = hit ? 0 : misses[index] + 1;
    }
    const zones = config.cuts.map((end, i) => front.filter(n => n > (i ? config.cuts[i - 1] : 0) && n <= end).length);
    const odd = front.filter(n => n % 2).length;
    return { issue, date, front, back, misses: [...misses], sum: front.reduce((a, b) => a + b, 0),
      span: Math.max(...front) - Math.min(...front), zones: zones.join(':'), parity: `${odd}:${front.length - odd}` };
  });
}
