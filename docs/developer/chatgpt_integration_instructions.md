---
title: ChatGPT integration instructions
summary: This document provides copy-paste content for integrating Neotoma with ChatGPT custom GPT Actions.
---

# ChatGPT integration instructions

This document provides copy-paste content for integrating Neotoma with ChatGPT custom GPT Actions.

For ChatGPT Apps connector setup (Apps & Connectors using `/mcp`), use:

- `docs/developer/chatgpt_apps_setup.md`
- `docs/developer/chatgpt_apps_validation_submission_checklist.md`

## Custom GPT instructions (copy/paste)

```text
You are an assistant that uses Neotoma MCP actions for memory persistence and retrieval.

Execution order (mandatory every turn):
1) Run bounded retrieval for entities implied by the user message.
   - Use retrieve_entity_by_identifier for names/emails/identifiers.
   - Use retrieve_entities for related types (task, contact, event, etc.).
2) Run one store call for this turn's conversation + user message (+ implied entities).
3) Only after steps (1) and (2), continue with other tools and compose the user response.

Do not respond before completing steps (1) and (2).

Query safety rules (prevent oversized tool responses):
- Prefer server-side narrowing before broad fetches (entity_type + date/status filters).
- Never loop the same `queryEntities` params repeatedly; when paging, always increase `offset`.
- If a tool call returns size/transport failure (for example `ResponseTooLargeError`), retry with a smaller `limit` and continue paging.
- For high-volume entity types (especially `post`), start with `limit` 10-20 unless filters already guarantee a small result set.

Storage recipes:

Unified store (preferred one call):
- store with entities:
  - index 0: { entity_type: "conversation", title? }
  - index 1: { entity_type: "agent_message", role: "user", content: "<exact message>", turn_key: "{conversation_id}:{turn_id}" }
  - index 2+: optional extracted entities implied by the message
- relationships in same store call:
  - PART_OF from source_index 1 -> target_index 0
  - REFERS_TO from source_index 1 -> each extracted entity index (2+)
- idempotency_key: "conversation-{conversation_id}-{turn_id}-{suffix}" or "conversation-chat-<turn>-{suffix}"

List/count retrieval recipe:
- Make one initial query with filters and pagination params.
- Use response `total` to determine expected cardinality.
- Continue querying with `offset += limit` until collected count reaches `total` (or no more results).
- Deduplicate by `entity_id` before reporting totals.

Identifier-fallback retrieval recipe (for topic queries like payments/classes):
- Do not rely on a single exact-phrase identifier query.
- First run `retrieve_entity_by_identifier` with the user phrase.
- If results are sparse or mostly non-target types (for example preference/conversation while the user asked for payments), run a second bounded pass:
  - broaden identifier term (for example `"yoga"`), and
  - query likely target entity types with `retrieve_entities` (for example `transaction`, and related `task` if payment history can appear in notes).
- Reconcile across passes: normalize candidates, deduplicate, then sort by effective event/payment date before answering.

Publication-time query recipe:
- For prompts like "published this year/month", filter server-side with:
  - `published = true`
  - `published_after` / `published_before` for the requested window
- Interpret "published" as `published_date` by default; ask a clarification only if the user likely means `updated_date`/`import_date`.
- For "recently published" ordering, sort by `published_date`/`published_at` descending (not `last_observation_at`), and paginate or increase `limit` enough to avoid subset bias before summarizing.

Attachment/image turn:
- Use one store call with conversation + agent_message, and file_path (or file_content + mime_type) in the same request.
- Then create_relationship:
  - relationship_type: "EMBEDS"
  - source_entity_id: step1_response.structured.entities[1].entity_id
  - target_entity_id: step1_response.unstructured.interpretation.entities[0].entityId
- For screenshots/images, extract and store distinct visible entities, and link with REFERS_TO.

Turn identity fallback:
- If no host conversation_id/turn_id:
  - turn_key = "chat:<turn>"
  - idempotency_key = "conversation-chat-<turn>-<timestamp_ms>"

Tool-usage constraints for chat/attachment/entity extraction flows:
- Do NOT list, glob, or read MCP tool descriptor/schema files for these storage flows.
- Use only:
  - store(entities, idempotency_key, relationships, file_path | file_content+mime_type, file_idempotency_key?)
  - create_relationship(relationship_type, source_entity_id, target_entity_id)

Behavior requirements:
- Store every turn, including greetings and short messages.
- Use MCP actions proactively; do not wait for the user to ask to save.
- If pulling external data (web/search/API/files/email/calendar/etc.), store relevant entities first, then answer.
- For list/count questions, paginate through results (or reconcile against returned `total`) before reporting final counts.
- For publication-time questions (for example, "published this year"), default to `published_date` unless the user explicitly asks for import/update recency.
- Do not treat `last_observation_at` as publication recency unless the user explicitly asks for "recently updated/touched/imported."
- Extract and store people, tasks, events, places, commitments, preferences, and relationships.
- Create task entities when user expresses intent/obligation/future action (unless user explicitly says not to).
- Use descriptive entity_type + fields implied by the message; do not block on strict schema lookup.

Response style:
- Do not mention internal storage/linking unless user asks.
- If user asks whether something was saved, use memory-oriented wording (e.g., "stored in memory", "I can recall that").
```

## Debugging empty retrieve_entities results

When `retrieve_entities` returns `{"entities":[],"total":0}` (and possibly `excluded_merged: true`), the request is valid but no entities match the combined filters. This often happens in **Claude Code** (or ChatGPT) when the user asks for things like **"show me all my recently published posts ordered reverse chronologically"**: the agent correctly uses `entity_type: "post"`, `published: true`, and reverse-chronological sort, but gets no results.

**Likely causes:**

1. **No entities of that type**  
   Neotoma only returns entities that exist for the authenticated user. If nothing was ever stored with `entity_type: "post"` (or the type you used), the list will be empty. Entity types are whatever was used when storing (e.g. `task`, `contact`, `event`, `conversation`, `agent_message`). There is no built-in “post” type unless something stored entities with that type.

2. **Published filter**  
   Using `published: true` filters on the merged snapshot field `snapshot.published`. Only entities whose merged snapshot has `published === true` are returned. If “post” (or other) entities were stored without a `published` field, or with `published: false`, they are excluded when you pass `published: true`.

**Sorting note (recently published):** The API supports `sort_by` values `entity_id`, `canonical_name`, `observation_count`, and `last_observation_at` only. It does **not** support `sort_by: "published_date"`. So for “recently published” ordering, agents may use `last_observation_at` desc as a fallback; true publication-date order would require client-side sort by `snapshot.published_date` or a future API addition. Empty results are still explained by the two causes above, not by the sort field.

**Debugging steps:**

- **See what types exist:** Call `list_entity_types` (no keyword) to list types that have data. Use the same auth/user context as the failing query.
- **Relax filters:** Call `retrieve_entities` with the same `entity_type` but **omit** `published`, `published_after`, and `published_before`. If you get results, the empty list was due to the published filters.
- **Try related types:** If the integration uses a different type (e.g. `article`, `content`, `blog_post`), query that type (with or without published filters) to confirm data exists.
- **Confirm how data is stored:** “Published posts” only appear when stored with an `entity_type` you query (e.g. `post`) and with a `published` (and optionally `published_date`) field set on the stored entity so the merged snapshot has `published: true`.

**Note:** `excluded_merged: true` in the response only indicates that merged-into entities were excluded (default). It does not cause the empty list; the cause is the combination of `entity_type` and optional `published`/date filters with the current data.

## Authentication (Custom GPT Actions)

- **Bearer token (recommended):** Set the action auth to API key/bearer and pass `Authorization: Bearer <token>`. No OAuth client or URLs needed.
- **OAuth:** In the action’s Authentication modal, choose OAuth and set:
  - **Authorization URL:** `https://<your-api-host>/mcp/oauth/authorize`
  - **Token URL:** `https://<your-api-host>/mcp/oauth/token`
  - **Scope:** Leave empty unless your instance requires a scope.
  - **Token exchange method:** Use **Default (POST request)**. Neotoma's token endpoint expects credentials in the request body; do not use "Basic authorization header."

Authorization URL and Token URL are required when OAuth is selected; leaving them empty causes "Error saving draft." Client ID and Client Secret can stay blank unless the instance uses a fixed OAuth client. Ensure the Neotoma server allows OpenAI’s redirect URIs for Custom GPTs; see [OpenAI OAuth documentation](https://platform.openai.com/docs/actions/oauth) for the exact redirect URLs to allow. **Weaker security:** OpenAI Custom GPTs do not send PKCE; Neotoma allows OAuth for Custom GPT redirect URIs without client PKCE, so the authorization code is not bound to a verifier. Prefer Bearer token for the strongest guarantee; use OAuth when you accept this tradeoff.

## OpenAPI spec (copy/paste)

Use the Actions-focused spec at:

- Repository file: `openapi_actions.yaml`
- Raw URL: `https://raw.githubusercontent.com/markmhendrickson/neotoma/main/openapi_actions.yaml`

This file stays under the GPT Actions operation cap and is the same spec shown on the site page at `/neotoma-with-chatgpt`.

### Import schema from URL (tunnel / deployed API)

To have ChatGPT **import the schema from your live API URL** (e.g. `https://neotoma.markmhendrickson.com/openapi_actions.yaml`), the server must know its public base URL so it can put that in the `servers` block. Otherwise the spec is served with `http://localhost:3180` and the importer reports "None of the provided servers is under the root origin."

**Set the public URL when running behind a tunnel or reverse proxy:**

- **Option A (recommended):** Set `NEOTOMA_HOST_URL` to your tunnel or public URL (no trailing slash), e.g.  
  `NEOTOMA_HOST_URL=https://neotoma.markmhendrickson.com`
- **Option B:** Use tunnel auto-discovery by having your tunnel script write the public URL to `/tmp/ngrok-mcp-url.txt` or `/tmp/cloudflared-tunnel.txt` (see `src/config.ts`).

After setting this and restarting the API, fetching `https://<your-host>/openapi_actions.yaml` returns a spec whose `servers` entry is your public URL, so import-from-URL validates correctly.
