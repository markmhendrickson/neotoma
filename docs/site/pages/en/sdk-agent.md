---
path: /sdk/agent
locale: en
page_title: TypeScript SDK (@neotoma/agent)
shell: detail
translation_status: canonical
nav_group: reference
nav_order: 13
---

The `@neotoma/agent` package is the protocol-enforcing agent harness SDK for Neotoma. It wraps `@neotoma/client` with the canonical store-first turn protocol so developers building agents with any LLM provider get correct Neotoma memory behavior without learning the interaction rules by hand.

**Provider-agnostic.** This package does not call any LLM. Compose it around any agent loop — Claude, OpenAI, custom HTTP, whatever.

## Install

```
npm install @neotoma/agent @neotoma/client
```

## When to reach for this package

- You are building an agent that should persist its turns to Neotoma.
- You want correct `conversation` / `conversation_message` shapes, `PART_OF` and `REFERS_TO` edges, and deterministic idempotency keys by construction — not by hand.
- You do not want your agent code to learn the Neotoma turn lifecycle.

If you only need to write a single ad-hoc record, use `@neotoma/client` directly. If you are wiring a host harness (Claude Code, Cursor, OpenCode, Codex), use the dedicated hook plugin — it already depends on `@neotoma/agent` under the hood.

## Quick start (provider-agnostic)

```ts
import { HttpTransport } from "@neotoma/client";
import { withMemory } from "@neotoma/agent";

const wrapped = withMemory(
  async (userMessage, ctx) => {
    return await yourAgent(userMessage, ctx.retrieved);
  },
  {
    transport: new HttpTransport({
      baseUrl: process.env.NEOTOMA_URL!,
      token: process.env.NEOTOMA_TOKEN!,
    }),
    conversationId: "conv-2026-05-20",
    platform: "my-agent",
  }
);

const { assistantMessage } = await wrapped("What do we know about Acme Corp?");
```

On every call, the wrapper:

1. Bounded retrieval — extracts identifiers from the user message and looks them up in Neotoma.
2. Stores the user message as a `conversation_message` `PART_OF` the conversation, with `REFERS_TO` edges to retrieved entities.
3. Invokes your agent with the retrieved set available on `ctx.retrieved`.
4. Stores the assistant reply the same way, with `REFERS_TO` edges to cited entities.
5. Idempotency keys are deterministic per turn — re-runs collapse onto one observation.

## Explicit lifecycle control

For streaming, multi-step tool loops, or any case where `withMemory` is too coarse, use `NeotomaMemory` directly.

```ts
import { NeotomaMemory } from "@neotoma/agent";

const memory = new NeotomaMemory({ transport, conversationId, platform: "my-agent" });

const opened = await memory.openTurn({ turnId, userMessage });
// ... run any agent loop ...
await memory.closeTurn({
  turnId,
  assistantMessage,
  refersTo: opened.retrievedEntityIds,
});
```

## What this package gives you over `@neotoma/client`

`@neotoma/client` is the low-level REST / local transport — it knows nothing about turn lifecycles. `@neotoma/agent` is the protocol layer that enforces bounded retrieval, correct entity shapes, `PART_OF` / `REFERS_TO` edges, and deterministic idempotency keys.

## Coverage vs. MCP instructions

`@neotoma/agent` enforces the mechanical protocol — turn ordering, entity shapes, relationships, idempotency. It does not enforce behavioral policies (QA reflection, display-rule output, issue-filing consent, PII stripping in issue bodies, custom entity extraction beyond the user / assistant message pair). Those remain agent-side concerns.

## See also

- The full canonical doc lives at `docs/developer/sdk_agent.md` in the repo.
- The Python SDK page at `/sdk/python` covers the same protocol layer for Python agents.
