# Neotoma Key User Workflows (MVP)

_(Primary User Workflows)_

---

## Purpose

This document describes the key user workflows that Neotoma MVP supports.

---

## Workflow 1: Upload Documents → See Structured Memory

User uploads invoices, receipts, contracts, travel docs.

They see:

- Extracted fields (invoice_number, amount, vendor)
- Entities (companies, people automatically identified)
- Events (timeline of dates from documents)
- Graph relationships (which entities in which records)

---

## Workflow 2: Connect Gmail → Import Attachments

User selects labels (Receipts, Travel, Finance).

System ingests attachments only (never email bodies).

---

## Workflow 3: Ask AI Questions

- "Summarize this contract"
- "Show me all documents involving Acme Corp"
- "What are all my travel events next month?"
- "What expires soon?"

**AI MUST use MCP and the graph, not guess.**

---

## Workflow 4: Explore the Timeline

Chronological view of events:

- Flights (departure/arrival)
- Contract effective dates
- Invoice issued/due dates
- Passport expiry

**AI and UI MUST show the same events (single source of truth).**

---

## Related Documents

- [`docs/context/index.md`](../context/index.md) — Documentation navigation guide
- [`docs/specs/ICP_PROFILES.md`](../specs/ICP_PROFILES.md) — Target user profiles
