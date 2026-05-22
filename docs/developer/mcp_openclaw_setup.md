# OpenClaw MCP Setup Guide

This guide covers connecting OpenClaw to Neotoma through MCP. OpenClaw is a first-class harness target for `neotoma setup` and uses a native plugin for permissions rather than a command allowlist.

## Compatibility status

- Neotoma installation is client-agnostic (`npm install -g neotoma`, `neotoma init`)
- `neotoma setup --tool openclaw --yes` auto-installs the MCP server entry and the published skills under `.openclaw/skills/`
- Both stdio and HTTP MCP transports are supported; stdio is recommended for local installs
- Permissions are managed by the OpenClaw native plugin, not by a CLI-managed allowlist (Neotoma's `setup` step skips the allowlist patch for OpenClaw on purpose)

## Prerequisites

- Neotoma installed and initialized:

```bash
npm install -g neotoma
neotoma init
```

- Node.js available on PATH
- OpenClaw environment with MCP client support

## Option A: Auto-install via neotoma setup (recommended)

```bash
neotoma setup --tool openclaw --yes
```

This installs the Neotoma MCP server entry and the published skills into `.openclaw/skills/`. Permissions are not patched (OpenClaw uses its native plugin instead).

Alternatively, run the MCP config command directly:

```bash
neotoma mcp config --user-level --yes
```

## Option B: Manual — stdio (local install)

If your OpenClaw environment cannot spawn `neotoma setup`, configure the MCP server entry manually. OpenClaw reads the same `mcpServers` JSON format as Cursor:

```json
{
  "mcpServers": {
    "neotoma": {
      "command": "neotoma",
      "args": ["mcp", "stdio"],
      "env": {}
    }
  }
}
```

If `neotoma` is not on `PATH` from OpenClaw's launch environment, use the absolute path (run `which neotoma` to find it) or the launcher script:

```json
{
  "mcpServers": {
    "neotoma": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio_prod.sh"
    }
  }
}
```

Run `npm run build:server` once after cloning the repo if you use the launcher script.

## Option C: HTTP MCP (remote or containerized)

Use HTTP when OpenClaw cannot spawn local stdio processes or when Neotoma runs remotely.

1. Start Neotoma API/MCP in the target environment
2. Configure OpenClaw to connect to the Neotoma MCP HTTP endpoint
3. Provide required auth headers/tokens for your environment

For remote transport and auth details, see:

- [`mcp_cursor_setup.md`](mcp_cursor_setup.md)
- [`mcp_authentication_summary.md`](mcp_authentication_summary.md)

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
