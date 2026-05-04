# IronClaw MCP Setup Guide

This guide covers connecting IronClaw to Neotoma through MCP. IronClaw can use hosted MCP servers through `ironclaw mcp`, while Neotoma exposes the structured memory tools IronClaw needs for cross-tool state.

## Compatibility status

- Neotoma installation is client-agnostic (`npm install -g neotoma`, `neotoma init`)
- IronClaw can connect to hosted MCP servers with `ironclaw mcp add`, `ironclaw mcp list`, and `ironclaw mcp test`
- IronClaw stores MCP server configuration in its database when available and falls back to `~/.ironclaw/mcp_servers.json`
- Use HTTP MCP as the stable setup path; use local stdio only when your IronClaw build documents stdio transport support

## Prerequisites

- Neotoma installed and initialized:

```bash
npm install -g neotoma
neotoma init
```

- IronClaw installed and onboarded:

```bash
ironclaw onboard
```

## Option A: HTTP MCP (recommended)

Use HTTP when IronClaw runs in NEAR AI Cloud, in a container, or on a different machine from Neotoma.

1. Start Neotoma with an HTTPS tunnel:

```bash
neotoma api start --env prod --tunnel
```

2. Add the Neotoma MCP endpoint to IronClaw:

```bash
ironclaw mcp add neotoma https://<tunnel-host>/mcp \
  --description "Neotoma structured memory"
```

3. Test the connection:

```bash
ironclaw mcp test neotoma
```

The test should list Neotoma tools such as `store_structured`, `retrieve_entities`, and `retrieve_entity_by_identifier`.

Neotoma does not currently write IronClaw configuration through `neotoma setup --tool ironclaw`. Use IronClaw's own `ironclaw mcp add` command so IronClaw can decide whether to persist the server in its database or disk fallback.

## Option B: Local stdio MCP (manual)

Use local stdio only when IronClaw and Neotoma run on the same machine and your IronClaw build supports stdio MCP transports in `~/.ironclaw/mcp_servers.json`.

Example disk fallback entry:

```json
{
  "servers": [
    {
      "name": "neotoma",
      "url": "",
      "description": "Neotoma structured memory",
      "enabled": true,
      "transport": {
        "transport": "stdio",
        "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio_prod.sh",
        "args": []
      }
    }
  ]
}
```

Use absolute paths and run `npm run build:server` once after cloning the repo.

## Option C: CLI fallback

If your IronClaw environment cannot reach MCP yet, run Neotoma CLI commands from the same machine as Neotoma:

```bash
neotoma entities list --type task
neotoma store --json='[{"entity_type":"task","title":"Follow up","status":"open"}]'
```

## Verification checklist

- `ironclaw mcp list` shows `neotoma` as enabled
- `ironclaw mcp test neotoma` lists Neotoma tools
- `retrieve_entities` returns data
- `store_structured` creates a test record and can be read back
- The same record is visible from another MCP client such as Cursor, Claude Code, or Codex

## Troubleshooting

- If `ironclaw mcp test neotoma` returns an HTTP error, verify the tunnel URL and confirm Neotoma is serving `/mcp`
- If tools do not appear, restart IronClaw after adding the server
- If using OAuth, run `ironclaw mcp auth neotoma` only after confirming your Neotoma endpoint advertises OAuth
- If local stdio fails, use HTTP MCP instead; IronClaw's documented CLI path is URL-oriented
