# ChatGPT App Submission Draft (Neotoma)

Use this as starter copy for ChatGPT App submission fields.

## App Name

Neotoma

## Short Description

Deterministic memory graph for storing, retrieving, and connecting structured facts across conversations and files.

## Long Description

Neotoma helps users persist important information as structured entities and relationships, then retrieve it with provenance-aware queries. It supports multi-turn memory workflows, timeline queries, and graph neighborhood exploration so users can recall facts, tasks, people, and events with context.

Neotoma is best for users who need auditable memory behavior, predictable storage/retrieval patterns, and explicit relationship modeling rather than opaque chat history lookup.

## Category

Productivity / Knowledge Management

## Suggested Starter Prompts

1. "Find my recent tasks and upcoming events."
2. "Store this note: finalize migration checklist by Friday."
3. "Show timeline events from last month."
4. "Find entities related to identifier Acme Corp."
5. "Retrieve graph neighborhood for entity id `<entity_id>`."
6. "Create a relationship from this task to the project entity."

## Safety and Boundaries

- Neotoma stores user-provided or tool-derived structured data; users should avoid storing secrets unless intended.
- Write actions should remain user-confirmed in ChatGPT.
- Queries should be bounded with pagination and filters to prevent oversized responses.

## Support

- Repository: `https://github.com/markmhendrickson/neotoma`
- Issues: `https://github.com/markmhendrickson/neotoma/issues`

## Privacy

- Privacy policy path in repo: `docs/legal/privacy_policy.md`
- Terms path in repo: `docs/legal/terms_of_service.md`
