# Neotoma MCP — Mobile setup (Claude iOS / Android)

## Scope

How to connect Neotoma MCP in the Claude mobile app and configure a custom system prompt so retrieval-first behavior applies before native device integrations (Reminders, Calendar, Contacts, etc.).

Claude mobile does not run a hook runtime. The MCP instruction payload is the only enforcement path for Neotoma-first behavior.

---

## Prerequisites

- A running Neotoma instance reachable over HTTPS from the mobile device (self-hosted or hosted).
- The Neotoma API key or session token for the account to use.
- Claude mobile app (iOS or Android) with MCP support enabled.

---

## Step 1 — Connect Neotoma MCP

In the Claude mobile app, navigate to **Settings → Integrations (MCP)** and add a new server:

| Field | Value |
|---|---|
| Name | Neotoma |
| URL | `https://<your-neotoma-host>/mcp` |
| Authentication | Bearer token (paste your Neotoma API key) |

Replace `<your-neotoma-host>` with the public hostname of your Neotoma instance (for example, `neotoma.example.com`).

After saving, the Claude mobile app will fetch the tool list and the `instructions` / `serverUseInstructions` payload from the Neotoma server. The full MCP instruction block — including the retrieval-first rule for tasks, schedule, contacts, notes, issues, events, finances, decisions, and commitments — is delivered at connection time.

---

## Step 2 — Optional: set a custom system prompt

A custom system prompt reinforces Neotoma-first behavior and makes it explicit that native integrations (Reminders, Calendar, Contacts) are fallbacks only.

In the Claude mobile app, navigate to **Settings → Custom Instructions** (or the equivalent system prompt field) and paste the template below. Adjust the bracketed fields.

```
You are connected to Neotoma, a persistent memory and knowledge graph for [your name or team].

Retrieval-first rule (mandatory):
When I ask about tasks, schedule, contacts, notes, issues, events, finances, decisions, or commitments, ALWAYS check Neotoma first using the retrieve_entities or retrieve_entity_by_identifier MCP tools before answering or falling back to any native device integration (Reminders, Calendar, Contacts, or similar). Do not say "I don't have that information" until a bounded Neotoma retrieval has been attempted and returned no relevant results.

Storage rule (mandatory):
Store every conversation turn — user message and assistant reply — in Neotoma using the store MCP tool. Do not skip storage for short or routine turns.

Native integrations are fallbacks:
Only read from Reminders, Calendar, or Contacts when Neotoma retrieval returns no relevant results for that query.
```

This prompt works whether or not `NEOTOMA_MCP_COMPACT_INSTRUCTIONS=1` is set on the server. The MCP instruction payload already contains the retrieval-first rule; the system prompt adds a visible, user-controlled reminder.

---

## Step 3 — Verify the connection

Send a message such as:

> "What tasks do I have open?"

Claude should invoke `retrieve_entities` (entity_type `task` or similar) before answering. If the tool call appears in the response trace, Neotoma MCP is connected and the retrieval-first rule is active.

---

## Compact instructions mode for mobile

If the full MCP instruction block is consuming too much context on mobile, set `NEOTOMA_MCP_COMPACT_INSTRUCTIONS=1` on the Neotoma server. In compact mode the server sends a short checklist (covering turn lifecycle, store recipes, retrieval, provenance, display, QA, and errors) plus a pointer to the canonical doc and to `neotoma instructions print`. The retrieval-first rule is included in the compact checklist.

See [`compact_instructions.md`](./compact_instructions.md) for the full description of compact mode.

---

## Limitations

- **No hook runtime on mobile.** Claude iOS/Android does not run the Claude Code hook runtime, so pre/post-turn hooks from `settings.json` do not execute. The MCP instruction payload and the optional custom system prompt above are the only enforcement paths.
- **Context length.** Mobile context windows are shorter than desktop. If you see the MCP instructions being truncated, enable compact mode (see above).
- **Offline.** The Neotoma MCP connection requires network access. If the device is offline, MCP tools are unavailable and the retrieval-first rule cannot execute.
