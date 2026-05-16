---
title: OpenClaw MCP Setup Guide
summary: This guide covers connecting OpenClaw to Neotoma using MCP when OpenClaw is running on the same machine as Neotoma, and fallback options when MCP is not available in your OpenClaw environment.
---

# OpenClaw MCP Setup Guide

This guide covers connecting OpenClaw to Neotoma using MCP when OpenClaw is running on the same machine as Neotoma, and fallback options when MCP is not available in your OpenClaw environment.

## Compatibility status

- Neotoma installation is client-agnostic (`npm install -g neotoma`, `neotoma init`)
- OpenClaw is compatible when it can connect to an MCP server (stdio or HTTP)
- If MCP is unavailable, use Neotoma CLI commands directly from the same machine

## Prerequisites

- Neotoma installed and initialized:

```bash
npm install -g neotoma
neotoma init
```

- Node.js available on PATH
- OpenClaw environment with MCP client support

## Option A: Local stdio MCP (recommended on same machine)

Use stdio when OpenClaw and Neotoma run on the same machine.

Example MCP server entry:

```json
{
  "mcpServers": {
    "neotoma": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio_prod.sh"
    },
    "neotoma-dev": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio.sh"
    }
  }
}
```

Use absolute paths and run `npm run build:server` once after cloning the repo.

## Option B: HTTP MCP (remote or containerized)

Use HTTP when OpenClaw cannot spawn local stdio processes or when Neotoma runs remotely.

1. Start Neotoma API/MCP in the target environment
2. Configure OpenClaw to connect to the Neotoma MCP HTTP endpoint
3. Provide required auth headers/tokens for your environment

For remote transport and auth details, see:

- `docs/developer/mcp_cursor_setup.md`
- `docs/developer/mcp_chatgpt_setup.md`
- `docs/developer/mcp_authentication_summary.md`

## CLI fallback

If OpenClaw in your environment does not expose MCP yet, run Neotoma via CLI:

```bash
neotoma entities list --type task
neotoma store --json='[{"entity_type":"task","title":"Follow up","status":"open"}]'
```

## Verification checklist

- OpenClaw can see Neotoma MCP tools (or CLI commands succeed)
- `retrieve_entities` returns data
- `store` creates a test record and can be read back

## Troubleshooting

- If tools do not appear, verify path and executable permissions for the stdio script
- If HTTP fails, verify base URL, auth token/header, and reachable port
- If startup fails after updates, rebuild server with `npm run build:server`
