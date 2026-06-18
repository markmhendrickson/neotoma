"""Zero-config `with_memory` wrapper for Python agent functions.

Mirrors `@neotoma/agent/src/with_memory.ts`. Wraps any sync or async
callable with the full Neotoma store-first turn protocol so callers don't
have to manage the open/close lifecycle themselves.
"""

from __future__ import annotations

import asyncio
import inspect
import uuid
from typing import Any, Callable

from .memory import NeotomaMemory, OpenTurnResult


class TurnContext:
    """Context passed to the wrapped agent function."""

    def __init__(self, *, retrieved: list[Any], retrieved_entity_ids: list[str],
                 turn_id: str, conversation_id: str) -> None:
        self.retrieved = retrieved
        self.retrieved_entity_ids = retrieved_entity_ids
        self.turn_id = turn_id
        self.conversation_id = conversation_id


class WithMemoryResult:
    def __init__(self, *, assistant_message: str, ctx: TurnContext) -> None:
        self.assistant_message = assistant_message
        self.ctx = ctx


class WrappedAgent:
    """Sync + async agent wrapper produced by `with_memory`."""

    def __init__(self, agent_fn: Callable[..., Any], memory: NeotomaMemory) -> None:
        self._agent_fn = agent_fn
        self.memory = memory

    def __call__(self, user_message: str, *, turn_id: str | None = None) -> WithMemoryResult:
        t_id = turn_id or str(uuid.uuid4())
        opened: OpenTurnResult = self.memory.open_turn(turn_id=t_id, user_message=user_message)
        ctx = TurnContext(
            retrieved=opened.retrieved,
            retrieved_entity_ids=opened.retrieved_entity_ids,
            turn_id=t_id,
            conversation_id=opened.conversation_id,
        )
        assistant_message: str = self._agent_fn(user_message, ctx)
        self.memory.close_turn(
            turn_id=t_id,
            assistant_message=assistant_message,
            refers_to=opened.retrieved_entity_ids,
        )
        return WithMemoryResult(assistant_message=assistant_message, ctx=ctx)

    async def acall(self, user_message: str, *, turn_id: str | None = None) -> WithMemoryResult:
        t_id = turn_id or str(uuid.uuid4())
        opened = await self.memory.aopen_turn(turn_id=t_id, user_message=user_message)
        ctx = TurnContext(
            retrieved=opened.retrieved,
            retrieved_entity_ids=opened.retrieved_entity_ids,
            turn_id=t_id,
            conversation_id=opened.conversation_id,
        )
        if inspect.iscoroutinefunction(self._agent_fn):
            assistant_message = await self._agent_fn(user_message, ctx)
        else:
            # Run sync callables in a thread so the event loop is not blocked.
            assistant_message = await asyncio.to_thread(self._agent_fn, user_message, ctx)
        await self.memory.aclose_turn(
            turn_id=t_id,
            assistant_message=assistant_message,
            refers_to=opened.retrieved_entity_ids,
        )
        return WithMemoryResult(assistant_message=assistant_message, ctx=ctx)


def with_memory(
    agent_fn: Callable[..., Any],
    *,
    transport: Any,
    conversation_id: str,
    platform: str | None = None,
    client_name: str | None = None,
    conversation_title: str | None = None,
) -> WrappedAgent:
    """Wrap an agent function with the Neotoma store-first turn protocol.

    The wrapped agent receives ``(user_message: str, ctx: TurnContext)``
    and must return the assistant reply as a plain string.

    Example (sync)::

        wrapped = with_memory(
            lambda msg, ctx: my_llm(msg),
            transport=NeotomaClient(base_url=..., token=...),
            conversation_id="conv-2026-05-20",
            platform="my-agent",
        )
        result = wrapped("What do we know about Acme Corp?")
        print(result.assistant_message)

    Example (async)::

        wrapped = with_memory(async_agent_fn, transport=transport, conversation_id="conv-1")
        result = await wrapped.acall("Hello")
    """
    memory = NeotomaMemory(
        transport,
        conversation_id=conversation_id,
        platform=platform,
        client_name=client_name,
        conversation_title=conversation_title,
    )
    return WrappedAgent(agent_fn, memory)
