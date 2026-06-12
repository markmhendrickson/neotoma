---
path: /sdk/python
locale: en
page_title: Python SDK (neotoma-client)
shell: detail
translation_status: canonical
nav_group: reference
nav_order: 14
---

The `neotoma-client` Python package provides transport plus the same protocol layer that `@neotoma/agent` provides for TypeScript. It is used by Claude Code hook plugins written in Python, OpenAI Agents SDK adapters, and LangChain / LangGraph callbacks.

The package ships HTTP-only: Neotoma's engine runs under Node, and this client reaches it over REST.

## Install

```
pip install neotoma-client
```

## Quick start: store-first turn protocol

`NeotomaMemory` enforces the canonical Neotoma turn lifecycle — bounded retrieval, user-phase store, assistant-phase store, deterministic idempotency keys — so your agent does not have to.

```python
from neotoma_client import NeotomaClient, with_memory

client = NeotomaClient(base_url="http://127.0.0.1:3080", token="dev-local")

def my_agent(user_message: str, ctx) -> str:
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

async def main() -> None:
    client = NeotomaClient(base_url="http://127.0.0.1:3080")
    wrapped = with_memory(lambda m, c: "ok", transport=client, conversation_id="conv-1")
    result = await wrapped.acall("Hello")
    print(result.assistant_message)

asyncio.run(main())
```

Explicit lifecycle:

```python
from neotoma_client import NeotomaClient, NeotomaMemory

client = NeotomaClient(base_url="http://127.0.0.1:3080")
memory = NeotomaMemory(client, conversation_id="conv-123", platform="my-agent")

opened = memory.open_turn(turn_id="t1", user_message="Hello")
reply = my_llm(opened.retrieved)
memory.close_turn(
    turn_id="t1",
    assistant_message=reply,
    refers_to=opened.retrieved_entity_ids,
)
```

## Parity with the TypeScript SDK

The Python `NeotomaMemory` and `with_memory` mirror the TypeScript implementations: identical idempotency key conventions (`conversation-{id}-{turn_id}` and `conversation-{id}-{turn_id}-assistant`), identical entity shapes, identical `PART_OF` / `REFERS_TO` wiring, and the same shape-tolerant response parsing.

## See also

- The full canonical doc lives at `docs/developer/sdk_python.md` in the repo.
- The TypeScript SDK page at `/sdk/agent` covers the same protocol layer.
