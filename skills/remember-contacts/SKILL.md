---
name: remember-contacts
description: Consolidate contacts from email, calendar, chat history, vCards, and LinkedIn exports into persistent memory.
triggers:
  - remember my contacts
  - import contacts
  - save my contacts
  - consolidate contacts
  - contact memory
  - remember contacts
  - import linkedin connections
  - import vcard
---

# Remember Contacts

Consolidate contacts from multiple sources — email, calendar, chat, vCards, LinkedIn exports — into Neotoma memory. Deduplicates by name and email to build a unified contact graph.

## When to use

When the user wants to build a persistent, deduplicated contact list from various data sources.

## Prerequisites

Run the `ensure-neotoma` skill first if Neotoma is not yet installed or configured in your current harness.

## Supported sources

| Source | Format | Method |
|--------|--------|--------|
| Email | Gmail/IMAP headers | Email MCP (extract sender/recipient) |
| Calendar | Event attendees | Calendar MCP |
| vCards | `.vcf` files | File read |
| LinkedIn | CSV export | File read |
| Chat history | Conversation participants | File read |
| Manual | User-stated contacts | Chat extraction |

## Workflow

### Phase 0: Verify Neotoma

Confirm Neotoma MCP is connected (call `get_session_identity`).

### Phase 1: Identify sources

1. Ask the user which sources to pull contacts from:
   - Email (requires email MCP)
   - Calendar (requires calendar MCP)
   - vCard file
   - LinkedIn export CSV
   - Chat history files
2. For MCP-based sources, verify the relevant MCP is configured.

### Phase 2: Collect and deduplicate

1. **Email MCP**: extract unique sender/recipient pairs from recent emails.
2. **Calendar MCP**: extract attendees from recent events.
3. **vCard files**: parse `.vcf` files for name, email, phone, organization.
4. **LinkedIn CSV**: parse the connections export for name, title, company, email.
5. **Chat history**: extract participants from conversation files.

Before storing each contact, check for existing records:
- Search by email address first (most unique).
- Search by name if no email match.
- If a match exists, use `correct` to update with new fields rather than creating a duplicate.

### Phase 3: Preview and confirm

Present the consolidated contact list:
- Total contacts found per source
- Duplicates detected and merged
- New contacts to be created
Ask for confirmation before storing.

### Phase 4: Store contacts

Store each contact as a `contact` entity with all available fields:
- `name`, `email`, `phone`, `organization`, `title`, `role`
- `source_file` or `data_source` for provenance
- `source_quote` with the relevant snippet when extracting from text

Link contacts to each other or to the user where relationships are apparent (e.g. same company, frequent email correspondents).

### Phase 5: Report results

Summarize:
- Contacts stored (new + updated)
- Sources used
- Top organizations or groups
- Offer follow-up: "Want to enrich these contacts with recent email context?"

## Do not

- Create duplicate contacts — always deduplicate by email, then by name.
- Import contacts without user confirmation.
- Store sensitive contact details in chat replies beyond what answering requires.
