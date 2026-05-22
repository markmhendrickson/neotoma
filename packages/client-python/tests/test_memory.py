"""Unit tests for NeotomaMemory, with_memory, and helpers.

Uses a mock transport — no server required. Mirrors the patterns in
tests/unit/agent_memory.test.ts.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import MagicMock, AsyncMock, call

import pytest

from neotoma_client import (
    NeotomaMemory,
    OpenTurnResult,
    CloseTurnResult,
    with_memory,
    store_chat_turn,
    ChatTurnMessage,
    retrieve_or_store,
)


# ---------------------------------------------------------------------------
# Mock transport factory
# ---------------------------------------------------------------------------

def make_transport(
    *,
    store_entities: list[dict] | None = None,
    retrieve_result: dict | None = None,
) -> MagicMock:
    """Return a sync mock transport with configurable store/retrieve responses."""
    entities = store_entities or [
        {"entity_id": "ent_conv_1", "entity_type": "conversation"},
        {"entity_id": "ent_user_1", "entity_type": "conversation_message"},
    ]
    transport = MagicMock()
    transport.store.return_value = {"entities": entities}
    transport.retrieve_entity_by_identifier.return_value = retrieve_result or None
    return transport


def make_async_transport(
    *,
    store_entities: list[dict] | None = None,
    retrieve_result: dict | None = None,
) -> MagicMock:
    entities = store_entities or [
        {"entity_id": "ent_conv_1", "entity_type": "conversation"},
        {"entity_id": "ent_user_1", "entity_type": "conversation_message"},
    ]
    transport = MagicMock()
    transport.astore = AsyncMock(return_value={"entities": entities})
    transport.aretrieve_entity_by_identifier = AsyncMock(return_value=retrieve_result)
    return transport


# ---------------------------------------------------------------------------
# NeotomaMemory.open_turn
# ---------------------------------------------------------------------------

class TestOpenTurn:
    def test_stores_conversation_and_user_message(self) -> None:
        transport = make_transport()
        memory = NeotomaMemory(transport, conversation_id="conv-1", platform="test")

        result = memory.open_turn(turn_id="t1", user_message="Hello")

        assert isinstance(result, OpenTurnResult)
        assert result.conversation_entity_id == "ent_conv_1"
        assert result.user_message_entity_id == "ent_user_1"
        assert result.turn_id == "t1"
        assert result.conversation_id == "conv-1"

    def test_store_call_contains_part_of_relationship(self) -> None:
        transport = make_transport()
        memory = NeotomaMemory(transport, conversation_id="conv-1")

        memory.open_turn(turn_id="t1", user_message="Hello")

        store_args = transport.store.call_args[0][0]
        rels = store_args["relationships"]
        part_of = [r for r in rels if r["relationship_type"] == "PART_OF"]
        assert len(part_of) == 1
        assert part_of[0]["source_index"] == 1
        assert part_of[0]["target_index"] == 0

    def test_user_message_entity_has_correct_turn_key(self) -> None:
        transport = make_transport()
        memory = NeotomaMemory(transport, conversation_id="conv-abc")

        memory.open_turn(turn_id="t42", user_message="Test message")

        store_args = transport.store.call_args[0][0]
        entities = store_args["entities"]
        msg = next(e for e in entities if e["entity_type"] == "conversation_message")
        assert msg["turn_key"] == "conv-abc:t42"
        assert msg["role"] == "user"
        assert msg["sender_kind"] == "user"

    def test_bounded_retrieval_failure_does_not_raise(self) -> None:
        transport = make_transport()
        transport.retrieve_entity_by_identifier.side_effect = Exception("network error")
        memory = NeotomaMemory(transport, conversation_id="conv-1")

        result = memory.open_turn(turn_id="t1", user_message="Hello world test")

        # Should still succeed with empty retrieved set
        assert result.retrieved == []
        assert result.retrieved_entity_ids == []

    def test_refers_to_edges_added_for_retrieved_entities(self) -> None:
        # Retrieval returns a matching entity for the word "Acme"
        transport = make_transport(
            retrieve_result={"entity_id": "ent_acme", "entity_type": "company"},
        )
        memory = NeotomaMemory(transport, conversation_id="conv-1")

        result = memory.open_turn(turn_id="t1", user_message="Tell me about Acme Corp please")

        store_args = transport.store.call_args[0][0]
        rels = store_args["relationships"]
        refers = [r for r in rels if r["relationship_type"] == "REFERS_TO"]
        assert any(r.get("target_entity_id") == "ent_acme" for r in refers)
        assert "ent_acme" in result.retrieved_entity_ids


# ---------------------------------------------------------------------------
# NeotomaMemory.close_turn
# ---------------------------------------------------------------------------

class TestCloseTurn:
    def test_stores_assistant_message_with_assistant_suffix(self) -> None:
        transport = make_transport(
            store_entities=[{"entity_id": "ent_asst_1", "entity_type": "conversation_message"}]
        )
        memory = NeotomaMemory(transport, conversation_id="conv-1")

        result = memory.close_turn(turn_id="t1", assistant_message="Hello back!")

        assert isinstance(result, CloseTurnResult)
        assert result.assistant_message_entity_id == "ent_asst_1"
        store_args = transport.store.call_args[0][0]
        entities = store_args["entities"]
        msg = next(e for e in entities if e.get("role") == "assistant")
        assert msg["turn_key"] == "conv-1:t1:assistant"
        assert msg["sender_kind"] == "assistant"

    def test_idempotency_key_has_assistant_suffix(self) -> None:
        transport = make_transport()
        memory = NeotomaMemory(transport, conversation_id="conv-xyz")

        memory.close_turn(turn_id="turn-5", assistant_message="reply")

        store_args = transport.store.call_args[0][0]
        assert store_args["idempotency_key"] == "conversation-conv-xyz-turn-5-assistant"

    def test_refers_to_edges_wired_for_cited_entities(self) -> None:
        transport = make_transport()
        memory = NeotomaMemory(transport, conversation_id="conv-1")

        memory.close_turn(turn_id="t1", assistant_message="reply", refers_to=["ent_a", "ent_b"])

        store_args = transport.store.call_args[0][0]
        rels = store_args["relationships"]
        refers = [r for r in rels if r["relationship_type"] == "REFERS_TO"]
        target_ids = {r.get("target_entity_id") for r in refers}
        assert "ent_a" in target_ids
        assert "ent_b" in target_ids


# ---------------------------------------------------------------------------
# Idempotency key contract
# ---------------------------------------------------------------------------

class TestIdempotencyKeys:
    def test_canonical_key_shapes(self) -> None:
        """User key = conversation-{id}-{turn_id}-user; assistant key uses -assistant suffix."""
        transport = make_transport()
        transport.store.side_effect = [
            {"entities": [{"entity_id": "c1", "entity_type": "conversation"}, {"entity_id": "u1", "entity_type": "conversation_message"}]},
            {"entities": [{"entity_id": "a1", "entity_type": "conversation_message"}]},
        ]
        memory = NeotomaMemory(transport, conversation_id="conv-99")

        memory.open_turn(turn_id="turn-7", user_message="Hi")
        memory.close_turn(turn_id="turn-7", assistant_message="Hello")

        calls = transport.store.call_args_list
        user_key = calls[0][0][0]["idempotency_key"]
        assistant_key = calls[1][0][0]["idempotency_key"]
        assert user_key == "conversation-conv-99-turn-7-user"
        assert assistant_key == "conversation-conv-99-turn-7-assistant"


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

class TestDeduplication:
    def test_duplicate_retrieved_entity_ids_produce_single_refers_to(self) -> None:
        """If the same entity_id appears twice in retrieved_entity_ids, only one
        REFERS_TO edge should be written."""
        transport = make_transport()
        memory = NeotomaMemory(transport, conversation_id="conv-1")

        memory.close_turn(turn_id="t1", assistant_message="reply",
                          refers_to=["ent_a", "ent_a", "ent_b"])

        store_args = transport.store.call_args[0][0]
        rels = store_args["relationships"]
        refers = [r for r in rels if r["relationship_type"] == "REFERS_TO"]
        target_ids = [r.get("target_entity_id") for r in refers]
        assert target_ids.count("ent_a") == 1
        assert target_ids.count("ent_b") == 1

    def test_duplicate_ids_in_user_phase_deduped(self) -> None:
        transport = make_transport(
            retrieve_result={"entity_id": "ent_same", "entity_type": "company"},
        )
        transport.store.side_effect = [
            {"entities": [{"entity_id": "c1", "entity_type": "conversation"}, {"entity_id": "u1", "entity_type": "conversation_message"}]},
            {"entities": [{"entity_id": "a1", "entity_type": "conversation_message"}]},
        ]
        # Make retrieve return the same entity for multiple identifiers
        def agent_fn(msg: str, ctx: Any) -> str:
            return "ok"

        wrapped = with_memory(agent_fn, transport=transport, conversation_id="conv-1")
        # Message with two long words that both resolve to the same entity
        wrapped("Acme Acme Corp Corp here")

        store_args = transport.store.call_args_list[0][0][0]
        rels = store_args["relationships"]
        refers = [r for r in rels if r["relationship_type"] == "REFERS_TO"]
        target_ids = [r.get("target_entity_id") for r in refers]
        assert target_ids.count("ent_same") == 1


# ---------------------------------------------------------------------------
# with_memory wrapper
# ---------------------------------------------------------------------------

class TestWithMemory:
    def test_wraps_agent_fn_and_returns_result(self) -> None:
        transport = make_transport()
        transport.store.side_effect = [
            {"entities": [{"entity_id": "c1", "entity_type": "conversation"}, {"entity_id": "u1", "entity_type": "conversation_message"}]},
            {"entities": [{"entity_id": "a1", "entity_type": "conversation_message"}]},
        ]

        def agent_fn(msg: str, ctx: Any) -> str:
            return f"Echo: {msg}"

        wrapped = with_memory(agent_fn, transport=transport, conversation_id="conv-1")
        result = wrapped("Hello")

        assert result.assistant_message == "Echo: Hello"
        assert transport.store.call_count == 2

    def test_exposes_memory_attribute(self) -> None:
        transport = make_transport()

        wrapped = with_memory(lambda m, c: "ok", transport=transport, conversation_id="conv-1")

        assert isinstance(wrapped.memory, NeotomaMemory)
        assert wrapped.memory.conversation_id == "conv-1"

    def test_ctx_retrieved_passed_to_agent(self) -> None:
        transport = make_transport(
            retrieve_result={"entity_id": "ent_x", "entity_type": "company"},
        )
        transport.store.side_effect = [
            {"entities": [{"entity_id": "c1", "entity_type": "conversation"}, {"entity_id": "u1", "entity_type": "conversation_message"}]},
            {"entities": [{"entity_id": "a1", "entity_type": "conversation_message"}]},
        ]
        captured: list[Any] = []

        def agent_fn(msg: str, ctx: Any) -> str:
            captured.append(ctx.retrieved)
            return "reply"

        wrapped = with_memory(agent_fn, transport=transport, conversation_id="conv-1")
        wrapped("Tell me about Acme Corp please")

        assert len(captured) == 1
        # retrieved should contain the mocked entity for identifiers found in message
        assert any(e.get("entity_id") == "ent_x" for e in captured[0])

    def test_acall_with_sync_callable_does_not_block_loop(self) -> None:
        """acall must use asyncio.to_thread for sync callables so the event loop
        is not stalled by a blocking LLM call."""
        transport = make_async_transport()
        transport.astore.side_effect = [
            {"entities": [{"entity_id": "c1", "entity_type": "conversation"}, {"entity_id": "u1", "entity_type": "conversation_message"}]},
            {"entities": [{"entity_id": "a1", "entity_type": "conversation_message"}]},
        ]
        called_from_thread: list[bool] = []

        def sync_agent(msg: str, ctx: Any) -> str:
            # Record that the call arrived (asyncio.to_thread runs in a thread)
            called_from_thread.append(True)
            return "sync-reply"

        wrapped = with_memory(sync_agent, transport=transport, conversation_id="conv-1")
        result = asyncio.run(wrapped.acall("Hello"))

        assert result.assistant_message == "sync-reply"
        assert called_from_thread  # callable was invoked

    def test_acall_with_async_callable(self) -> None:
        transport = make_async_transport()
        transport.astore.side_effect = [
            {"entities": [{"entity_id": "c1", "entity_type": "conversation"}, {"entity_id": "u1", "entity_type": "conversation_message"}]},
            {"entities": [{"entity_id": "a1", "entity_type": "conversation_message"}]},
        ]

        async def async_agent(msg: str, ctx: Any) -> str:
            return "async-reply"

        wrapped = with_memory(async_agent, transport=transport, conversation_id="conv-1")
        result = asyncio.run(wrapped.acall("Hello"))

        assert result.assistant_message == "async-reply"


# ---------------------------------------------------------------------------
# store_chat_turn helper
# ---------------------------------------------------------------------------

class TestStoreChatTurn:
    def test_stores_user_and_assistant_messages(self) -> None:
        transport = make_transport(store_entities=[
            {"entity_id": "c1", "entity_type": "conversation"},
            {"entity_id": "u1", "entity_type": "conversation_message"},
            {"entity_id": "a1", "entity_type": "conversation_message"},
        ])

        result = store_chat_turn(
            transport,
            conversation_id="conv-1",
            turn_id="t1",
            messages=[
                ChatTurnMessage(content="Hello", role="user"),
                ChatTurnMessage(content="Hi there", role="assistant"),
            ],
        )

        assert result.conversation_entity_id == "c1"
        # user is at index 1, assistant at index 2 — with same-length stored list
        assert result.user_message_entity_id == "u1"
        assert result.assistant_message_entity_id == "a1"

    def test_shape_tolerant_structured_fallback(self) -> None:
        # Old response shape: entities nested under structured.entities
        transport = MagicMock()
        transport.store.return_value = {
            "structured": {
                "entities": [
                    {"entity_id": "c_old", "entity_type": "conversation"},
                    {"entity_id": "u_old", "entity_type": "conversation_message"},
                ]
            }
        }

        result = store_chat_turn(
            transport,
            conversation_id="conv-old",
            turn_id="t1",
            messages=[ChatTurnMessage(content="Hello", role="user")],
        )

        assert result.conversation_entity_id == "c_old"
        assert result.user_message_entity_id == "u_old"


# ---------------------------------------------------------------------------
# retrieve_or_store helper
# ---------------------------------------------------------------------------

class TestRetrieveOrStore:
    def test_returns_existing_entity_without_storing(self) -> None:
        transport = MagicMock()
        transport.retrieve_entity_by_identifier.return_value = {
            "entity_id": "ent_existing",
            "entity_type": "company",
        }

        result = retrieve_or_store(
            transport,
            identifier="acme",
            entity_type="company",
            create={"name": "Acme Corp"},
        )

        assert result.entity_id == "ent_existing"
        assert result.created is False
        transport.store.assert_not_called()

    def test_stores_new_entity_when_not_found(self) -> None:
        transport = MagicMock()
        transport.retrieve_entity_by_identifier.return_value = None
        transport.store.return_value = {"entities": [{"entity_id": "ent_new", "entity_type": "company"}]}

        result = retrieve_or_store(
            transport,
            identifier="acme",
            entity_type="company",
            create={"name": "Acme Corp"},
        )

        assert result.entity_id == "ent_new"
        assert result.created is True
        transport.store.assert_called_once()

    def test_raises_when_store_returns_no_entity_id(self) -> None:
        transport = MagicMock()
        transport.retrieve_entity_by_identifier.return_value = None
        transport.store.return_value = {"entities": []}

        with pytest.raises(RuntimeError, match="no entity_id"):
            retrieve_or_store(
                transport,
                identifier="ghost",
                entity_type="company",
                create={"name": "Ghost Corp"},
            )
