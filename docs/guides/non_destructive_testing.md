---
title: Test safely
summary: You do not need to commit to Neotoma to find out if it fits. Install it alongside whatever you already use, ingest a slice of your history, run your agent with Neotoma on and off, and compare. Nothing in your current setup is moved, modi...
audience: user
---

# Test safely

You do not need to commit to Neotoma to find out if it fits. Install it alongside whatever you already use, ingest a slice of your history, run your agent with Neotoma on and off, and compare. Nothing in your current setup is moved, modified, or replaced.

This guide walks through the recommended shadow-install path: install → ingest history → A/B compare → decide. Your existing memory system (`MEMORY.md`, `claw.md`, a custom MCP server, platform memory like Claude or ChatGPT) stays intact the whole time.

## What "test safely" means here

Neotoma writes to a local SQLite database in its own data directory. It does not touch your other files, your editor config, your agent's prompt templates, or any other memory store you already use. If you uninstall, the only artifact is the Neotoma data directory; everything else is exactly where it was.

- Your existing memory files are not read, locked, or rewritten.
- Neotoma data lives in its own directory you can wipe, back up, or copy aside at any point.
- Your agent decides when to read or write Neotoma; nothing is intercepted in the background.
- Schemas are inferred from your data, so the test does not require pre-modeling anything.

## Step 1 — Install in shadow mode

```bash
npm install -g neotoma
NEOTOMA_DATA_DIR=~/.neotoma-shadow neotoma setup --tool cursor --yes
```

`neotoma setup --tool <tool> --yes` is the fastest path when you already know which client you want to test first. It runs the idempotent `init` step, wires MCP, and applies the matching local agent guidance. Swap `cursor` for `claude-code`, `codex`, or another supported tool. If you want the step-by-step prompts instead, use `neotoma init --interactive` and then `neotoma mcp config`.

If you run `setup` with `NEOTOMA_DATA_DIR`, the `init` step inside setup writes that location into Neotoma's env config so later commands keep using the same shadow directory:

```bash
neotoma storage info
```

Anything stored during the trial lands in `~/.neotoma-shadow`.

## Step 2 — Optionally start the local API

You only need this if you want the local HTTP API, Inspector, OAuth flows, or a transport path that depends on the API server. The default local MCP path configured by `setup` does not require it.

```bash
neotoma api start
```

## Step 3 — Ingest a slice of your history

Neotoma can absorb the kinds of artifacts your agent has already produced (chat transcripts, notes, exports). This is what lets you ask comparison questions immediately instead of waiting weeks for fresh history to accumulate.

```bash
# Discover candidate files (read-only scan)
neotoma discover ~/Documents ~/Desktop --limit 50

# Preview a transcript before ingestion
neotoma ingest-transcript ~/Downloads/chatgpt_export.json

# Ingest one file with an explicit idempotency key
neotoma ingest --file ~/Notes/meeting_2026_03_14.md
```

`neotoma discover` is a read-only ranking pass. It does not modify any source files. `ingest-transcript` previews structure before any write. `ingest` is the actual write step and stamps each row with provenance so you can trace any stored fact back to the source file.

If you would rather start empty and let your agent populate Neotoma session by session, skip this step. Step 4 still works; it just measures forward-going behavior instead of historical reconstruction.

## Step 4 — Run side-by-side

Open two windows, sessions, or workspaces. Configure one to expose Neotoma's MCP server; configure the other without it. Ask the same questions in both.

Good comparison prompts:

- "Who did I last talk to about <project name>? What did we agree on?"
- "What's the current status of every task I committed to this month?"
- "Show me the timeline of changes for <entity>, with sources."
- "Why did we decide <decision>? What inputs were in front of us?"

The agent without Neotoma will improvise or refuse. The agent with Neotoma should be able to cite specific entities, observations, and source files for each answer.

## Step 5 — Decide

Two outcomes are fine:

- **Commit:** point your remaining clients at Neotoma's MCP server and let your existing memory file fade into archive. You can keep ingesting backward (older transcripts, exports) on your own pace.
- **Walk away:** stop the Neotoma server, remove its MCP entry from any client config, and delete the data directory. Your prior setup is exactly as it was — there is nothing in your other memory store to revert.

```bash
# Stop the local API (if you started it)
neotoma api stop

# (Optional) wipe the trial data
rm -rf ~/.neotoma-shadow
```

## What this does not require

- [A schema, type registry, or pre-modeled data set](/schema-management) . Neotoma infers schemas as the agent stores.
- [Cloud sync or hosting](/hosted) . Everything in this guide runs on your machine.
- [Migrating data out of your current system](/neotoma-vs-files) . The shadow database is a fresh start; your existing files stay where they are.
- Commitment to a single tool. Neotoma is  [MCP-compatible](/mcp) , so you can run it next to  [platform memory](/neotoma-vs-platform-memory)  (Claude, ChatGPT) without conflict.


    Related:
    [install guide](/install)
    ,
    [walkthrough](/walkthrough)
    ,
    [schema versioning & evolution](/schemas/versioning)
    , and
    [backup and restore](/backup)
    .
