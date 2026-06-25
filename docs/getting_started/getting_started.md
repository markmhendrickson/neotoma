---
title: Getting Started
summary: Install Neotoma, connect your AI tool, run your first ingestion, and verify the setup.
category: getting_started
audience: operator
visibility: public
order: 20
featured: true
tags: [install, setup, quickstart, mcp, connect]
---

# Getting Started

This guide takes you from nothing to a working memory your agent can read and write. It assumes you are comfortable on the command line.

## Prerequisites

- Node.js 20.x (the repo pins this in `.nvmrc`).
- npm 9 or newer.
- No `.env` is required for local storage.

## 1. Install

```bash
npm install -g neotoma
neotoma init
```

`neotoma init` sets up your data directory and local database. By default data lives under a directory you control; override it with `NEOTOMA_DATA_DIR`. Neotoma keeps separate development and production profiles. See the [configuration reference](../developer/getting_started.md) for the full set of `NEOTOMA_*` variables.

Other install paths: [Docker](../developer/docker.md), and the manual steps in the [CLI reference](../developer/cli_reference.md).

## 2. Connect your AI tool

Most hosts are a single command. Replace `<tool>` with your host.

```bash
neotoma setup --tool <cursor|claude-code|claude-desktop|codex|windsurf|continue|vscode|openclaw> --yes
neotoma mcp config
```

`neotoma mcp config` writes the MCP entry for your tool. It offers a few connection styles; the default is low-friction local stdio. Use the signed HTTP option when you run the Neotoma API and want attested connections. For per-host detail and hooks, see the [integrations matrix](../integrations/matrix.md) and [hooks guides](../integrations/hooks/README.md).

Neotoma exposes the same state over three transports: stdio, WebSocket, and streamable HTTP. Local stdio is the simplest for a single machine.

## 3. Run your first ingestion

From the CLI:

```bash
neotoma store --json='[{"entity_type":"task","title":"Submit expense report","status":"open"}]'
neotoma entities list --type task
neotoma upload ./invoice.pdf
```

The store call records an immutable observation and resolves it to a `task` entity. The list call reads the current snapshot. The upload call ingests a file: Neotoma extracts text (PDF, CSV, Parquet, JSON, and text are supported; images and audio are stored as raw sources), and your agent can extract structured records from it.

From an agent, the same operations happen through MCP tool calls such as `store`, `retrieve_entities`, and `retrieve_entity_by_identifier`. Every MCP call logs its equivalent CLI command, so you can always see what ran.

## 4. See it in the Inspector

Start the server and open the Inspector in a browser. The Inspector is bundled with Neotoma and served by the API server (at `/` for browsers). Browse to your entities, open one, and view its fields, history, and provenance. See [Using the Inspector](using_the_inspector.md).

## 5. Verify your setup

```bash
neotoma doctor
```

`doctor` checks your environment, database, and security configuration and reports problems with fixes. For ongoing health and recovery, see the [runbook](../operations/runbook.md) and [health check](../operations/health_check.md).

## Where to go next

- [Working with your memory](working_with_your_memory.md): store, correct, merge, search, and export.
- [Using the Inspector](using_the_inspector.md): the full web console.
- Building on the API: [REST API](../api/rest_api.md), [MCP tools](../developer/mcp/instructions.md), [SDKs](../developer/sdk_agent.md).
