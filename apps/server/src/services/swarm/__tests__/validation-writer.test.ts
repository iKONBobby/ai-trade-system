import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ValidationWriter } from '../validation-writer.js';
import type { MarketData, PortfolioManagerOutput } from '@trade/shared';

const FAKE_MARKET: MarketData = {
  code: '600519',
  name: '贵州茅台',
  price: 1680,
  change: 1.2,
  volume: 100,
  turnover: 0.5,
  open: 1670,
  high: 1685,
  low: 1668,
  preClose: 1660,
};

const FAKE_VERDICT: PortfolioManagerOutput = {
  verdict: 'buy',
  confidence: 78,
  position_size_pct: 35,
  key_thesis: 'x',
  risks: [],
  strategy_hint: 'grid',
};

describe('ValidationWriter', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'val-writer-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('首次写入创建文件 + 表头', async () => {
    const writer = new ValidationWriter(dir, () => new Date('2026-05-14T10:00:00Z'));
    await writer.record(
      ValidationWriter.fromVerdict({
        market: FAKE_MARKET,
        verdict: FAKE_VERDICT,
        mode: 'swarm',
        date: new Date('2026-05-14T10:00:00Z'),
      }),
    );
    const path = writer.filePath(new Date('2026-05-14T10:00:00Z'));
    const content = await fs.readFile(path, 'utf8');
    expect(content).toContain('Swarm vs Single 决策对照表');
    expect(content).toContain('| date');
    expect(content).toContain('600519');
    expect(content).toContain('swarm');
    expect(content).toContain('buy');
  });

  it('Q1 / Q2 / Q3 / Q4 切换创建独立文件', async () => {
    const writer = new ValidationWriter(dir, () => new Date('2026-05-14'));
    expect(writer.filePath(new Date('2026-01-15'))).toContain('2026Q1');
    expect(writer.filePath(new Date('2026-04-15'))).toContain('2026Q2');
    expect(writer.filePath(new Date('2026-07-15'))).toContain('2026Q3');
    expect(writer.filePath(new Date('2026-10-15'))).toContain('2026Q4');
  });

  it('同一季度 append 多行不重写表头', async () => {
    const writer = new ValidationWriter(dir, () => new Date('2026-05-14T10:00:00Z'));
    await writer.record(
      ValidationWriter.fromVerdict({
        market: FAKE_MARKET,
        verdict: FAKE_VERDICT,
        mode: 'swarm',
        date: new Date('2026-05-14'),
      }),
    );
    await writer.record(
      ValidationWriter.fromVerdict({
        market: { ...FAKE_MARKET, code: '000858', name: '五粮液' },
        verdict: { ...FAKE_VERDICT, verdict: 'hold' },
        mode: 'single',
        date: new Date('2026-05-15'),
      }),
    );
    const content = await fs.readFile(writer.filePath(new Date('2026-05-14')), 'utf8');
    const headerCount = (content.match(/Swarm vs Single 决策对照表/g) ?? []).length;
    expect(headerCount).toBe(1);
    expect(content).toContain('600519');
    expect(content).toContain('000858');
    expect(content).toContain('hold');
  });

  it('跨季度自动创建新文件', async () => {
    const writer = new ValidationWriter(dir);
    await writer.record(
      ValidationWriter.fromVerdict({
        market: FAKE_MARKET,
        verdict: FAKE_VERDICT,
        mode: 'swarm',
        date: new Date('2026-03-31'),
      }),
    );
    await writer.record(
      ValidationWriter.fromVerdict({
        market: FAKE_MARKET,
        verdict: FAKE_VERDICT,
        mode: 'swarm',
        date: new Date('2026-04-01'),
      }),
    );
    const q1 = await fs.readFile(writer.filePath(new Date('2026-03-31')), 'utf8');
    const q2 = await fs.readFile(writer.filePath(new Date('2026-04-01')), 'utf8');
    expect(q1).toContain('600519');
    expect(q2).toContain('600519');
    expect(q1.split('\n').filter((l) => l.startsWith('| 2026-')).length).toBe(1);
    expect(q2.split('\n').filter((l) => l.startsWith('| 2026-')).length).toBe(1);
  });

  it('fromVerdict helper 正确提取字段', () => {
    const entry = ValidationWriter.fromVerdict({
      market: FAKE_MARKET,
      verdict: FAKE_VERDICT,
      mode: 'swarm',
      notes: '首次测试',
      date: new Date('2026-05-14'),
    });
    expect(entry).toMatchObject({
      date: '2026-05-14',
      stockCode: '600519',
      mode: 'swarm',
      verdict: 'buy',
      confidence: 78,
      positionPct: 35,
      notes: '首次测试',
    });
  });

  it('baseDir 不存在时自动创建', async () => {
    const deep = join(dir, 'a', 'b', 'c');
    const writer = new ValidationWriter(deep);
    await writer.record(
      ValidationWriter.fromVerdict({
        market: FAKE_MARKET,
        verdict: FAKE_VERDICT,
        mode: 'swarm',
        date: new Date('2026-05-14'),
      }),
    );
    const path = writer.filePath(new Date('2026-05-14'));
    const exists = await fs
      .access(path)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });
});
