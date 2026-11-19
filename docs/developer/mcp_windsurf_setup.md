# Windsurf MCP Setup Guide

This guide covers connecting Windsurf (Codeium) to Neotoma through MCP. Windsurf reads `~/.codeium/windsurf/mcp_config.json` (macOS/Linux) or `%APPDATA%\Codeium\Windsurf\mcp_config.json` (Windows) at startup and supports the same `mcpServers` format as Cursor.

## Compatibility status

- Neotoma installation is client-agnostic (`npm install -g neotoma`, `neotoma init`)
- Windsurf supports MCP servers via `~/.codeium/windsurf/mcp_config.json` using the same JSON format as Cursor's `.cursor/mcp.json`
- Both stdio and HTTP MCP transports are supported; stdio is recommended for local installs
- `neotoma mcp config --user-level` auto-detects and writes the Windsurf config path

## Prerequisites

- Neotoma installed and initialized:

```bash
npm install -g neotoma
neotoma init
```

- Windsurf installed.

## Option A: Host configuration

Configure Windsurf manually with the current host format. `neotoma setup --tool windsurf` can write Cursor configuration instead of Windsurf configuration. Check the active Windsurf file and tool list.

## Option B: Manual — stdio (local install)

For the installed-package stdio example below, run `node -p "process.execPath"` and `npm root -g`, then replace the two example paths with the absolute Node.js executable and `<npm root -g>/neotoma/dist/index.js`. Confirm that file exists. This is the launch shape used by Neotoma's MCP config writer. A source checkout uses its absolute `scripts/run_neotoma_mcp_stdio_prod.sh` path instead.

Create or edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "neotoma": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/npm/root/neotoma/dist/index.js"],
      "env": { "NEOTOMA_ACTIONS_DISABLE_AUTOSTART": "1", "NEOTOMA_ENV": "production" }
    }
  }
}
```

Use the absolute Node.js executable and the installed package entrypoint found with the read-only commands above.

Restart Windsurf after editing the config file.

## Option C: Remote HTTP MCP

1. Start Neotoma with an HTTPS tunnel:

```bash
neotoma api start --env prod --tunnel
```

2. Add the HTTP entry to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "neotoma": {
      "url": "https://<tunnel-host>/mcp"
    }
  }
}
```

For OAuth, run `neotoma auth login` first. Windsurf supports OAuth discovery via `.well-known/oauth-authorization-server` so no manual token header is required when using the tunnel with `--tunnel`.

## Verification checklist

- Restart Windsurf after editing the config
- Confirm Neotoma tools appear in Windsurf's tool list (Cascade → Tools → MCP)
- Run a test: `retrieve_entities` should return data, `store` should create a test record
- Confirm the record is visible from another MCP client such as Cursor or Claude Code

## Troubleshooting

- If tools do not appear, check the Windsurf output panel for MCP server errors
- If the command is not found, confirm the absolute Node.js path and package entrypoint and restart Windsurf
- If using HTTP and getting 401, run `neotoma auth login` and verify the tunnel URL
- Windsurf loads MCP config at startup; changes require a full restart, not just a reload

## Config file locations

| Platform | Path |
| --- | --- |
| macOS / Linux | `~/.codeium/windsurf/mcp_config.json` |
| Windows | `%APPDATA%\Codeium\Windsurf\mcp_config.json` |
