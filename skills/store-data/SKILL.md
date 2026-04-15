---
name: store-data
description: Store structured entities or files in Neotoma memory with proper provenance and relationship linking.
triggers:
  - store this
  - remember this
  - save to neotoma
  - persist
  - store entities
---

# Store Data in Neotoma

## When to use

When the user wants to persist structured data (contacts, tasks, events, transactions, notes, etc.) or files (PDFs, CSVs, images) into Neotoma's memory layer.

## Workflow

1. **Check for existing records** before storing to avoid duplicates.
   - Use `retrieve_entity_by_identifier` for names, emails, or identifiers.
   - Use `retrieve_entities` with entity_type filter for related records.

2. **Extract entities** from the user's message or attached files.
   - Use descriptive `entity_type` values (contact, task, event, transaction, receipt, note, etc.).
   - Include ALL fields from the source data; unknown fields go to raw_fragments automatically.

3. **Store with a single call** when possible.
   - Use `store` for combined file + entity storage.
   - Use `store_structured` for entities only.
   - Use `store_unstructured` for files only.
   - Always include `idempotency_key` for replay safety.

4. **Link related entities** using `create_relationship`.
   - PART_OF: message belongs to conversation, item belongs to container.
   - REFERS_TO: message references an entity.
   - EMBEDS: container holds an asset (file).
   - SUPERSEDES: new version replaces old.

5. **Confirm storage** using memory-related language ("stored in memory", "will remember").

## Entity type discovery

Before inventing a new entity_type, check what schemas already exist:
- Use `list_entity_types` with a keyword search.
- If no match, use a descriptive snake_case type; Neotoma auto-creates the schema.

## Required fields

- `idempotency_key`: unique per store call (e.g. `conversation-{id}-{turn}-{timestamp}`)
- `entity_type`: descriptive type for each entity
- All source fields: include everything, not just known schema fields

## Do not

- Skip the duplicate check for named entities (people, companies, places).
- Omit fields from source data because they are not in the schema.
- Store without an idempotency_key.
