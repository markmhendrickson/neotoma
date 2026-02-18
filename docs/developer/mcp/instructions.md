# MCP interaction instructions

## Scope

Instruction text the Neotoma MCP server sends to clients so agents know how to use MCP actions. The server loads this file at runtime; edits here take effect without code changes in `src/server.ts`. For user-facing docs see `docs/specs/MCP_SPEC.md` and `docs/developer/mcp_overview.md`.

## Transport and environment

- **Local (same machine as repo):** Prefer the **Neotoma CLI** (`neotoma …`). Start or use an existing API session; run `neotoma` with no args for an interactive session, or `neotoma --servers=start` in non-interactive mode. Use MCP only if the user explicitly configures it or when the CLI is unsuitable.
- **Remote (tunnel, ChatGPT, cloud):** Use **MCP** over HTTP with the configured Neotoma URL (e.g. tunnel or neotoma.fly.dev).

## Instructions (content sent to clients)

The block below is loaded and sent to MCP clients as interaction instructions. One instruction per line.

```
Transport: When running locally (same machine as the Neotoma repo), prefer the Neotoma CLI (neotoma <command>); invoke commands directly. Use MCP when remote (tunnel, ChatGPT, deployed).
CLI: When using the Neotoma CLI locally, always invoke commands directly (e.g. neotoma entities list --type company). Do not rely on the interactive session; use direct invocation so the CLI works in non-TTY and scripted environments.
MANDATORY in chat: every turn persist the conversation and current user message. Do not skip for greetings or minimal messages. Same turn as your response.
Chat (one call): store_structured with entities [ { entity_type: "conversation", title?, started_at? }, { entity_type: "agent_message", role: "user", content: "<exact message>", turn_index?, turn_key or id: "{conversation_id}:{turn_id}" } ], idempotency_key "conversation-{conversation_id}-{turn_id}-{timestamp_ms}" or "conversation-{conversation_id}-{turn_id}-{uuid}" (so each store creates a new observation; overwriting between branches is allowed), and relationships: [ { relationship_type: "PART_OF", source_index: 1, target_index: 0 } ]. Indices = entities array (0=conversation, 1=message). Response.entities[0]=conversation id, [1]=message id. Use host conversation_id/thread_id/session_id and turn_id or turn index when available. Include stable turn identity in agent_message (e.g. turn_key or id = conversation_id:turn_id) so the same logical turn resolves to the same entity and multiple observations form history via list_observations.
Fallback if relationships not supported: (1) store_structured with entities and idempotency_key; (2) create_relationship(PART_OF, response.entities[1].entity_id, response.entities[0].entity_id).
Chat details: Overwriting between branches is acceptable; users can view historical turns or branches via observation history (e.g. list_observations). Reverted turns: optionally create_relationship(SUPERSEDES, new_message_id, previous_message_id). Attachments: store via unstructured path, link with EMBEDS. Relationship types: PART_OF, REFERS_TO, EMBEDS, SUPERSEDES, etc. (see MCP spec).
Do not mention storage, memory, or linking unless the user asked. Do not describe internal persistence in thought or reply (e.g. "Persisting this turn, then replying", "Storing the conversation first"). When confirming something was stored, use memory-related language ("remember", "recall", "stored in memory") and include one of those phrases.
Use MCP actions proactively. Store when the user states relevant information; store first, then respond. Do not skip store because the user did not ask to save.
Other MCPs: When you pull data (email, calendar, search), extract and store people, companies, locations, events, tasks, notifications, device status, relationships. Create tasks for action items. Link events/tasks to locations. Do not respond with that data until storage is complete (same turn).
User identity: When the user provides or implies their identity (name, email, "me"/"myself"), store as contact or person in the same turn when you have enough to identify.
Extract and store all relevant entities from the user: people, tasks, events, commitments, preferences, possessions, relationships, places. Store every distinct entity. Places: store as location/property/place and link to tasks or other entities. Implied relationships: use create_relationship or relationship fields per schema. Container+asset: EMBEDS with source=container, target=asset; if file in Neotoma then store file, create image/media entity, create_relationship(EMBEDS, container_id, asset_id); if asset elsewhere store only a reference on the container.
Tasks: Create a task when the user expresses intent, obligation, or future action ("I need to", "remind me", deadlines). Unless they say no reminders/tasks, create task with due date if available and relate to person or entity.
Entity types: Unknown type: use list_entity_types with a keyword or store with a descriptive entity_type; system infers or creates schema. Examples: contact, person, company, task, invoice, transaction, receipt, note, contract, event, location, property, place, feature_unit, release, agent_decision, agent_session, validation_result, codebase_entity, architectural_decision. Others: descriptive type or discover via list_entity_types.
Conventions: Avoid get_authenticated_user unless the next action needs it. Check for existing records before storing. Include all fields from source when storing. Structured path (entities) for conversation- or tool-sourced data; omit original_filename. Unstructured path (file_content+mime_type or file_path) for user attachments or files to preserve; pass raw file, do not interpret. Omit user_id (inferred). After MCP actions, summarize entities and relationships with snapshot fields. Do not repeat the same phrase as both thought and section heading. At session start, optionally call npm_check_update with packageName "neotoma" and the client version; if updateAvailable, prompt user to upgrade.
```

## One-call chat persistence

Optional `relationships` on `store_structured`: array of `{ relationship_type, source_index, target_index }` (indices into the request’s `entities` array). Server creates entities then relationships in one request. No separate `store_chat_turn` action; the generic store covers chat.

## Related documents

- `docs/specs/MCP_SPEC.md` — Action catalog and entity type rules
- `docs/developer/mcp_overview.md` — Overview and setup
- `docs/developer/cli_agent_instructions.md` — CLI agent instructions (same behaviors, CLI commands instead of MCP tools)
- `docs/developer/mcp/unauthenticated.md` — Unauthenticated instructions
- `docs/developer/mcp/tool_descriptions.yaml` — Per-tool descriptions
- `src/server.ts` — Loads this file via `getMcpInteractionInstructions()`
