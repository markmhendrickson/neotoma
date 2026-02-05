# MCP interaction instructions

## Scope

This file defines the instruction text the Neotoma MCP server sends to clients (e.g. Cursor) so agents know how to use MCP actions. The server loads this file at runtime. It is not user-facing documentation; for that see `docs/specs/MCP_SPEC.md` and `docs/developer/mcp_overview.md`.

## Purpose

Single source of truth for MCP server interaction instructions. Edits here take effect when the server loads; no code change in `src/server.ts` is needed to change instruction text.

## Instructions (content sent to clients)

The following block is loaded by the server and sent to MCP clients as interaction instructions. One instruction per line.

```
Use MCP actions proactively. Store and retrieve without waiting for explicit requests.
Always store when the user states relevant information, even in conversational contexts. Store first, then respond. Do not skip store because the user did not explicitly ask to save.
When confirming stored information, you MUST use memory-related language (e.g. “remember”, “recall”, “store in memory”) and include one of those phrases in the confirmation.
Extract and store all relevant entities from what the user says: people, tasks, events, commitments, preferences, possessions, relationships, and any other types that fit. Store every distinct entity (e.g. a person and a task and an event from the same message). Create relationships when implied (e.g. friend of, task for person, event attendee) using create_relationship or relationship fields per schema.
Proactively create a task when the user expresses intent, obligation, debt, or a future action (e.g. “I need to”, “I have to”, “I owe”, “I should”, “I want to buy”, “remind me”, or any deadline). Unless the user explicitly says no reminders or no tasks, create a task with due date if available and relate it to the relevant person or entity.
When entity type is not in the known list, use list_entity_types with a keyword (e.g. "device", "asset", "preference", "gift", "reminder") or store with a descriptive entity_type; the system will infer or create schema from the data. Be proactive about storing any type of relevant entity, including types not yet registered.
Example entity types (use when they fit; more may exist via list_entity_types or neotoma://entity_types): contact, person, company, task, invoice, transaction, receipt, note, contract, event, feature_unit, release, agent_decision, agent_session, validation_result, codebase_entity, architectural_decision. For any other concept, use a descriptive type (e.g. device, asset, preference, gift) or discover via list_entity_types.
Avoid calling get_authenticated_user unless required by the intended follow-up action. If the next actions do not require it, skip get_authenticated_user.
Check for existing records before storing to avoid duplicates.
Include all fields from source data when storing entities. Unknown fields must be included.
Omit user_id. It is inferred from authentication.
After any MCP action, summarize entities and relationships with all snapshot fields.
If the prompt ends with "via mcp", use MCP actions only and do not read or write local files.
```

## Related documents

- `docs/specs/MCP_SPEC.md` — Full MCP action catalog and entity type rules
- `docs/developer/mcp_overview.md` — MCP overview and setup links
- `docs/developer/mcp/unauthenticated.md` — Unauthenticated-state instructions
- `docs/developer/mcp/tool_descriptions.yaml` — Per-tool descriptions for ListTools
- `src/server.ts` — Loads this file via `getMcpInteractionInstructions()`
