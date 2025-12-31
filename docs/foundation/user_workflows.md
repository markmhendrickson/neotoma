# Neotoma Key User Workflows (MVP)
## Workflow 1: Upload Documents → See Structured Memory
User uploads invoices, receipts, contracts, travel docs.
They see:
- Extracted fields (invoice_number, amount, vendor)
- Entities (companies, people automatically identified)
- Events (timeline of dates from documents)
- Graph relationships (which entities in which records)
## Workflow 2: Agent Creates Structured Data → See in Memory
User provides structured data during AI conversation (ChatGPT, Claude, Cursor).
Agent stores data via MCP `store_record`:
- User preference (theme: dark)
- Project context (project_name, deadline, collaborators)
- Contact information (person, company, role)
They see:
- Structured data in memory (queryable via MCP)
- Entities unified with documents ("Acme Corp" from conversation matches "Acme Corp" from invoice)
- Events added to timeline
- Cross-platform access (data available in ChatGPT, Claude, Cursor)
## Workflow 3: Connect Gmail → Import Attachments
User selects labels (Receipts, Travel, Finance).
System ingests attachments only (never email bodies).
## Workflow 4: Ask AI Questions
- "Summarize this contract"
- "Show me all data involving Acme Corp" (documents + agent-created data)
- "What are all my travel events next month?"
- "What expires soon?"
**AI MUST use MCP and the graph, not guess.**
## Workflow 5: Explore the Timeline
Chronological view of events from all personal data:
- Flights (departure/arrival) — from documents
- Contract effective dates — from documents
- Invoice issued/due dates — from documents
- Passport expiry — from documents
- Project deadlines — from agent-created data
- Event dates — from agent-created data
**AI and UI MUST show the same events (single source of truth).**
Timeline works across documents AND agent-created data, differentiating from conversation-only provider memory.
