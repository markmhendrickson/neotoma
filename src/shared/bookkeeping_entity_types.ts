/** Existing generic bookkeeping vocabulary, shared without export/registry side effects. */
export const BOOKKEEPING_ENTITY_TYPES: ReadonlySet<string> = new Set([
  "conversation",
  "conversation_message",
  // `agent_message` is the pre-Phase-2 canonical name for `conversation_message`
  // and is kept here so historical rows stored under the old entity_type are
  // still treated as chat bookkeeping.
  "agent_message",
]);
