"""Shared typed dict definitions.

Mirrors `@neotoma/client/src/types.ts`. See `docs/specs/MCP_SPEC.md` and
`openapi.yaml` for action semantics.
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict


class StoreEntityInput(TypedDict, total=False):
    """An entity to be stored. `entity_type` is required; other fields are free-form."""

    entity_type: str


class StoreRelationshipInput(TypedDict, total=False):
    relationship_type: str
    source_index: int
    target_index: int
    source_entity_id: str
    target_entity_id: str


class StoreInput(TypedDict, total=False):
    entities: list[StoreEntityInput]
    relationships: list[StoreRelationshipInput]
    idempotency_key: str
    file_path: str
    file_content: str
    mime_type: str
    file_idempotency_key: str
    original_filename: str


class StoredEntityRef(TypedDict, total=False):
    entity_id: str
    entity_type: str
    action: str  # "created" | "updated"


class _StoreResultStructured(TypedDict, total=False):
    entities: list[StoredEntityRef]
    relationships: list[Any]


class _StoreResultUnstructured(TypedDict, total=False):
    asset_entity_id: str
    source_id: str


class StoreResult(TypedDict, total=False):
    structured: _StoreResultStructured
    unstructured: _StoreResultUnstructured


class RetrieveEntitiesInput(TypedDict, total=False):
    entity_type: str
    limit: int
    offset: int
    since: str
    until: str


class RetrieveEntityByIdentifierInput(TypedDict, total=False):
    identifier: str
    entity_type: str


class CreateRelationshipInput(TypedDict):
    relationship_type: str
    source_entity_id: str
    target_entity_id: str


class ListObservationsInput(TypedDict, total=False):
    entity_id: str
    limit: int
    offset: int


class ListTimelineEventsInput(TypedDict, total=False):
    since: str
    until: str
    limit: int


class RetrieveRelatedEntitiesInput(TypedDict, total=False):
    entity_id: str
    relationship_type: str
    direction: Literal["outgoing", "incoming", "both"]
    limit: int
