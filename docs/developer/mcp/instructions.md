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
When you pull data from other MCPs (e.g. email, calendar, search), apply the same proactive storage: extract and store people, companies, locations, events, tasks, notifications, device status, and relationships from that data. Create tasks for action items (e.g. "replace battery", "share feedback", "review security alert", "reply about Madrid trip"). Store locations and link events or tasks to them. Do not respond with that data until storage is complete (same turn). Store first, then respond.
When the user provides or implies their own identity (e.g. name, email, or signing a message as "me"/"myself"), store the user as a contact or person in Neotoma in the same turn. Do not skip creating or updating the user's own contact record when you have sufficient identifying information (e.g. full name).
When confirming stored information, you MUST use memory-related language (e.g. “remember”, “recall”, “store in memory”) and include one of those phrases in the confirmation.
Extract and store all relevant entities from what the user says: people, tasks, events, commitments, preferences, possessions, relationships, places, and any other types that fit. Store every distinct entity (e.g. a person and a task and an event from the same message). When the user mentions a place, property, or location (e.g. "our home in Barcelona", "my office", "apartment in Madrid"), store it as an entity (e.g. location, property, or place) and link the task or other entities to it. Create relationships when implied (e.g. friend of, task for person, event attendee, task for location) using create_relationship or relationship fields per schema. For container-embedded assets (e.g. post with images, document with attachments): use relationship type EMBEDS with source_entity_id = container (post/document) and target_entity_id = asset (image/attachment entity). When the image or file is stored in Neotoma: store the file via store, create an image or media entity (include source_id or reference to the stored file), then create_relationship(EMBEDS, container_entity_id, asset_entity_id). When the image lives elsewhere (e.g. on disk or external URL): store only a reference field on the container entity (e.g. hero_image filename, embed_url).
Proactively create a task when the user expresses intent, obligation, debt, or a future action (e.g. “I need to”, “I have to”, “I owe”, “I should”, “I want to buy”, “remind me”, or any deadline). Unless the user explicitly says no reminders or no tasks, create a task with due date if available and relate it to the relevant person or entity.
When entity type is not in the known list, use list_entity_types with a keyword (e.g. "device", "asset", "preference", "gift", "reminder") or store with a descriptive entity_type; the system will infer or create schema from the data. Be proactive about storing any type of relevant entity, including types not yet registered.
Example entity types (use when they fit; more may exist via list_entity_types or neotoma://entity_types): contact, person, company, task, invoice, transaction, receipt, note, contract, event, location, property, place, feature_unit, release, agent_decision, agent_session, validation_result, codebase_entity, architectural_decision. For any other concept, use a descriptive type (e.g. device, asset, preference, gift, home) or discover via list_entity_types.
Avoid calling get_authenticated_user unless required by the intended follow-up action. If the next actions do not require it, skip get_authenticated_user.
Check for existing records before storing to avoid duplicates.
Include all fields from source data when storing entities. Unknown fields must be included.
Use the structured path (store with entities) for data from conversation or from other MCPs (e.g. email, calendar) when you are extracting and storing entities; omit original_filename. Use the unstructured path (store with file_content+mime_type or file_path) when the user attached a file or you have a file/resource to preserve; pass the raw file and do not interpret it yourself.
Omit user_id. It is inferred from authentication.
After any MCP action, summarize entities and relationships with all snapshot fields.
When summarizing store or entity results, do not repeat the same phrase as both the thought and the section heading (e.g. avoid "Task created and stored" in both); use the thought for a brief status and use the heading only once for the structured block.
If the prompt ends with "via mcp", use MCP actions only and do not read or write local files.
```

## Related documents

- `docs/specs/MCP_SPEC.md` — Full MCP action catalog and entity type rules
- `docs/developer/mcp_overview.md` — MCP overview and setup links
- `docs/developer/mcp/unauthenticated.md` — Unauthenticated-state instructions
- `docs/developer/mcp/tool_descriptions.yaml` — Per-tool descriptions for ListTools
- `src/server.ts` — Loads this file via `getMcpInteractionInstructions()`
