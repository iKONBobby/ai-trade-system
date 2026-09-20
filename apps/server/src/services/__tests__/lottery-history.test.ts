import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  __setLotteryCacheDirForTest,
  getLotteryHistory,
  parseCwlHistory,
  parseJuheHistory,
  parseSportteryHistory,
} from '../lottery-history.js';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lottery-history-'));
  __setLotteryCacheDirForTest(directory);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  __setLotteryCacheDirForTest(null);
  await rm(directory, { recursive: true, force: true });
});

describe('lottery history normalization', () => {
  it('parses official CWL rows and drops malformed draws', () => {
    expect(parseCwlHistory({ result: [
      { code: '2026100', date: '2026-09-15 (二)', red: '01,02,03,04,05,06', blue: '07' },
      { code: 'bad', date: '2026-09-14', red: '01,02', blue: '03' },
    ] })).toEqual([{ issue: '2026100', drawDate: '2026-09-15', front: [1, 2, 3, 4, 5, 6], back: [7] }]);
  });

  it('parses Sporttery and Juhe rows into one shared shape', () => {
    expect(parseSportteryHistory({ value: { list: [{ lotteryDrawNum: '26100', lotteryDrawTime: '2026-09-15', lotteryDrawResult: '01 02 03 04 05 06 07' }] } })).toHaveLength(1);
    expect(parseJuheHistory('dlt', { result: { lotteryResList: [{ lottery_no: '26100', lottery_date: '2026-09-15', lottery_res: '01,02,03,04,05,06,07' }] } })).toHaveLength(1);
  });

  it('writes successful official data and reuses the fresh disk cache', async () => {
    const payload = { result: Array.from({ length: 10 }, (_, index) => ({
      code: `2026${String(100 - index).padStart(3, '0')}`,
      date: `2026-09-${String(15 - index).padStart(2, '0')}`,
      red: '01,02,03,04,05,06', blue: String((index % 16) + 1).padStart(2, '0'),
    })) };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const fresh = await getLotteryHistory('ssq', 10);
    const cached = await getLotteryHistory('ssq', 10);
    expect(fresh.source).toBe('cwl');
    expect(fresh.cached).toBe(false);
    expect(cached.cached).toBe(true);
    expect(cached.draws).toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
