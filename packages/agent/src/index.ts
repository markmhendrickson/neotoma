/**
 * @neotoma/agent — protocol-enforcing agent harness SDK for Neotoma.
 *
 * Public surface:
 *   - `NeotomaMemory` — class encapsulating the canonical store-first turn
 *     protocol. Use directly for explicit `openTurn` / `closeTurn` control.
 *   - `withMemory(agentFn, opts)` — provider-agnostic wrapper for zero-config
 *     integration with any agent loop.
 *   - Turn helpers re-exported from `@neotoma/client` for low-level use.
 *   - `diagnoseTurn` / `renderTurnReport` for protocol QA.
 *
 * Transports come from `@neotoma/client` (`HttpTransport`, `LocalTransport`).
 */

export {
  NeotomaMemory,
  type NeotomaMemoryOptions,
  type OpenTurnInput,
  type OpenTurnResult,
  type CloseTurnInput,
  type CloseTurnResult,
} from "./memory.js";

export {
  withMemory,
  type WithMemoryOptions,
  type MemoryTurnContext,
  type AgentFn,
  type WrappedAgent,
} from "./with_memory.js";

export {
  storeChatTurn,
  retrieveOrStore,
  snapshotOnUpdate,
  recordConversationTurn,
  type ChatTurnMessage,
  type ChatTurnSenderKind,
  type StoreChatTurnInput,
  type StoreChatTurnResult,
  type RetrieveOrStoreInput,
  type RetrieveOrStoreResult,
  type SnapshotOnUpdateInput,
  type SnapshotOnUpdateResult,
  type ConversationTurnInput,
  type ConversationTurnResult,
} from "./turn_helpers.js";

export {
  diagnoseTurn,
  applyRepairs,
  hasErrors,
  type Diagnosis,
  type DiagnosisSeverity,
  type RepairAction,
  type RepairOutcome,
  type TurnObservation,
} from "./diagnose.js";

export {
  renderTurnReport,
  type TurnReportEntity,
  type TurnReportInput,
} from "./turn_report.js";
