// Preset loader: 加载 YAML preset, zod schema 校验.
//
// YAML 文件位置: ./presets/<slug>.yaml (与本文件同目录).
// build 模式需要 copy 到 dist/services/swarm/presets/ — 见 package.json "build" script.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import type { PresetSpec } from './types.js';

// ---- zod schema ----

const AGENT_ID_ENUM = [
  'bull_advocate',
  'bear_advocate',
  'risk_officer',
  'portfolio_manager',
  'synthesizer',
] as const;

const AgentSpecSchema = z.object({
  id: z.enum(AGENT_ID_ENUM),
  role: z.string().min(1),
  system_prompt: z.string().min(1),
  skills: z.array(z.string()).default([]),
  upstream_context: z.array(z.enum(AGENT_ID_ENUM)).default([]),
  max_tokens: z.number().int().positive().max(8192),
  temperature: z.number().min(0).max(2),
});

const PresetSpecSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  agents: z.array(AgentSpecSchema).min(1),
});

// ---- File location ----

function presetsDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, 'presets');
}

// ---- Public API ----

/**
 * Pure: 校验 YAML 字符串内容. 不读文件. 测试用.
 * @param raw 原始 YAML 文本
 * @param slug 用于错误信息的 preset 标识
 */
export function validatePreset(raw: string, slug: string): PresetSpec {
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`preset YAML 解析失败 (${slug}): ${(err as Error).message}`);
  }

  const result = PresetSpecSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`preset schema 校验失败 (${slug}):\n${issues}`);
  }

  const preset = result.data as PresetSpec;
  const agentIds = new Set(preset.agents.map((a) => a.id));
  for (const agent of preset.agents) {
    for (const upstreamId of agent.upstream_context) {
      if (!agentIds.has(upstreamId)) {
        throw new Error(
          `preset ${slug}: agent ${agent.id} 的 upstream_context 引用了未知 agent ${upstreamId}`,
        );
      }
    }
  }
  // 顺序约束: upstream agent 必须排在引用它的 agent 之前
  const seen = new Set<string>();
  for (const agent of preset.agents) {
    for (const upstreamId of agent.upstream_context) {
      if (!seen.has(upstreamId)) {
        throw new Error(
          `preset ${slug}: agent ${agent.id} 的 upstream ${upstreamId} 必须排在它之前`,
        );
      }
    }
    seen.add(agent.id);
  }

  return preset;
}

export function loadPreset(slug: string): PresetSpec {
  const path = join(presetsDir(), `${slug}.yaml`);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`preset 文件不存在: ${path} (${(err as Error).message})`);
  }
  return validatePreset(raw, slug);
}

export function loadAllPresets(): Record<string, PresetSpec> {
  const dir = presetsDir();
  const result: Record<string, PresetSpec> = {};
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.yaml'));
  } catch (err) {
    throw new Error(`presets 目录不存在: ${dir} (${(err as Error).message})`);
  }
  for (const f of files) {
    const slug = f.replace(/\.yaml$/, '');
    result[slug] = loadPreset(slug);
  }
  return result;
}
