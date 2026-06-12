# neotoma-client

Python client for [Neotoma](https://neotoma.io) — the deterministic personal memory engine.

Used by Claude Code hook plugins written in Python, OpenAI Agents SDK adapters, and LangChain/LangGraph callbacks. Ships HTTP-only (Neotoma's engine runs under Node; this client reaches it over REST).

## Install

```bash
pip install neotoma-client
```

## Quick start

### Store-first turn protocol (recommended)

`NeotomaMemory` enforces the canonical Neotoma turn lifecycle — bounded retrieval, user-phase store, assistant-phase store, deterministic idempotency keys — so your agent doesn't have to.

```python
from neotoma_client import NeotomaClient, with_memory

client = NeotomaClient(base_url="http://127.0.0.1:3080", token="dev-local")

def my_agent(user_message: str, ctx) -> str:
    # ctx.retrieved contains entities matched from the user message
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

Async variant:

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

Explicit lifecycle (when you need finer control):

```python
from neotoma_client import NeotomaClient, NeotomaMemory

client = NeotomaClient(base_url="http://127.0.0.1:3080")
memory = NeotomaMemory(client, conversation_id="conv-123", platform="my-agent")

opened = memory.open_turn(turn_id="t1", user_message="Hello")
reply = my_llm(opened.retrieved)  # pass retrieved context to your LLM
memory.close_turn(turn_id="t1", assistant_message=reply,
                  refers_to=opened.retrieved_entity_ids)
```

### Raw client

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

## API

### Protocol layer

- `NeotomaMemory(transport, *, conversation_id, platform=None, ...)` — enforces store-first turn protocol
  - `open_turn(turn_id, user_message)` → `OpenTurnResult` (retrieval + user-phase store)
  - `close_turn(turn_id, assistant_message, refers_to=None)` → `CloseTurnResult` (assistant-phase store)
  - `aopen_turn` / `aclose_turn` — async variants
- `with_memory(agent_fn, *, transport, conversation_id, ...)` → `WrappedAgent`
  - `wrapped(user_message)` → `WithMemoryResult` (sync)
  - `await wrapped.acall(user_message)` → `WithMemoryResult` (async)
- `store_chat_turn(transport, *, conversation_id, turn_id, messages)` → `StoreChatTurnResult`
- `retrieve_or_store(transport, *, identifier, entity_type, create)` → `RetrieveOrStoreResult`

### Transport (raw)

Sync methods:

- `store(input)` — create or update entities
- `retrieve_entities(input)` — list by type / time window
- `retrieve_entity_by_identifier(input)` — single entity lookup
- `retrieve_entity_snapshot(entity_id=...)` — snapshot with provenance
- `list_observations(input)` — observation history
- `list_timeline_events(input)` — timeline window
- `retrieve_related_entities(input)` — graph expansion
- `create_relationship(input)` — link two entities
- `correct(entity_id=..., corrections=...)` — supersede prior observation
- `list_entity_types(search=...)` — schema discovery
- `get_entity_type_counts(input)` — per-type cardinality
- `execute_tool(name, args)` — escape hatch

Async variants are prefixed with `a` (`astore`, `aretrieve_entities`, …).

See [`docs/specs/MCP_SPEC.md`](https://github.com/markmhendrickson/neotoma/blob/main/docs/specs/MCP_SPEC.md) and [`openapi.yaml`](https://github.com/markmhendrickson/neotoma/blob/main/openapi.yaml) for complete action semantics.

## License

MIT
