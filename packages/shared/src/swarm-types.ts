// Swarm engine shared types — frontend + backend 共享.
//
// 多 agent 辩论编排器 SSE 协议. 设计依据:
//   ~/.gstack/projects/ai-trade-system/bobby-main-design-20260514-111628.md

// ---- Agent role + 输出 schema ----

export type AgentId =
  | 'bull_advocate'
  | 'bear_advocate'
  | 'risk_officer'
  | 'portfolio_manager'
  | 'synthesizer';

export type AgentState = 'pending' | 'streaming' | 'done' | 'failed' | 'aborted';

export type AgentRole = '看多研究员' | '看空研究员' | '首席风险官' | '投资经理' | '中立总结者';

export interface BullOutput {
  thesis_bullets: string[];
  confidence: 'high' | 'medium' | 'low';
  key_data_points: string[];
}

export interface BearOutput {
  risk_bullets: string[];
  severity: 'high' | 'medium' | 'low';
  key_red_flags: string[];
}

export interface RiskOfficerOutput {
  verdict_on_bull: 'valid' | 'partial' | 'invalid';
  verdict_on_bear: 'valid' | 'partial' | 'invalid';
  net_risk_assessment: string;
  max_position_pct: number;
}

export type SwarmVerdictCode = 'buy' | 'hold' | 'sell' | 'avoid';
export type StrategyHint = 'grid' | 'condition' | 'none';

export interface PortfolioManagerOutput {
  verdict: SwarmVerdictCode;
  confidence: number; // 0-100
  position_size_pct: number; // 0-100
  key_thesis: string;
  risks: string[];
  strategy_hint: StrategyHint;
}

export interface SynthesizerOutput {
  disagreements: string[]; // 3 个最大分歧点
  pm_confidence_offset: number; // -100..100, risk 担忧抵销 PM 信心多少
  missing_info: string[];
}

export type AgentOutput =
  | BullOutput
  | BearOutput
  | RiskOfficerOutput
  | PortfolioManagerOutput
  | SynthesizerOutput;

// ---- SSE 事件协议 ----
//
// 服务端通过 EventSource 流式推送给前端. 每个事件一行 JSON.
// 终止事件: swarm_completed | swarm_error | swarm_aborted.

export interface SwarmStartedEvent {
  type: 'swarm_started';
  runId: string;
  presetId: string;
  agentIds: AgentId[];
}

export interface AgentStartedEvent {
  type: 'agent_started';
  agentId: AgentId;
  index: number; // 0-based 顺序
}

export interface AgentChunkEvent {
  type: 'agent_chunk';
  agentId: AgentId;
  text: string;
  done: false;
}

export interface AgentCompletedEvent {
  type: 'agent_completed';
  agentId: AgentId;
  output: AgentOutput;
}

export interface AgentFailedEvent {
  type: 'agent_failed';
  agentId: AgentId;
  message: string;
}

export interface SwarmCompletedEvent {
  type: 'swarm_completed';
  runId: string;
  verdict: PortfolioManagerOutput;
  synthesis?: SynthesizerOutput;
  durationMs: number;
}

export interface SwarmErrorEvent {
  type: 'swarm_error';
  agentId?: AgentId;
  message: string;
}

export interface SwarmAbortedEvent {
  type: 'swarm_aborted';
  reason: 'user_cancel' | 'ttl_timeout';
}

export type SwarmEvent =
  | SwarmStartedEvent
  | AgentStartedEvent
  | AgentChunkEvent
  | AgentCompletedEvent
  | AgentFailedEvent
  | SwarmCompletedEvent
  | SwarmErrorEvent
  | SwarmAbortedEvent;

// ---- API request/response ----

export type TradeMode = 'grid' | 'condition' | 'auto';

export interface SwarmStartRequest {
  stockCode: string;
  presetId: string;
  totalCapital: number;
  tradeMode: TradeMode;
  isT0Mode: boolean;
}

export interface SwarmStartResponse {
  runId: string;
  streamUrl: string;
}

export interface SwarmFeedbackRequest {
  decision: 'accept' | 'reject' | 'modify';
  modifiedPositionPct?: number; // 仅 decision === 'modify' 时存在
}

export interface SwarmBatchRequest {
  stockCodes: string[]; // 上限由服务端 enforce
  presetId: string;
  totalCapital: number;
}

export interface SwarmBatchResponse {
  batchId: string;
  runs: { stockCode: string; runId: string; streamUrl: string }[];
}

// ---- Frontend state types ----

export interface AgentRuntime {
  id: AgentId;
  role: AgentRole;
  state: AgentState;
  streamedText: string; // 累积 chunk
  output?: AgentOutput;
  errorMessage?: string;
}

export interface SwarmRuntimeState {
  runId: string;
  presetId: string;
  startedAt: number;
  agents: AgentRuntime[];
  verdict?: PortfolioManagerOutput;
  synthesis?: SynthesizerOutput;
  state: 'pending' | 'running' | 'done' | 'error' | 'aborted' | 'partial';
  durationMs?: number;
}
