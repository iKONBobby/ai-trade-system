import { describe, it, expect } from 'vitest';
import type {
  MarketData,
  AnalysisResult,
  AgentId,
  AgentOutput,
  BullOutput,
  BearOutput,
} from '@trade/shared';
import {
  formatPriceBlock,
  formatIndicatorsBlock,
  buildGrounding,
  injectUpstream,
} from '../grounding.js';

const SAMPLE_MARKET: MarketData = {
  code: '600519',
  name: '贵州茅台',
  price: 1680.5,
  change: 1.23,
  volume: 12_345_678,
  turnover: 0.45,
  open: 1670.0,
  high: 1685.2,
  low: 1668.3,
  preClose: 1660.1,
};

const SAMPLE_ANALYSIS: AnalysisResult = {
  marketState: 'trending_up',
  bollinger: { upper: 1700, middle: 1680, lower: 1660, width: 0.024 },
  atr: 25.3,
  ma: { ma5: 1675.2, ma20: 1650.8, ma60: 1620.4 },
  support: 1650,
  resistance: 1700,
  recommendation: 'grid',
  confidence: 75,
  advanced: {
    rsi: { value: 62.4, signal: 'neutral' },
    macd: { dif: 12.5, dea: 10.2, histogram: 2.3, signal: 'golden_cross' },
    kdj: { k: 65.1, d: 58.3, j: 78.7, signal: 'neutral' },
    wr: { value: -32.5, signal: 'neutral' },
    amplitude: 1.02,
    volumeRatio: 1.8,
    limitDistance: { up: 8.4, down: 11.6 },
    maArrangement: 'bullish_alignment',
  },
};

describe('formatPriceBlock', () => {
  it('包含名称代码现价涨跌幅', () => {
    const block = formatPriceBlock(SAMPLE_MARKET);
    expect(block).toContain('贵州茅台 (600519)');
    expect(block).toContain('1680.50');
    expect(block).toContain('1.23%');
    expect(block).toContain('换手率: 0.45%');
  });

  it('换手率 / 成交量含万手', () => {
    const block = formatPriceBlock(SAMPLE_MARKET);
    expect(block).toMatch(/成交量: \d+ 万手/);
  });
});

describe('formatIndicatorsBlock', () => {
  it('含 MA / RSI / MACD / KDJ / WR 各项', () => {
    const block = formatIndicatorsBlock(SAMPLE_ANALYSIS);
    expect(block).toContain('MA5: 1675.20');
    expect(block).toContain('多头排列');
    expect(block).toContain('RSI(14): 62.4');
    expect(block).toContain('MACD: DIF=12.50');
    expect(block).toContain('金叉');
    expect(block).toContain('KDJ: K=65.1');
    expect(block).toContain('WR: -32.5');
  });

  it('布林带 + ATR + 关键价位', () => {
    const block = formatIndicatorsBlock(SAMPLE_ANALYSIS);
    expect(block).toContain('上轨=1700.00');
    expect(block).toContain('ATR: 25.30');
    expect(block).toContain('支撑位: 1650.00');
    expect(block).toContain('阻力位: 1700.00');
  });

  it('null 指标安全跳过', () => {
    const analysis: AnalysisResult = {
      ...SAMPLE_ANALYSIS,
      advanced: {
        ...SAMPLE_ANALYSIS.advanced,
        rsi: null,
        macd: null,
        kdj: null,
        wr: null,
        volumeRatio: null,
      },
    };
    const block = formatIndicatorsBlock(analysis);
    expect(block).not.toContain('RSI(14)');
    expect(block).not.toContain('MACD:');
    expect(block).not.toContain('量比:');
    // 仍含布林带 / ATR / 关键价位
    expect(block).toContain('布林带');
    expect(block).toContain('支撑位');
  });
});

describe('buildGrounding', () => {
  it('返回 target / market / pricesBlock / indicatorsBlock', () => {
    const g = buildGrounding(SAMPLE_MARKET, SAMPLE_ANALYSIS);
    expect(g.target).toBe('贵州茅台 600519');
    expect(g.market).toBe('A股');
    expect(g.pricesBlock).toContain('贵州茅台');
    expect(g.indicatorsBlock).toContain('MA5');
  });
});

describe('injectUpstream', () => {
  it('空 upstream → "独立分析" 提示', () => {
    const result = injectUpstream([], new Map(), new Set());
    expect(result).toContain('独立分析');
  });

  it('单 agent (bull) 输出 → 含论点 / 信心 / 关键数据', () => {
    const bull: BullOutput = {
      thesis_bullets: ['趋势强劲', '量价配合'],
      confidence: 'high',
      key_data_points: ['MACD 金叉', 'RSI 反弹'],
    };
    const outputs = new Map<AgentId, AgentOutput>([['bull_advocate', bull]]);
    const result = injectUpstream(['bull_advocate'], outputs, new Set());
    expect(result).toContain('### 看多研究员 (bull_advocate) 的观点');
    expect(result).toContain('- 趋势强劲');
    expect(result).toContain('信心: high');
    expect(result).toContain('- MACD 金叉');
  });

  it('多 agent 按 upstreamIds 顺序拼接', () => {
    const bull: BullOutput = {
      thesis_bullets: ['看多 1'],
      confidence: 'medium',
      key_data_points: [],
    };
    const bear: BearOutput = {
      risk_bullets: ['看空 1'],
      severity: 'high',
      key_red_flags: [],
    };
    const outputs = new Map<AgentId, AgentOutput>([
      ['bull_advocate', bull],
      ['bear_advocate', bear],
    ]);
    const result = injectUpstream(['bull_advocate', 'bear_advocate'], outputs, new Set());
    const bullIdx = result.indexOf('bull_advocate');
    const bearIdx = result.indexOf('bear_advocate');
    expect(bullIdx).toBeGreaterThan(-1);
    expect(bearIdx).toBeGreaterThan(bullIdx);
  });

  it('failed agent 显示占位串', () => {
    const result = injectUpstream(['bull_advocate'], new Map(), new Set(['bull_advocate']));
    expect(result).toContain('(此角色未能完成发言)');
  });

  it('missing output (没在 outputs 也没在 failures) 走占位串', () => {
    const result = injectUpstream(['bull_advocate'], new Map(), new Set());
    expect(result).toContain('(此角色未能完成发言)');
  });

  it('总 char 超 16KB 时截断 + 注释', () => {
    const big: BullOutput = {
      thesis_bullets: Array(10).fill('x'.repeat(2000)),
      confidence: 'medium',
      key_data_points: [],
    };
    const outputs = new Map<AgentId, AgentOutput>([['bull_advocate', big]]);
    const result = injectUpstream(['bull_advocate'], outputs, new Set());
    expect(result.length).toBeLessThanOrEqual(16_000 + 100);
    expect(result).toContain('截断');
  });
});
