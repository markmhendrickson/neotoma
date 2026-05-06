---
name: remember-email
description: Import emails into persistent memory. Configure an email MCP, discover and preview emails, extract contacts, tasks, events, and transactions.
triggers:
  - remember my emails
  - import emails
  - save my emails
  - import email to neotoma
  - email memory
  - remember email
  - gmail import
---

# Remember Email

Import emails into Neotoma memory with full provenance. Extracts contacts, tasks, events, transactions, and other entities from email content.

## When to use

When the user wants to persist emails and the entities they contain (contacts, commitments, tasks, events, financial transactions) into durable memory.

## Prerequisites

Run the `ensure-neotoma` skill first if Neotoma is not yet installed or configured in your current harness.

An email MCP server must be configured (e.g. Gmail MCP). If one is not available, this skill guides the user through configuration.

## Workflow

### Phase 0: Verify Neotoma and email MCP

1. Confirm Neotoma MCP is connected (call `get_session_identity`).
2. Check if an email MCP is configured (e.g. `search_emails` tool available).
3. If no email MCP is configured, guide the user:
   - For Gmail: add the Gmail MCP server to the harness config and authenticate via OAuth.
   - For other providers: check if an IMAP-capable MCP is available.

### Phase 1: Discover emails

1. Ask the user what to import:
   - Recent emails (last N days/weeks)
   - Emails from specific senders
   - Emails matching a search query
   - All emails in a folder/label
2. Use `search_emails` to list matching messages.
3. Present a summary: count, date range, top senders.

### Phase 2: Preview and confirm

1. Show the user a preview of what will be imported:
   - Number of emails
   - Entity types that will be extracted (contacts, tasks, events, transactions)
   - Estimated entities per email
2. Ask for confirmation before proceeding.

### Phase 3: Hydrate and extract

For each email (up to ~10 per turn, per depth-of-capture scope cap):

1. Call the detail endpoint (`read_email`) to get the full body, headers, and attachment metadata.
2. Extract entities from the email content:
   - **Contacts**: sender, recipients, anyone mentioned by name+email
   - **Tasks**: action items, requests, commitments ("please send", "I need", deadlines)
   - **Events**: meetings, calls, scheduled items with dates
   - **Transactions**: invoices, receipts, payment confirmations with amounts and currencies
3. Set `data_source` per email using the message ID: `"Gmail read_email id=<message_id> <ISO-date>"`
4. Include `source_quote` on each extracted entity with the relevant snippet from the email body.

### Phase 4: Store with provenance

Use a single `store` call per email batch:
- Include the conversation, user message, and all extracted entities in the entities array.
- Set per-entity `data_source` with unique message IDs to avoid heuristic merging.
- Batch REFERS_TO relationships from the user message to each extracted entity.
- Apply existing-entity correction if a contact or entity already exists (same name+email).

### Phase 5: Report results

Summarize what was stored:
- Number of emails processed
- Entities created/updated by type (contacts, tasks, events, transactions)
- Offer to continue with more emails if the batch was capped.

## Do not

- Import emails without user confirmation.
- Echo full email bodies into the chat (sensitivity rule — store the body but summarize in the reply).
- Create duplicate contacts — always check for existing records by name or email before storing.
- Skip `data_source` on entities — every entity must trace back to a specific email.
