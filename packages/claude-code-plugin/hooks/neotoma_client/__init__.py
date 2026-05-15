"""Neotoma Python client.

Public API surface matches the TypeScript `@neotoma/client` package so that
hook plugins written in Python (Claude Code hooks, OpenAI Agents SDK
adapters, LangChain callbacks) can follow the same semantic contract.

The Python client ships with an HTTP transport only. For in-process usage,
the Neotoma engine runs in a separate Node process and is reached via the
REST API.
"""

from .client import NeotomaClient, HttpTransport
from .errors import NeotomaClientError
from .types import (
    CreateRelationshipInput,
    ListObservationsInput,
    ListTimelineEventsInput,
    RetrieveEntitiesInput,
    RetrieveEntityByIdentifierInput,
    RetrieveRelatedEntitiesInput,
    StoreEntityInput,
    StoreInput,
    StoreRelationshipInput,
    StoreResult,
    StoredEntityRef,
)

__all__ = [
    "NeotomaClient",
    "HttpTransport",
    "NeotomaClientError",
    "CreateRelationshipInput",
    "ListObservationsInput",
    "ListTimelineEventsInput",
    "RetrieveEntitiesInput",
    "RetrieveEntityByIdentifierInput",
    "RetrieveRelatedEntitiesInput",
    "StoreEntityInput",
    "StoreInput",
    "StoreRelationshipInput",
    "StoreResult",
    "StoredEntityRef",
]

__version__ = "0.1.0"
