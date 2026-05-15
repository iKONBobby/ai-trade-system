// Swarm service internal types (server-side only).
// 公共 SSE 协议类型在 packages/shared/src/swarm-types.ts.

import type { AgentId, AgentOutput, SwarmEvent } from '@trade/shared';

// ---- Preset YAML schema (验证后 cast 为此类型) ----

export interface AgentSpec {
  id: AgentId;
  role: string;
  system_prompt: string;
  skills: string[];
  upstream_context: AgentId[];
  max_tokens: number;
  temperature: number;
  // output_schema 在 zod runtime 校验, 这里不细约束
}

export interface PresetSpec {
  name: string;
  title: string;
  description: string;
  agents: AgentSpec[];
}

// ---- Runtime context ----

export interface GroundingPayload {
  target: string; // 例: "贵州茅台 600519"
  market: string; // 例: "A股"
  pricesBlock: string; // 已格式化的 markdown
  indicatorsBlock: string; // 已格式化的 markdown
}

export interface AgentExecutionContext {
  agent: AgentSpec;
  grounding: GroundingPayload;
  upstreamOutputs: Map<AgentId, AgentOutput>;
  upstreamFailures: Set<AgentId>;
  signal: AbortSignal;
  emit: (event: SwarmEvent) => void;
}

export type AgentExecutionResult =
  | { kind: 'ok'; output: AgentOutput }
  | { kind: 'failed'; message: string };
