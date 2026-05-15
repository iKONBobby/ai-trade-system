// Swarm service public API.

export { runSwarm } from './runtime.js';
export { runRegistry, RunRegistry } from './run-registry.js';
export { loadPreset, loadAllPresets, validatePreset } from './preset-loader.js';
export { swarmEventBus, SwarmEventBus } from './event-bus.js';
export { ValidationWriter } from './validation-writer.js';
export {
  FeedbackWriter,
  feedbackWriter,
  DuplicateFeedbackError,
} from './feedback-writer.js';
export type { RunEntry, RunState, RunMetadata } from './run-registry.js';
export type { PresetSpec, AgentSpec } from './types.js';
export type { ValidationEntry, RecordMode } from './validation-writer.js';
export type { FeedbackEntry, FeedbackDecision } from './feedback-writer.js';
