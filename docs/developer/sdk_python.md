---
title: "neotoma-client (Python) SDK"
category: developer_reference
subcategory: sdks
order: 2
---

# neotoma-client (Python)

Python client for Neotoma — transport plus the same protocol layer that `@neotoma/agent` provides for TypeScript. Used by Claude Code hook plugins written in Python, OpenAI Agents SDK adapters, and LangChain / LangGraph callbacks.

The package ships HTTP-only: Neotoma's engine runs under Node, and this client reaches it over REST.

## Install

```bash
pip install neotoma-client
```

## When to reach for this package

- You are writing a Python agent (LangChain, OpenAI Agents SDK, custom loop) that should persist its turns to Neotoma.
- You are writing a Python hook plugin for a coding harness and want the same protocol semantics as the TypeScript hooks.
- You need either sync or async access — both are first-class.

## Quick start: store-first turn protocol

`NeotomaMemory` enforces the canonical Neotoma turn lifecycle — bounded retrieval, user-phase store, assistant-phase store, deterministic idempotency keys — so your agent does not have to.

```python
from neotoma_client import NeotomaClient, with_memory

client = NeotomaClient(base_url="http://127.0.0.1:3080", token="dev-local")

def my_agent(user_message: str, ctx) -> str:
    # ctx.retrieved contains entities matched from the user message.
    return f"Reply to: {user_message}"

wrapped = with_memory(
    my_agent,
    transport=client,
    conversation_id="conv-2026-05-20",
    platform="my-agent",
)

result = wrapped("Tell me about Acme Corp")
print(result.assistant_message)
```

### Async variant

```python
import asyncio
from neotoma_client import NeotomaClient, with_memory

async def async_agent(user_message: str, ctx) -> str:
    return f"Reply to: {user_message}"

async def main() -> None:
    client = NeotomaClient(base_url="http://127.0.0.1:3080")
    wrapped = with_memory(async_agent, transport=client, conversation_id="conv-1")
    result = await wrapped.acall("Hello")
    print(result.assistant_message)

asyncio.run(main())
```

### Explicit lifecycle

When `with_memory` is too coarse — streaming, multi-step tool loops, or any case where you need direct control of the turn boundaries:

```python
from neotoma_client import NeotomaClient, NeotomaMemory

client = NeotomaClient(base_url="http://127.0.0.1:3080")
memory = NeotomaMemory(client, conversation_id="conv-123", platform="my-agent")

opened = memory.open_turn(turn_id="t1", user_message="Hello")
reply = my_llm(opened.retrieved)  # pass retrieved context to your LLM
memory.close_turn(
    turn_id="t1",
    assistant_message=reply,
    refers_to=opened.retrieved_entity_ids,
)
```

## Raw transport (no protocol layer)

If you only need to store a single record or query data, skip the protocol layer:

```python
from neotoma_client import NeotomaClient

client = NeotomaClient(base_url="http://127.0.0.1:3080", token="dev-local")

client.store({
    "entities": [
        {"entity_type": "task", "title": "Review plan", "due_date": "2026-04-15"}
    ],
    "idempotency_key": "my-hook-2026-04-09-001",
})
```

Async:

```python
import asyncio
from neotoma_client import NeotomaClient

async def main() -> None:
    async with NeotomaClient(base_url="http://127.0.0.1:3080") as client:
        result = await client.aretrieve_entities({"entity_type": "task", "limit": 10})
        print(result)

asyncio.run(main())
```

## API surface

### Protocol layer

- `NeotomaMemory(transport, *, conversation_id, platform=None, …)` — enforces the store-first turn protocol.
  - `open_turn(turn_id, user_message)` → `OpenTurnResult` (retrieval + user-phase store).
  - `close_turn(turn_id, assistant_message, refers_to=None)` → `CloseTurnResult` (assistant-phase store).
  - `aopen_turn` / `aclose_turn` — async variants.
- `with_memory(agent_fn, *, transport, conversation_id, …)` → `WrappedAgent`.
  - `wrapped(user_message)` → `WithMemoryResult` (sync).
  - `await wrapped.acall(user_message)` → `WithMemoryResult` (async).
- `store_chat_turn(transport, *, conversation_id, turn_id, messages)` → `StoreChatTurnResult`.
- `retrieve_or_store(transport, *, identifier, entity_type, create)` → `RetrieveOrStoreResult`.

### Transport (raw)

Sync methods on `NeotomaClient`:

- `store(input)` — create or update entities.
- `retrieve_entities(input)` — list by type / time window.
- `retrieve_entity_by_identifier(input)` — single entity lookup.
- `retrieve_entity_snapshot(entity_id=…)` — snapshot with provenance.
- `list_observations(input)` — observation history.
- `list_timeline_events(input)` — timeline window.
- `retrieve_related_entities(input)` — graph expansion.
- `create_relationship(input)` — link two entities.
- `correct(entity_id=…, corrections=…)` — supersede prior observation.
- `list_entity_types(search=…)` — schema discovery.
- `get_entity_type_counts(input)` — per-type cardinality.
- `execute_tool(name, args)` — escape hatch.

Async variants are prefixed with `a` (`astore`, `aretrieve_entities`, …).

## Parity with `@neotoma/agent`

The Python `NeotomaMemory` and `with_memory` mirror the TypeScript implementations: identical idempotency key conventions (`conversation-{id}-{turn_id}` / `conversation-{id}-{turn_id}-assistant`), identical entity shapes, identical `PART_OF` / `REFERS_TO` wiring, and the same shape-tolerant response parsing that handles both current (`result.entities`) and legacy (`result.structured.entities`) server payloads.

See the [TypeScript SDK reference](sdk_agent.md) for the same protocol described in TypeScript terms.

## See also

- [MCP instructions](mcp/instructions.md) — the full behavioral contract for agents.
- The OpenAPI document (`openapi.yaml` in the repo) and `docs/specs/MCP_SPEC.md` for action semantics.

## License

MIT
