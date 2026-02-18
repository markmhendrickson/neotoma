---
title: "Conversation Turn Identity, Reverts, and Chat Forks"
status: "in_progress"
source_plan: "none (follow-on from iterative_chat_store_mcp_instructions)"
migrated_date: "2026-02-17"
priority: "p2"
estimated_effort: "Restore-turns design (overwrite OK, history via list_observations)."
---

# Conversation Turn Identity, Reverts, and Chat Forks

## Implementation status

**Restore-turns design (current):** The previous "Option B" preserve-all-branch-data contract is superseded by the **restore-turns** design. Agents restore chat turns without tracking branches. Idempotency key varies per store (e.g. `conversation-{conversation_id}-{turn_id}-{timestamp_ms}` or UUID) so each store creates a new observation; overwriting between branches is acceptable. The same logical turn (conversation_id + turn_id) resolves to the same agent_message entity via stable turn identity in the payload (e.g. turn_key or id = conversation_id:turn_id). Current state = snapshot (latest); historical branches = query observation history (`list_observations`). MCP instructions, MCP_SPEC section 2.6, and server fallback instructions are updated accordingly. No branch_id requirement.

## Proposal Context

**Depends on:** Iterative chat store (Option A) is already implemented: agents store conversation and each turn as the chat progresses. See `docs/proposals/iterative_chat_store_mcp_instructions.md`.

**Gap:** Option A does not define turn identity, idempotency for messages, or branch/fork semantics. When users revert turns or branch from an earlier message (e.g. Cursor "branch from here"), storage is best-effort: we can get duplicate messages, mixed branches in one list, or inconsistent dedupe. This proposal defines a follow-on (Option B–style contract) to handle reverts and forks when possible.

**Relevance:** Clients that support branching (Cursor, etc.) and users who revert/edit messages need predictable behavior: either one conversation per branch, or one conversation with branch/turn identifiers so the graph can represent forks and "current branch."

**Invariant:** **Preserve full observation history.** Overwriting in the current snapshot between branches is acceptable. Users can inspect historical branches via `list_observations` (and related provenance). The contract does not require branch_id; agents restore turns with a per-store-varying idempotency key and stable turn identity in the message entity.

---

## Current Limitation (Option A)

- **Turn identity:** No required `turn_id`, `turn_number`, or `branch_id`. The agent may omit them; idempotency and ordering are undefined across reverts or branches.
- **Idempotency key for messages:** We do not tell the agent to use a key that encodes conversation + branch + turn. Re-sending the same turn can dedupe or create a second message; behavior is inconsistent after a revert or fork.
- **Fork semantics:** Branches can all attach to the same `conversation_id`; the result is a flat list that may interleave or duplicate turns from different branches. We do not model "this message supersedes that" or "this message is on branch B."

**Reverts:** Either (a) a new agent_message with no link to the reverted one, or (b) dedupe/overwrite that may not match the UI. Not graceful.

**Forks:** Multiple message chains (one per branch) all point at the same conversation; they are not distinguished. Not graceful.

---

## Will Agents Provide Branch IDs?

Only if the **MCP host** exposes branch or thread identity in the agent’s context. The agent only sees what the host puts in the prompt; it cannot infer a stable `branch_id` or `thread_id` unless the host provides it. Many hosts do not today, so even with a contract that asks for `branch_id`, agents may often have nothing to supply.

**Contract stance:** When the host provides branch_id (or thread_id, parent_message_id), use it so keys are distinct per branch. When the host does not, **still preserve all branch data** by using an idempotency key that is unique per store (see below).

---

## How the agent determines conversation_id

The agent can only use what the **MCP host** provides or what it can derive from the conversation in context. We do not currently specify how conversation_id is determined; below is the recommended contract.

**1. Host-provided (preferred)**  
If the MCP host includes a stable conversation identifier in the agent’s context (e.g. `conversation_id`, `thread_id`, `session_id`, or chat/session metadata), the agent **MUST** use that as `conversation_id` for the conversation entity and for idempotency keys. Same chat session then always yields the same id across turns and retries. Hosts that support branching may expose a root conversation id and a branch or thread id separately; the agent uses the root (or root + branch) per the fork model.

**2. Agent-generated when host does not provide**  
If the host does not pass any conversation or thread id:

- **First turn in a chat:** The agent creates a conversation entity (e.g. entity_type `conversation`) and receives an entity id from the store response. It can use that entity id as `conversation_id` for subsequent turns **only if** it can reuse it (see next).
- **Later turns:** The agent has no durable memory across turns. To reuse the same conversation_id, it would need either (a) the host to include the previous turn’s store result or the conversation entity id in context (e.g. in message metadata or a tool result that remains visible), or (b) a deterministic derivative the agent can recompute each time (e.g. hash of the first user message, or of a chat title if the host provides it). Deterministic derivatives are fragile (e.g. first message can be edited, or two chats can have the same first message).
- **Recommendation:** Document that **conversation_id is best supplied by the MCP host**. When the host does not provide it, the agent may use the entity id from the first turn’s conversation store (if the host re-exposes it in context on later turns), or a deterministic value derived from visible context (e.g. hash of first user message), with the caveat that behavior is best-effort and multiple conversations may collapse if they share the same derivative.

**3. One conversation per branch when host gives branch but not conversation**  
If the host provides something that varies per branch (e.g. thread_id) but not a single “conversation” id, the agent can use that value as the conversation_id (or as part of it), so each branch gets a distinct conversation and all branch data is preserved.

---

## Recommended Contract (Option B–style)

### When the host exposes identifiers

1. **Conversation:** One conversation entity per chat (or per root thread). When the host exposes `branch_id` or `thread_id`, include it in the conversation or use one conversation per branch (e.g. `conversation_id` = root + branch when available).

2. **Turn identity:** Use `turn_id` (or `turn_number`) and `branch_id` (or `parent_message_id`) in the message and in **idempotency_key**, e.g. `conversation-{conversation_id}-{branch_id}-{turn_id}`. **Including branch_id in the key prevents overwriting between branches:** each (conversation_id, branch_id, turn_id) gets a distinct key.

3. **Fork model:** Either (a) one conversation per branch, or (b) one conversation with messages that carry `branch_id` and optionally `parent_message_id`.

4. **Revert / supersedes:** When the user reverts and the agent produces a replacement response, use the same idempotency key (if turn identity is stable) or create a new message with SUPERSEDES to the previous one.

### When the agent fails to provide branch_id (preserve all branch data)

To satisfy **preserve all branch data**, no two stores from different branches may share the same idempotency key. When the host does not expose branch_id (so the agent cannot supply it), the agent **MUST** use an idempotency key that is **unique per store call** so that each branch’s turn always gets a distinct key and nothing is overwritten:

- **Required:** Include a per-invocation unique value in the key, e.g. `conversation-{conversation_id}-turn-{turn_id}-{timestamp_ms}` or `conversation-{conversation_id}-{uuid}`. Use a high-resolution timestamp (e.g. milliseconds) or a client-generated UUID for the current turn. That way every store creates a new message; no key is reused for a different branch’s turn.
- **Do not** use only `conversation_id` + `turn_number` when branches exist: two branches could both send "turn 3" and share a key, causing overwrite or wrong dedupe.
- **Tradeoff:** With a unique key per store, retrying the exact same turn (same content) with the same key still dedupes; retrying with a new key creates a second message. Prefer preservation over dedupe: when in doubt (e.g. after a branch or revert), use a new unique key so that branch’s data is never lost.

**Alternative when host provides something branch-like:** If the host exposes a value that effectively differs per branch (e.g. thread_id, or a context id that changes when the user switches branches), use that in the key instead of a raw timestamp/UUID so you get stable keys per branch and dedupe within the same branch.

---

## Implementation Options

- **Instructions + MCP_SPEC/vocabulary:** Document the contract and the **preserve all branch data** rule. When the host provides branch_id/thread_id, use them in idempotency_key. When the host does not, require a unique value per store in the key (e.g. timestamp_ms or UUID) so no branch’s data overwrites another’s. Update MCP instructions accordingly.
- **Optional:** Dedicated `store_conversation_turn` action that accepts conversation_id, branch_id, turn_id, turn payload, and attachment refs, and builds idempotency_key internally.
- **Optional:** Encourage MCP host implementers to pass branch_id/thread_id/turn_id in context so agents can supply them.

---

## What's In Scope (restore-turns design)

- **Preserve full observation history** invariant: overwriting in current snapshot between branches is acceptable; users inspect historical branches via `list_observations`.
- Stable conversation_id and turn identity (host-provided when possible).
- Idempotency_key includes a per-store unique value (e.g. timestamp_ms or UUID) so each store creates a new observation; same logical turn entity via stable turn identity (turn_key or id = conversation_id:turn_id) in the message entity.
- No branch_id requirement.
- Optional SUPERSEDES relationship for reverted turns.

- No branch’s turns are preserved.
## Relationship types (Neotoma API)

Neotoma’s API supports only a fixed set of relationship types: `PART_OF`, `REFERS_TO`, `EMBEDS`, `CORRECTS`, `SETTLES`, `DUPLICATE_OF`, `DEPENDS_ON`, `SUPERSEDES`. There are no custom types such as `contains_message` or `discusses`.

**Use only supported types in the contract and in agent instructions:**

| Intent                                            | Neotoma type | Direction                                                 |
| ------------------------------------------------- | ------------ | --------------------------------------------------------- |
| Message belongs to conversation                   | `PART_OF`    | message (source) PART_OF conversation (target)            |
| Conversation or message references a topic/entity | `REFERS_TO`  | conversation/message (source) REFERS_TO entity (target)   |
| Message or conversation embeds attachment         | `EMBEDS`     | message/conversation (source) EMBEDS attachment (target)  |
| New message replaces reverted one                 | `SUPERSEDES` | new message (source) SUPERSEDES previous message (target) |

**Display labels:** If docs or UI should show labels like "contains_message" or "discusses", use either (1) a mapping layer that translates the stored type to a display label (e.g. PART_OF between agent_message and conversation → show as "contains message"), or (2) a future Neotoma change to support custom relationship types. The proposal does not add new API types; it uses the existing set only.

## What's Out of Scope

- Changing Option A (already implemented).
- Requiring MCP hosts to expose branch/turn IDs (host-dependent).
- Unstructured turn envelope (Option C; separate).

---

## Success Criteria (restore-turns design)

- Agents restore chat turns with a per-store-varying idempotency key and stable turn identity in the message entity; no branch tracking required.
- Each store creates a new observation; same logical turn resolves to the same entity so snapshot shows latest and `list_observations` exposes full history (historical branches).
- Overwriting between branches in current snapshot is acceptable; instructions and MCP_SPEC document the restore-turns contract.

---

## References

- Iterative chat store (implemented): `docs/proposals/iterative_chat_store_mcp_instructions.md`
- MCP instructions: `docs/developer/mcp/instructions.md`
- MCP spec: `docs/specs/MCP_SPEC.md`
- Relationship types: `docs/subsystems/relationships.md`
