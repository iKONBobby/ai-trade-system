'use client';

// useSwarmStream: 订阅 swarm SSE 流, 用 reducer 维护 SwarmRuntimeState.
//
// 用法:
//   const { state, cancel } = useSwarmStream(runInfo);
//   const startRun = async (stockCode) => {
//     const info = await startSwarmRun(stockCode, presetId);
//     setRunInfo(info); // 触发订阅
//   };

import { useEffect, useReducer, useRef, useCallback } from 'react';
import type {
  AgentId,
  AgentRole,
  AgentRuntime,
  SwarmEvent,
  SwarmRuntimeState,
} from '@trade/shared';

// ---- 角色名映射 (与 preset YAML 一致) ----

const AGENT_ROLE_MAP: Record<AgentId, AgentRole> = {
  bull_advocate: '看多研究员',
  bear_advocate: '看空研究员',
  risk_officer: '首席风险官',
  portfolio_manager: '投资经理',
  synthesizer: '中立总结者',
};

// ---- Reducer (pure, 独立 export 供测试) ----

export function initialSwarmState(runId: string, startedAt: number): SwarmRuntimeState {
  return {
    runId,
    presetId: '',
    startedAt,
    agents: [],
    state: 'pending',
  };
}

function updateAgent(
  agents: AgentRuntime[],
  id: AgentId,
  patch: Partial<AgentRuntime>,
): AgentRuntime[] {
  return agents.map((a) => (a.id === id ? { ...a, ...patch } : a));
}

export function swarmReducer(
  state: SwarmRuntimeState,
  event: SwarmEvent,
): SwarmRuntimeState {
  switch (event.type) {
    case 'swarm_started':
      return {
        ...state,
        presetId: event.presetId,
        state: 'running',
        agents: event.agentIds.map((id) => ({
          id,
          role: AGENT_ROLE_MAP[id],
          state: 'pending',
          streamedText: '',
        })),
      };
    case 'agent_started':
      return {
        ...state,
        agents: updateAgent(state.agents, event.agentId, {
          state: 'streaming',
          streamedText: '',
        }),
      };
    case 'agent_chunk': {
      const agent = state.agents.find((a) => a.id === event.agentId);
      if (!agent) return state;
      return {
        ...state,
        agents: updateAgent(state.agents, event.agentId, {
          streamedText: agent.streamedText + event.text,
        }),
      };
    }
    case 'agent_completed':
      return {
        ...state,
        agents: updateAgent(state.agents, event.agentId, {
          state: 'done',
          output: event.output,
        }),
      };
    case 'agent_failed':
      return {
        ...state,
        agents: updateAgent(state.agents, event.agentId, {
          state: 'failed',
          errorMessage: event.message,
        }),
      };
    case 'swarm_completed': {
      const hasFailed = state.agents.some((a) => a.state === 'failed');
      return {
        ...state,
        state: hasFailed ? 'partial' : 'done',
        verdict: event.verdict,
        synthesis: event.synthesis,
        durationMs: event.durationMs,
      };
    }
    case 'swarm_error':
      return {
        ...state,
        state: 'error',
        agents: event.agentId
          ? updateAgent(state.agents, event.agentId, {
              state: 'failed',
              errorMessage: event.message,
            })
          : state.agents,
      };
    case 'swarm_aborted':
      return {
        ...state,
        state: 'aborted',
        agents: state.agents.map((a) =>
          a.state === 'pending' || a.state === 'streaming' ? { ...a, state: 'aborted' } : a,
        ),
      };
    default:
      return state;
  }
}

// ---- Hook ----

export interface SwarmRunInfo {
  runId: string;
  streamUrl: string;
}

export interface UseSwarmStreamResult {
  state: SwarmRuntimeState | null;
  cancel: () => Promise<void>;
}

type Action =
  | { kind: 'reset'; init: SwarmRuntimeState }
  | { kind: 'event'; event: SwarmEvent };

function rootReducer(
  state: SwarmRuntimeState | null,
  action: Action,
): SwarmRuntimeState | null {
  if (action.kind === 'reset') return action.init;
  if (!state) return state;
  return swarmReducer(state, action.event);
}

export function useSwarmStream(
  info: SwarmRunInfo | null,
  options: { eventSourceFactory?: (url: string) => EventSource } = {},
): UseSwarmStreamResult {
  const [state, dispatch] = useReducer(rootReducer, null);
  const esRef = useRef<EventSource | null>(null);
  const runIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!info) {
      esRef.current?.close();
      esRef.current = null;
      runIdRef.current = null;
      return;
    }

    // 重新订阅 (例如换 runId)
    runIdRef.current = info.runId;
    dispatch({ kind: 'reset', init: initialSwarmState(info.runId, Date.now()) });

    const factory = options.eventSourceFactory ?? ((url) => new EventSource(url));
    const es = factory(info.streamUrl);
    esRef.current = es;

    es.onmessage = (msg) => {
      let event: SwarmEvent;
      try {
        event = JSON.parse(msg.data) as SwarmEvent;
      } catch {
        return;
      }
      dispatch({ kind: 'event', event });
      // 终止事件后主动 close
      if (
        event.type === 'swarm_completed' ||
        event.type === 'swarm_error' ||
        event.type === 'swarm_aborted'
      ) {
        es.close();
      }
    };

    es.onerror = () => {
      // EventSource onerror 在 close 时也触发, 不强制 dispatch state=error
      // 真正的 error 由 server 通过 swarm_error event 推送
    };

    return () => {
      es.close();
      if (esRef.current === es) esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.runId, info?.streamUrl]);

  const cancel = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    try {
      await fetch(`/api/swarm/runs/${runId}/abort`, { method: 'POST' });
    } catch {
      // best effort
    }
    esRef.current?.close();
  }, []);

  return { state, cancel };
}
