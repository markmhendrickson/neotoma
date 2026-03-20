# ChatGPT App Readiness Audit

This audit maps Neotoma's current MCP/Actions implementation to ChatGPT App requirements and defines a practical MVP scope.

## Scope

- Target: ChatGPT Apps connector flow (Apps SDK-compatible MCP over HTTPS).
- Non-goal: replacing Custom GPT Actions. Actions should continue to work.

## Capability Matrix

| Area | Requirement | Current State | Evidence | Gap |
| --- | --- | --- | --- | --- |
| MCP transport | Public HTTPS `/mcp` endpoint for MCP requests | Implemented | `src/actions.ts` exposes `app.all("/mcp", ...)` using `StreamableHTTPServerTransport` | None |
| OAuth discovery | `.well-known` OAuth metadata + protected resource metadata | Implemented | `src/actions.ts` exposes `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` | None |
| OAuth endpoints | Authorization, token, dynamic registration endpoints for MCP clients | Implemented | `src/actions.ts` exposes `/mcp/oauth/authorize`, `/mcp/oauth/token`, `/mcp/oauth/register` | None |
| Tool inventory | Stable tools with clear schemas and descriptions | Implemented, improved | `src/server.ts` `listTools` + `docs/developer/mcp/tool_descriptions.yaml` | Minor metadata tuning only |
| ChatGPT app UI | Optional embedded UI resource linked from tool metadata | Implemented (timeline MVP) | `src/server.ts` resource `neotoma://ui/timeline_widget` + tool `_meta` for `list_timeline_events` | Expand to more tools later |
| Auth failure behavior | `401` and `WWW-Authenticate` for re-auth/connect | Implemented | `src/actions.ts` `/mcp` and protected-resource handling | None |
| Legacy compatibility | Keep Custom GPT Actions path available | Implemented | Existing `openapi_actions.yaml` flow remains | None |

## MVP Tool Surface for ChatGPT App

Focus on stable, high-signal tools first:

- `retrieve_entities`
- `retrieve_entity_by_identifier`
- `list_timeline_events`
- `retrieve_related_entities`
- `retrieve_graph_neighborhood`
- `store`
- `create_relationship`

This set is sufficient for list/query, graph context, and write-back memory workflows.

## Discovery Metadata Guidance

Tool descriptions should follow this pattern:

- Start with `Use this when...` intent text.
- Include high-value constraints (for example: search + sort restrictions).
- Keep output expectations predictable and explicit.

`docs/developer/mcp/tool_descriptions.yaml` is the canonical source for this text.

## Risks and Mitigations

- Discovery misfires for broad prompts: tighten tool descriptions and test against a golden prompt set.
- OAuth reconnect loops: keep `invalid_token` and `WWW-Authenticate` behavior deterministic.
- Oversized responses: enforce bounded queries and pagination in app instructions/checklists.

## Exit Criteria for MVP Readiness

- ChatGPT Developer Mode can connect to `https://<host>/mcp`.
- Tools list renders and selected golden prompts invoke intended tools.
- Write calls require expected confirmation behavior.
- Timeline widget renders for `list_timeline_events` responses.
- Existing Custom GPT Actions setup remains functional.
