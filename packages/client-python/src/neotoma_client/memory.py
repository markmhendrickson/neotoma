"""Protocol-enforcing memory harness for Python agents.

Mirrors `@neotoma/agent/src/memory.ts`. Provides `NeotomaMemory` with
explicit `open_turn` / `close_turn` lifecycle (sync and async) so Python
agent loops get correct Neotoma store-first behavior without implementing
the rules themselves.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from .helpers import _extract_entities, _lookup_by_index
from .types import StoreEntityInput, StoreRelationshipInput

_log = logging.getLogger(__name__)


@dataclass
class OpenTurnResult:
    conversation_id: str
    turn_id: str
    retrieved: list[Any]
    retrieved_entity_ids: list[str]
    conversation_entity_id: str
    user_message_entity_id: str | None


@dataclass
class CloseTurnResult:
    turn_id: str
    assistant_message_entity_id: str | None


class NeotomaMemory:
    """Enforces the canonical Neotoma store-first turn protocol.

    Usage (explicit lifecycle)::

        memory = NeotomaMemory(transport, conversation_id="conv-123", platform="my-agent")
        opened = memory.open_turn(turn_id="t1", user_message="Hello")
        reply = my_agent(opened.retrieved)
        memory.close_turn(turn_id="t1", assistant_message=reply,
                          refers_to=opened.retrieved_entity_ids)

    Usage (async)::

        opened = await memory.aopen_turn(turn_id="t1", user_message="Hello")
        reply = await my_agent(opened.retrieved)
        await memory.aclose_turn(turn_id="t1", assistant_message=reply,
                                 refers_to=opened.retrieved_entity_ids)
    """

    def __init__(
        self,
        transport: Any,
        *,
        conversation_id: str,
        platform: str | None = None,
        client_name: str | None = None,
        conversation_title: str | None = None,
    ) -> None:
        self._transport = transport
        self.conversation_id = conversation_id
        self._platform = platform
        self._client_name = client_name
        self._conversation_title = conversation_title

    # ------------------------------------------------------------------
    # Sync API
    # ------------------------------------------------------------------

    def open_turn(
        self,
        *,
        turn_id: str,
        user_message: str,
        turn_number: int | None = None,
    ) -> OpenTurnResult:
        """Step 1 (bounded retrieval) + Step 2 (user-phase store)."""
        retrieved, retrieved_ids = self._bounded_retrieval(user_message)
        conv_id, user_msg_id = self._store_user_turn(
            turn_id=turn_id,
            user_message=user_message,
            retrieved_entity_ids=retrieved_ids,
            turn_number=turn_number,
        )
        return OpenTurnResult(
            conversation_id=self.conversation_id,
            turn_id=turn_id,
            retrieved=retrieved,
            retrieved_entity_ids=retrieved_ids,
            conversation_entity_id=conv_id,
            user_message_entity_id=user_msg_id,
        )

    def close_turn(
        self,
        *,
        turn_id: str,
        assistant_message: str,
        refers_to: list[str] | None = None,
        turn_number: int | None = None,
    ) -> CloseTurnResult:
        """Step 5 (closing store of assistant reply)."""
        asst_msg_id = self._store_assistant_turn(
            turn_id=turn_id,
            assistant_message=assistant_message,
            refers_to=refers_to or [],
            turn_number=turn_number,
        )
        return CloseTurnResult(turn_id=turn_id, assistant_message_entity_id=asst_msg_id)

    # ------------------------------------------------------------------
    # Async API
    # ------------------------------------------------------------------

    async def aopen_turn(
        self,
        *,
        turn_id: str,
        user_message: str,
        turn_number: int | None = None,
    ) -> OpenTurnResult:
        retrieved, retrieved_ids = await self._abounded_retrieval(user_message)
        conv_id, user_msg_id = await self._astore_user_turn(
            turn_id=turn_id,
            user_message=user_message,
            retrieved_entity_ids=retrieved_ids,
            turn_number=turn_number,
        )
        return OpenTurnResult(
            conversation_id=self.conversation_id,
            turn_id=turn_id,
            retrieved=retrieved,
            retrieved_entity_ids=retrieved_ids,
            conversation_entity_id=conv_id,
            user_message_entity_id=user_msg_id,
        )

    async def aclose_turn(
        self,
        *,
        turn_id: str,
        assistant_message: str,
        refers_to: list[str] | None = None,
        turn_number: int | None = None,
    ) -> CloseTurnResult:
        asst_msg_id = await self._astore_assistant_turn(
            turn_id=turn_id,
            assistant_message=assistant_message,
            refers_to=refers_to or [],
            turn_number=turn_number,
        )
        return CloseTurnResult(turn_id=turn_id, assistant_message_entity_id=asst_msg_id)

    # ------------------------------------------------------------------
    # Internal helpers — sync
    # ------------------------------------------------------------------

    def _bounded_retrieval(self, user_message: str) -> tuple[list[Any], list[str]]:
        words = [w.strip(",.!?;:\"'()") for w in user_message.split() if len(w) > 3]
        identifiers = list(dict.fromkeys(words))[:5]
        retrieved: list[Any] = []
        for ident in identifiers:
            try:
                result = self._transport.retrieve_entity_by_identifier({"identifier": ident})
                if result and isinstance(result, dict) and result.get("entity_id"):
                    retrieved.append(result)
            except Exception as exc:
                _log.debug("bounded_retrieval: identifier=%r error=%r", ident, exc)
        ids = [e["entity_id"] for e in retrieved if e.get("entity_id")]
        return retrieved, ids

    def _store_user_turn(
        self,
        *,
        turn_id: str,
        user_message: str,
        retrieved_entity_ids: list[str],
        turn_number: int | None,
    ) -> tuple[str, str | None]:
        entities, relationships = self._build_user_phase(
            turn_id=turn_id,
            user_message=user_message,
            retrieved_entity_ids=retrieved_entity_ids,
            turn_number=turn_number,
        )
        result = self._transport.store({
            "entities": entities,
            "relationships": relationships,
            "idempotency_key": f"conversation-{self.conversation_id}-{turn_id}-user",
        })
        return self._parse_user_store(result, len(entities))

    def _store_assistant_turn(
        self,
        *,
        turn_id: str,
        assistant_message: str,
        refers_to: list[str],
        turn_number: int | None = None,
    ) -> str | None:
        entities, relationships = self._build_assistant_phase(
            turn_id=turn_id,
            assistant_message=assistant_message,
            refers_to=refers_to,
            turn_number=turn_number,
        )
        result = self._transport.store({
            "entities": entities,
            "relationships": relationships,
            "idempotency_key": f"conversation-{self.conversation_id}-{turn_id}-assistant",
        })
        stored = _extract_entities(result)
        return stored[0].get("entity_id") if stored else None

    # ------------------------------------------------------------------
    # Internal helpers — async
    # ------------------------------------------------------------------

    async def _abounded_retrieval(self, user_message: str) -> tuple[list[Any], list[str]]:
        words = [w.strip(",.!?;:\"'()") for w in user_message.split() if len(w) > 3]
        identifiers = list(dict.fromkeys(words))[:5]
        retrieved: list[Any] = []
        for ident in identifiers:
            try:
                result = await self._transport.aretrieve_entity_by_identifier({"identifier": ident})
                if result and isinstance(result, dict) and result.get("entity_id"):
                    retrieved.append(result)
            except Exception as exc:
                _log.debug("abounded_retrieval: identifier=%r error=%r", ident, exc)
        ids = [e["entity_id"] for e in retrieved if e.get("entity_id")]
        return retrieved, ids

    async def _astore_user_turn(
        self,
        *,
        turn_id: str,
        user_message: str,
        retrieved_entity_ids: list[str],
        turn_number: int | None,
    ) -> tuple[str, str | None]:
        entities, relationships = self._build_user_phase(
            turn_id=turn_id,
            user_message=user_message,
            retrieved_entity_ids=retrieved_entity_ids,
            turn_number=turn_number,
        )
        result = await self._transport.astore({
            "entities": entities,
            "relationships": relationships,
            "idempotency_key": f"conversation-{self.conversation_id}-{turn_id}-user",
        })
        return self._parse_user_store(result, len(entities))

    async def _astore_assistant_turn(
        self,
        *,
        turn_id: str,
        assistant_message: str,
        refers_to: list[str],
        turn_number: int | None = None,
    ) -> str | None:
        entities, relationships = self._build_assistant_phase(
            turn_id=turn_id,
            assistant_message=assistant_message,
            refers_to=refers_to,
            turn_number=turn_number,
        )
        result = await self._transport.astore({
            "entities": entities,
            "relationships": relationships,
            "idempotency_key": f"conversation-{self.conversation_id}-{turn_id}-assistant",
        })
        stored = _extract_entities(result)
        return stored[0].get("entity_id") if stored else None

    # ------------------------------------------------------------------
    # Shared builders
    # ------------------------------------------------------------------

    def _build_user_phase(
        self,
        *,
        turn_id: str,
        user_message: str,
        retrieved_entity_ids: list[str],
        turn_number: int | None,
    ) -> tuple[list[StoreEntityInput], list[StoreRelationshipInput]]:
        conv_entity: StoreEntityInput = {
            "entity_type": "conversation",
            "conversation_id": self.conversation_id,
            "title": self._conversation_title or f"Conversation {self.conversation_id}",
        }
        if self._platform:
            conv_entity["platform"] = self._platform  # type: ignore[typeddict-unknown-key]
            conv_entity["harness"] = self._platform  # type: ignore[typeddict-unknown-key]
        if self._client_name:
            conv_entity["client_name"] = self._client_name  # type: ignore[typeddict-unknown-key]

        msg_entity: StoreEntityInput = {
            "entity_type": "conversation_message",
            "role": "user",
            "sender_kind": "user",
            "content": user_message,
            "turn_key": f"{self.conversation_id}:{turn_id}",
        }
        if turn_number is not None:
            msg_entity["turn_number"] = turn_number  # type: ignore[typeddict-unknown-key]
        if self._platform:
            msg_entity["platform"] = self._platform  # type: ignore[typeddict-unknown-key]

        entities: list[StoreEntityInput] = [conv_entity, msg_entity]
        relationships: list[StoreRelationshipInput] = [
            {"relationship_type": "PART_OF", "source_index": 1, "target_index": 0}
        ]
        # Deduplicate: same entity_id appearing twice would write two REFERS_TO edges.
        for entity_id in dict.fromkeys(retrieved_entity_ids):
            relationships.append({
                "relationship_type": "REFERS_TO",
                "source_index": 1,
                "target_entity_id": entity_id,
            })
        return entities, relationships

    def _build_assistant_phase(
        self,
        *,
        turn_id: str,
        assistant_message: str,
        refers_to: list[str],
        turn_number: int | None = None,
    ) -> tuple[list[StoreEntityInput], list[StoreRelationshipInput]]:
        conv_entity: StoreEntityInput = {
            "entity_type": "conversation",
            "conversation_id": self.conversation_id,
        }
        msg_entity: StoreEntityInput = {
            "entity_type": "conversation_message",
            "role": "assistant",
            "sender_kind": "assistant",
            "content": assistant_message,
            "turn_key": f"{self.conversation_id}:{turn_id}:assistant",
        }
        if turn_number is not None:
            msg_entity["turn_number"] = turn_number  # type: ignore[typeddict-unknown-key]
        if self._platform:
            msg_entity["platform"] = self._platform  # type: ignore[typeddict-unknown-key]

        entities: list[StoreEntityInput] = [conv_entity, msg_entity]
        relationships: list[StoreRelationshipInput] = [
            {"relationship_type": "PART_OF", "source_index": 1, "target_index": 0}
        ]
        # Deduplicate: same entity_id appearing twice would write two REFERS_TO edges.
        for entity_id in dict.fromkeys(refers_to):
            relationships.append({
                "relationship_type": "REFERS_TO",
                "source_index": 1,
                "target_entity_id": entity_id,
            })
        return entities, relationships

    def _parse_user_store(
        self, result: Any, entity_count: int
    ) -> tuple[str, str | None]:
        stored = _extract_entities(result)
        conv_id = (
            _lookup_by_index(stored, entity_count, 0)
            or next((e.get("entity_id", "") for e in stored if e.get("entity_type") == "conversation"), "")
        )
        user_msg_id = _lookup_by_index(stored, entity_count, 1)
        return conv_id, user_msg_id
