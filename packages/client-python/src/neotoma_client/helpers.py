"""High-level helpers for Python agents using Neotoma.

Mirrors `@neotoma/client/src/helpers.ts`. Provides store-first primitives
that encode the turn-lifecycle obligations agents must honor.
"""

from __future__ import annotations

import uuid
from typing import Any, Literal

from .types import StoreEntityInput, StoreRelationshipInput, StoredEntityRef

# Shape-tolerant entity extraction — server returns entities at top level
# (result["entities"]); older response shapes nested under structured.entities.
# Tolerate both. See neotoma#316.
def _extract_entities(result: Any) -> list[StoredEntityRef]:
    if isinstance(result, dict):
        if "entities" in result:
            return result["entities"] or []
        structured = result.get("structured") or {}
        if "entities" in structured:
            return structured["entities"] or []
    return []


def _lookup_by_index(
    stored: list[StoredEntityRef],
    input_len: int,
    i: int,
) -> str | None:
    """Return entity_id for input index i, preferring observation_index alignment."""
    by_input_index: dict[int, StoredEntityRef] = {}
    for e in stored:
        idx = e.get("observation_index")  # type: ignore[call-overload]
        if isinstance(idx, int):
            by_input_index[idx] = e

    direct = by_input_index.get(i)
    if direct and direct.get("entity_id"):
        return direct["entity_id"]
    if len(stored) == input_len:
        e = stored[i] if i < len(stored) else None
        return e.get("entity_id") if e else None
    return None


# ---------------------------------------------------------------------------
# store_chat_turn
# ---------------------------------------------------------------------------

ChatTurnSenderKind = Literal["user", "assistant", "agent", "system", "tool"]


class ChatTurnMessage:
    def __init__(
        self,
        *,
        content: str,
        role: Literal["user", "assistant"],
        sender_kind: ChatTurnSenderKind | None = None,
        sender_agent_id: str | None = None,
        recipient_agent_id: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        self.content = content
        self.role = role
        self.sender_kind = sender_kind or role
        self.sender_agent_id = sender_agent_id
        self.recipient_agent_id = recipient_agent_id
        self.extra = extra or {}


class StoreChatTurnResult:
    def __init__(
        self,
        *,
        conversation_entity_id: str,
        user_message_entity_id: str | None,
        assistant_message_entity_id: str | None,
        store_result: Any,
    ) -> None:
        self.conversation_entity_id = conversation_entity_id
        self.user_message_entity_id = user_message_entity_id
        self.assistant_message_entity_id = assistant_message_entity_id
        self.store_result = store_result


def store_chat_turn(
    transport: Any,
    *,
    conversation_id: str,
    turn_id: str,
    messages: list[ChatTurnMessage],
    turn_number: int | None = None,
    conversation_title: str | None = None,
    platform: str | None = None,
    client_name: str | None = None,
    workspace_kind: str | None = None,
    repository_name: str | None = None,
    repository_root: str | None = None,
    repository_remote: str | None = None,
    scope_summary: str | None = None,
    model: str | None = None,
    idempotency_key_prefix: str | None = None,
    conversation_extra: dict[str, Any] | None = None,
) -> StoreChatTurnResult:
    """Store a single logical turn (user + assistant messages) in Neotoma.

    Idempotent per (conversation_id, turn_id).
    """
    turn_key_base = f"{conversation_id}:{turn_id}"
    key_prefix = idempotency_key_prefix or f"conversation-{conversation_id}-{turn_id}"

    conv_entity: StoreEntityInput = {
        "entity_type": "conversation",
        "conversation_id": conversation_id,
        "title": conversation_title or f"Conversation {conversation_id}",
    }
    if platform:
        conv_entity["platform"] = platform  # type: ignore[typeddict-unknown-key]
    if client_name:
        conv_entity["client_name"] = client_name  # type: ignore[typeddict-unknown-key]
    if workspace_kind:
        conv_entity["workspace_kind"] = workspace_kind  # type: ignore[typeddict-unknown-key]
    if repository_name:
        conv_entity["repository_name"] = repository_name  # type: ignore[typeddict-unknown-key]
    if repository_root:
        conv_entity["repository_root"] = repository_root  # type: ignore[typeddict-unknown-key]
    if repository_remote:
        conv_entity["repository_remote"] = repository_remote  # type: ignore[typeddict-unknown-key]
    if scope_summary:
        conv_entity["scope_summary"] = scope_summary  # type: ignore[typeddict-unknown-key]
    if conversation_extra:
        conv_entity.update(conversation_extra)  # type: ignore[typeddict-item]

    entities: list[StoreEntityInput] = [conv_entity]
    relationships: list[StoreRelationshipInput] = []
    index_by_role: dict[str, int] = {}

    for message in messages:
        suffix = "" if message.role == "user" else ":assistant"
        idx = len(entities)
        index_by_role[message.role] = idx
        msg_entity: StoreEntityInput = {
            "entity_type": "conversation_message",
            "role": message.role,
            "sender_kind": message.sender_kind,
            "content": message.content,
            "turn_key": f"{turn_key_base}{suffix}",
        }
        if turn_number is not None:
            msg_entity["turn_number"] = turn_number  # type: ignore[typeddict-unknown-key]
        if platform:
            msg_entity["platform"] = platform  # type: ignore[typeddict-unknown-key]
        if model:
            msg_entity["model"] = model  # type: ignore[typeddict-unknown-key]
        if message.sender_agent_id:
            msg_entity["sender_agent_id"] = message.sender_agent_id  # type: ignore[typeddict-unknown-key]
        if message.recipient_agent_id:
            msg_entity["recipient_agent_id"] = message.recipient_agent_id  # type: ignore[typeddict-unknown-key]
        msg_entity.update(message.extra)  # type: ignore[typeddict-item]
        entities.append(msg_entity)
        relationships.append({
            "relationship_type": "PART_OF",
            "source_index": idx,
            "target_index": 0,
        })

    store_result = transport.store({
        "entities": entities,
        "relationships": relationships,
        "idempotency_key": f"{key_prefix}-turn",
    })

    stored = _extract_entities(store_result)

    conversation_entity_id = (
        _lookup_by_index(stored, len(entities), 0)
        or next((e.get("entity_id", "") for e in stored if e.get("entity_type") == "conversation"), "")
    )

    user_idx = index_by_role.get("user")
    assistant_idx = index_by_role.get("assistant")

    return StoreChatTurnResult(
        conversation_entity_id=conversation_entity_id,
        user_message_entity_id=_lookup_by_index(stored, len(entities), user_idx) if user_idx is not None else None,
        assistant_message_entity_id=_lookup_by_index(stored, len(entities), assistant_idx) if assistant_idx is not None else None,
        store_result=store_result,
    )


# ---------------------------------------------------------------------------
# retrieve_or_store
# ---------------------------------------------------------------------------

class RetrieveOrStoreResult:
    def __init__(self, *, entity_id: str, created: bool, existing: Any = None) -> None:
        self.entity_id = entity_id
        self.created = created
        self.existing = existing


def retrieve_or_store(
    transport: Any,
    *,
    identifier: str,
    entity_type: str,
    create: dict[str, Any],
    idempotency_key: str | None = None,
) -> RetrieveOrStoreResult:
    """Retrieve-before-write: return existing entity_id or store and return new one."""
    existing: Any = None
    try:
        existing = transport.retrieve_entity_by_identifier({
            "identifier": identifier,
            "entity_type": entity_type,
        })
    except Exception:
        existing = None

    existing_id: str | None = None
    if isinstance(existing, dict):
        existing_id = existing.get("entity_id") or (existing.get("entity") or {}).get("entity_id")
    if existing_id:
        return RetrieveOrStoreResult(entity_id=existing_id, created=False, existing=existing)

    result = transport.store({
        "entities": [{"entity_type": entity_type, **create}],
        "idempotency_key": idempotency_key or f"{entity_type}-{identifier}",
    })
    stored_list = _extract_entities(result)
    stored = stored_list[0] if stored_list else None
    if not stored or not stored.get("entity_id"):
        raise RuntimeError(
            f"retrieve_or_store: store returned no entity_id for "
            f"{entity_type} identifier={identifier}"
        )
    return RetrieveOrStoreResult(entity_id=stored["entity_id"], created=True)
