# neotoma-client

Python client for [Neotoma](https://neotoma.io) — the deterministic personal memory engine.

Used by Claude Code hook plugins written in Python, OpenAI Agents SDK adapters, and LangChain/LangGraph callbacks. Ships HTTP-only (Neotoma's engine runs under Node; this client reaches it over REST).

## Install

```bash
pip install neotoma-client
```

## Quick start

### Sync

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

### Async

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
