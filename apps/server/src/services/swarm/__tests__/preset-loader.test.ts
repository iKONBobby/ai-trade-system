import { describe, it, expect } from 'vitest';
import { validatePreset, loadPreset, loadAllPresets } from '../preset-loader.js';

// ---- 真实 yaml 集成 ----

describe('loadPreset(real)', () => {
  it('加载 investment_committee.yaml 成功', () => {
    const preset = loadPreset('investment_committee');
    expect(preset.name).toBe('investment_committee');
    expect(preset.agents).toHaveLength(5);
  });

  it('agent 顺序与设计一致', () => {
    const preset = loadPreset('investment_committee');
    expect(preset.agents.map((a) => a.id)).toEqual([
      'bull_advocate',
      'bear_advocate',
      'risk_officer',
      'portfolio_manager',
      'synthesizer',
    ]);
  });

  it('synthesizer 上游含全部前 4 agent', () => {
    const preset = loadPreset('investment_committee');
    const synth = preset.agents.find((a) => a.id === 'synthesizer');
    expect(synth?.upstream_context).toEqual([
      'bull_advocate',
      'bear_advocate',
      'risk_officer',
      'portfolio_manager',
    ]);
  });

  it('bull 与 bear 独立 (upstream 为空)', () => {
    const preset = loadPreset('investment_committee');
    const bull = preset.agents.find((a) => a.id === 'bull_advocate');
    const bear = preset.agents.find((a) => a.id === 'bear_advocate');
    expect(bull?.upstream_context).toEqual([]);
    expect(bear?.upstream_context).toEqual([]);
  });

  it('每个 agent system_prompt 含占位符 {grounding}', () => {
    const preset = loadPreset('investment_committee');
    for (const agent of preset.agents) {
      expect(agent.system_prompt).toContain('{grounding}');
    }
  });

  it('unknown slug → friendly error', () => {
    expect(() => loadPreset('does_not_exist')).toThrow(/preset 文件不存在/);
  });
});

describe('loadAllPresets(real)', () => {
  it('扫描 presets/ 目录加载全部 yaml', () => {
    const all = loadAllPresets();
    expect(all.investment_committee).toBeDefined();
    expect(all.investment_committee.agents).toHaveLength(5);
  });
});

// ---- 纯函数 validatePreset (negative paths) ----

describe('validatePreset', () => {
  it('合规最小 preset 通过', () => {
    const yaml = `
name: tiny
title: 测试
description: 单 PM
agents:
  - id: portfolio_manager
    role: PM
    system_prompt: 'sp'
    skills: []
    upstream_context: []
    max_tokens: 1000
    temperature: 0.3
`;
    const p = validatePreset(yaml, 'tiny');
    expect(p.agents).toHaveLength(1);
  });

  it('YAML 损坏 → friendly error', () => {
    expect(() => validatePreset('{ broken: yaml: : :', 'bad')).toThrow(/YAML 解析失败/);
  });

  it('missing required 字段 → schema error', () => {
    const yaml = `
name: x
title: y
description: z
agents:
  - id: portfolio_manager
    role: PM
`;
    expect(() => validatePreset(yaml, 'incomplete')).toThrow(/schema 校验失败/);
  });

  it('unknown agent id → schema error', () => {
    const yaml = `
name: x
title: y
description: z
agents:
  - id: alien_robot
    role: 外星人
    system_prompt: sp
    skills: []
    upstream_context: []
    max_tokens: 1000
    temperature: 0.3
`;
    expect(() => validatePreset(yaml, 'alien')).toThrow(/schema 校验失败/);
  });

  it('upstream 引用未知 agent → 业务校验报错', () => {
    const yaml = `
name: x
title: y
description: z
agents:
  - id: portfolio_manager
    role: PM
    system_prompt: sp
    skills: []
    upstream_context: [bull_advocate]
    max_tokens: 1000
    temperature: 0.3
`;
    expect(() => validatePreset(yaml, 'orphan-ref')).toThrow(/未知 agent bull_advocate/);
  });

  it('upstream 引用排在后面的 agent → 顺序校验报错', () => {
    const yaml = `
name: x
title: y
description: z
agents:
  - id: portfolio_manager
    role: PM
    system_prompt: sp
    skills: []
    upstream_context: [bull_advocate]
    max_tokens: 1000
    temperature: 0.3
  - id: bull_advocate
    role: 看多
    system_prompt: sp
    skills: []
    upstream_context: []
    max_tokens: 1000
    temperature: 0.3
`;
    expect(() => validatePreset(yaml, 'reverse-order')).toThrow(/必须排在它之前/);
  });

  it('max_tokens 超界 → schema error', () => {
    const yaml = `
name: x
title: y
description: z
agents:
  - id: portfolio_manager
    role: PM
    system_prompt: sp
    skills: []
    upstream_context: []
    max_tokens: 99999
    temperature: 0.3
`;
    expect(() => validatePreset(yaml, 'big')).toThrow(/schema 校验失败/);
  });

  it('temperature 超界 → schema error', () => {
    const yaml = `
name: x
title: y
description: z
agents:
  - id: portfolio_manager
    role: PM
    system_prompt: sp
    skills: []
    upstream_context: []
    max_tokens: 1000
    temperature: 3.5
`;
    expect(() => validatePreset(yaml, 'hot')).toThrow(/schema 校验失败/);
  });
});
