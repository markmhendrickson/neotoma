---
name: neotoma-agent
description: Canonical turn protocol for agents writing to Neotoma. Bounded retrieval on the user message, store user message PART_OF conversation with REFERS_TO edges to retrieved entities, store assistant reply the same way. Use this skill in any agent loop that should persist conversation state to Neotoma.
triggers:
  - "agent loop needs Neotoma memory"
  - "store this conversation"
  - "persist turns to Neotoma"
  - "build an agent with memory"
---

# Neotoma Agent Turn Protocol

This skill describes the canonical protocol an agent follows on every turn when writing to Neotoma. `@neotoma/agent` enforces this protocol by construction; this document describes what the protocol is and why each step exists, for agents and developers who want to understand or extend it.

## The protocol

On every turn:

1. **Bounded retrieval.** Extract concrete identifiers (names, ids, quoted strings, capitalized phrases) from the user message. For each, call `retrieveEntityByIdentifier`. Keep the result set bounded (default 8 entities). Failures are non-fatal — proceed with an empty retrieved set.

2. **Store the user message.** Persist a `conversation_message` entity with:
   - `role: "user"`, `sender_kind: "user"`, `content: <exact user text>`
   - `turn_key: "{conversation_id}:{turn_id}"`
   - A `PART_OF` relationship to the conversation entity (created in the same store if it does not exist).
   - A `REFERS_TO` relationship to every retrieved entity from step 1.
   - `idempotency_key: "conversation-{conversation_id}-{turn_id}-user-..."` so re-runs of the same turn collapse onto one observation.

3. **Run the agent.** Invoke the underlying LLM with the retrieved entities available as context. The agent may use them to ground its reply.

4. **Store the assistant reply.** Persist another `conversation_message` entity:
   - `role: "assistant"`, `sender_kind: "assistant"`, `content: <exact reply text>`
   - `turn_key: "{conversation_id}:{turn_id}:assistant"`
   - A `PART_OF` relationship to the conversation entity.
   - `REFERS_TO` relationships to every entity the reply materially cites or produces.
   - `idempotency_key: "conversation-{conversation_id}-{turn_id}-assistant-..."`.

## Why each step exists

- **Bounded retrieval before write** lets the agent see what is already known, so it can correct or extend rather than re-create. Skipping this step produces duplicate entities and contradicts itself across sessions.
- **`PART_OF` to the conversation** makes the conversation queryable as a single unit: every message hangs off one root.
- **`REFERS_TO` edges** are the agent's working memory in graph form. They let downstream queries answer "which conversations touched this entity?" without re-reading every message.
- **Deterministic idempotency keys** mean the same turn replayed (timeouts, retries, hook fires) produces one observation, not many. The key shape `conversation-{conversation_id}-{turn_id}-{role}` is stable, predictable, and collision-free across turns.
- **Exact content** (no summarization at write time) preserves provenance. Summaries are a downstream interpretation, not a substitute for the source.

## Forbidden patterns

- **Persisting the user message without storing the assistant reply when you did reply.** The pair is the unit; orphan user messages misrepresent the conversation.
- **Ending the turn without the closing assistant store when you produced a user-visible reply.** Same as above — both halves or neither.
- **Skipping Neotoma for an entire rapid-fire session.** Even minimal turns (greetings, "ok", "yes") still get stored. Long runs of unstored turns leave the graph stale.
- **Storing inferred content as `content`.** The `content` field is the literal user/assistant text. Summaries belong in observations on derived entities (`summary`, `tldr`), not as the message content.

## Using `@neotoma/agent`

```ts
import { HttpTransport } from "@neotoma/client";
import { withMemory } from "@neotoma/agent";

const wrapped = withMemory(
  async (userMessage, ctx) => {
    // Build prompt with ctx.retrieved entities, call your LLM, return reply.
    return await callLLM(userMessage, ctx.retrieved);
  },
  {
    transport: new HttpTransport({ baseUrl: "https://your-neotoma.example.com", token: process.env.NEOTOMA_TOKEN! }),
    conversationId: "conv-2026-05-20",
    platform: "my-agent",
  }
);

const { assistantMessage } = await wrapped("Hello, what do you know about Acme Corp?");
```

For explicit control over the open/close lifecycle (streaming, multi-step tool loops), use `NeotomaMemory` directly:

```ts
import { NeotomaMemory } from "@neotoma/agent";

const memory = new NeotomaMemory({ transport, conversationId, platform });
const opened = await memory.openTurn({ turnId, userMessage });
// ... run agent loop, possibly multiple tool calls, using opened.retrieved ...
await memory.closeTurn({ turnId, assistantMessage, refersTo: opened.retrievedEntityIds });
```

## Provider-agnostic

`@neotoma/agent` does not call any LLM. It composes around any agent loop — Anthropic, OpenAI, custom HTTP, whatever. The protocol is the value; the LLM is the caller's choice.
