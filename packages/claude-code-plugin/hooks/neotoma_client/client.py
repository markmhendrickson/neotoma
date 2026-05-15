"""HTTP client for Neotoma's REST API.

Public surface mirrors `@neotoma/client/src/client.ts` and `http.ts`. Uses
`httpx` for sync + async support so hook plugins and agent SDKs can pick
either style.
"""

from __future__ import annotations

from typing import Any

import httpx

from .errors import NeotomaClientError
from .types import (
    CreateRelationshipInput,
    ListObservationsInput,
    ListTimelineEventsInput,
    RetrieveEntitiesInput,
    RetrieveEntityByIdentifierInput,
    RetrieveRelatedEntitiesInput,
    StoreInput,
    StoreResult,
)

DEFAULT_BASE_URL = "http://127.0.0.1:3080"
DEFAULT_TIMEOUT = 30.0


class HttpTransport:
    """Sync + async HTTP transport over httpx.

    Prefer the sync methods for simple hook scripts; prefer the async
    variants inside async agent frameworks (OpenAI Agents SDK, LangGraph).
    """

    def __init__(
        self,
        *,
        base_url: str = DEFAULT_BASE_URL,
        token: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        headers: dict[str, str] | None = None,
        client: httpx.Client | None = None,
        async_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._headers: dict[str, str] = {"Content-Type": "application/json"}
        if token:
            self._headers["Authorization"] = f"Bearer {token}"
        if headers:
            self._headers.update(headers)
        self._timeout = timeout
        self._owns_sync = client is None
        self._owns_async = async_client is None
        self._client = client or httpx.Client(
            base_url=self._base_url,
            headers=self._headers,
            timeout=self._timeout,
        )
        self._async_client = async_client or httpx.AsyncClient(
            base_url=self._base_url,
            headers=self._headers,
            timeout=self._timeout,
        )

    # ------------------------------------------------------------------
    # Core request helpers
    # ------------------------------------------------------------------

    def _post(self, path: str, body: Any) -> Any:
        try:
            response = self._client.post(path, json=body or {})
        except httpx.HTTPError as exc:
            raise NeotomaClientError(f"Network error on POST {path}: {exc}") from exc

        return self._parse_response(response, path)

    async def _post_async(self, path: str, body: Any) -> Any:
        try:
            response = await self._async_client.post(path, json=body or {})
        except httpx.HTTPError as exc:
            raise NeotomaClientError(f"Network error on POST {path}: {exc}") from exc

        return self._parse_response(response, path)

    @staticmethod
    def _parse_response(response: httpx.Response, path: str) -> Any:
        if response.status_code >= 400:
            body: Any = None
            try:
                body = response.json()
            except Exception:
                body = response.text
            raise NeotomaClientError(
                f"Neotoma API {response.status_code} on POST {path}",
                status=response.status_code,
                body=body,
            )

        if response.status_code == 204 or not response.content:
            return None
        try:
            return response.json()
        except Exception:
            return response.text

    # ------------------------------------------------------------------
    # Sync API
    # ------------------------------------------------------------------

    def store(self, input: StoreInput) -> StoreResult:
        return self._post("/store", input)

    def retrieve_entities(self, input: RetrieveEntitiesInput) -> Any:
        return self._post("/entities/query", input)

    def retrieve_entity_by_identifier(self, input: RetrieveEntityByIdentifierInput) -> Any:
        return self._post("/retrieve_entity_by_identifier", input)

    def retrieve_entity_snapshot(self, *, entity_id: str) -> Any:
        return self._post("/get_entity_snapshot", {"entity_id": entity_id})

    def list_observations(self, input: ListObservationsInput) -> Any:
        return self._post("/list_observations", input)

    def list_timeline_events(self, input: ListTimelineEventsInput) -> Any:
        return self._post("/timeline", input)

    def retrieve_related_entities(self, input: RetrieveRelatedEntitiesInput) -> Any:
        return self._post("/retrieve_related_entities", input)

    def create_relationship(self, input: CreateRelationshipInput) -> Any:
        return self._post("/create_relationship", input)

    def correct(self, *, entity_id: str, corrections: dict[str, Any]) -> Any:
        return self._post("/correct", {"entity_id": entity_id, "corrections": corrections})

    def list_entity_types(self, *, search: str | None = None) -> Any:
        body: dict[str, Any] = {}
        if search is not None:
            body["search"] = search
        return self._post("/schemas", body)

    def get_entity_type_counts(self, input: dict[str, Any] | None = None) -> Any:
        return self._post("/stats", input or {})

    def execute_tool(self, name: str, args: Any) -> Any:
        return self._post(f"/{name}", args)

    # ------------------------------------------------------------------
    # Async API (mirrors the sync API method-for-method)
    # ------------------------------------------------------------------

    async def astore(self, input: StoreInput) -> StoreResult:
        return await self._post_async("/store", input)

    async def aretrieve_entities(self, input: RetrieveEntitiesInput) -> Any:
        return await self._post_async("/entities/query", input)

    async def aretrieve_entity_by_identifier(
        self, input: RetrieveEntityByIdentifierInput
    ) -> Any:
        return await self._post_async("/retrieve_entity_by_identifier", input)

    async def aretrieve_entity_snapshot(self, *, entity_id: str) -> Any:
        return await self._post_async("/get_entity_snapshot", {"entity_id": entity_id})

    async def alist_observations(self, input: ListObservationsInput) -> Any:
        return await self._post_async("/list_observations", input)

    async def alist_timeline_events(self, input: ListTimelineEventsInput) -> Any:
        return await self._post_async("/timeline", input)

    async def aretrieve_related_entities(self, input: RetrieveRelatedEntitiesInput) -> Any:
        return await self._post_async("/retrieve_related_entities", input)

    async def acreate_relationship(self, input: CreateRelationshipInput) -> Any:
        return await self._post_async("/create_relationship", input)

    async def acorrect(self, *, entity_id: str, corrections: dict[str, Any]) -> Any:
        return await self._post_async(
            "/correct", {"entity_id": entity_id, "corrections": corrections}
        )

    async def alist_entity_types(self, *, search: str | None = None) -> Any:
        body: dict[str, Any] = {}
        if search is not None:
            body["search"] = search
        return await self._post_async("/schemas", body)

    async def aget_entity_type_counts(self, input: dict[str, Any] | None = None) -> Any:
        return await self._post_async("/stats", input or {})

    async def aexecute_tool(self, name: str, args: Any) -> Any:
        return await self._post_async(f"/{name}", args)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def close(self) -> None:
        if self._owns_sync:
            self._client.close()

    async def aclose(self) -> None:
        if self._owns_async:
            await self._async_client.aclose()

    def __enter__(self) -> "HttpTransport":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    async def __aenter__(self) -> "HttpTransport":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.aclose()


class NeotomaClient(HttpTransport):
    """Convenience alias for the HTTP transport.

    Symmetry with the TypeScript `NeotomaClient`. If additional transports
    (e.g. gRPC or in-process) are added later, this class becomes a
    dispatching facade.
    """

    pass
