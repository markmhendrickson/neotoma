# v0.18.1 Release Supplement

## Summary

Patch release that connects the two last-mile pipes on v0.18.0 **by-reference source storage** (#1775), so it is reachable over HTTP and through the natural "file + its entities" call shape. Both gaps were found by a developer-release evaluator who validated the engine end-to-end (zero-byte writes, `SOURCE_UNAVAILABLE` / `SOURCE_REFERENCE_STALE` drift cases) against a production DB.

## Fixes

- **By-reference storage reachable over HTTP (#1826).** `source_storage` was missing from `openapi.yaml` `StoreRequest` (which is `additionalProperties: false`), so the edge guard rejected `POST /store` with `ERR_UNKNOWN_FIELD` — the field only worked over the `/mcp` route. Added `source_storage` (`enum: [inline, reference]`) to the HTTP contract and regenerated `openapi_types.ts`.
- **No more silent inline fallback with `entities[]` + file (#1827).** `store({ entities, file_path, source_storage: "reference" })` silently stored **inline** and copied the bytes, because the `hasEntities && hasUnstructured` branches recursed into `store()` for the file leg without forwarding `source_storage`. It is now propagated, so the natural "file + its entities" call stores by reference as intended.

## Behavior changes

- Both surfaces (HTTP `POST /store` and the file+entities call shape) now honor `source_storage: "reference"` identically to the single-file MCP path. No other behavior change; `inline` remains the default.

## Breaking changes

- None.
