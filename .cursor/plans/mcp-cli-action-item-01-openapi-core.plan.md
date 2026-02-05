---
name: ""
overview: ""
todos: []
isProject: false
---

# Action item 1 plan: contract authority

## Context summary

OpenAPI lives in `openapi.yaml`. MCP tool schemas live in `src/server.ts` and `docs/specs/MCP_SPEC.md`. The report calls for a single contract source of truth.

## Key problems solved

- MCP tool schemas can drift from OpenAPI.
- Contract authority is split across code and docs.

## Key solutions implemented

- Select a single contract source of truth.
- Generate secondary artifacts from that source.

## Plan

1. Decide contract authority direction. Use OpenAPI as the source or use MCP schemas as the source.
2. Define a generator pipeline. Generate MCP tool schemas or generate OpenAPI from MCP schemas.
3. Update `src/server.ts` to use the generated tool schemas instead of hand-written schemas.
4. Update `docs/specs/MCP_SPEC.md` to be generated from the same source or to reference the generated output.
5. Add drift tests that compare MCP tool schemas, OpenAPI, and docs for parity.
