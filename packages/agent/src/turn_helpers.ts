/**
 * Turn helpers — re-exported from @neotoma/client.
 *
 * The authoritative implementations live in `packages/client/src/helpers.ts`.
 * This module exists solely so that consumers of `@neotoma/agent` can import
 * helpers from a single package without also taking a direct dependency on
 * `@neotoma/client`.
 */

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
} from "@neotoma/client";
