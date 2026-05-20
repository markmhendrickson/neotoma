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

## Option A: Auto-install via neotoma setup (recommended)

```bash
neotoma setup --tool windsurf --yes
```

This writes the Neotoma MCP server entry into Windsurf's user-level config and verifies the connection.

Alternatively, run the MCP config command directly:

```bash
neotoma mcp config --user-level --yes
```

Neotoma detects the Windsurf config path automatically.

## Option B: Manual — stdio (local install)

Create or edit `~/.codeium/windsurf/mcp_config.json`:

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

If `neotoma` is not on `PATH` from Windsurf's launch environment, use the absolute path:

```bash
which neotoma
```

Then substitute the full path, for example `/usr/local/bin/neotoma`.

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
- If the command is not found, use the absolute path to `neotoma` and restart Windsurf
- If using HTTP and getting 401, run `neotoma auth login` and verify the tunnel URL
- Windsurf loads MCP config at startup; changes require a full restart, not just a reload

## Config file locations

| Platform | Path |
| --- | --- |
| macOS / Linux | `~/.codeium/windsurf/mcp_config.json` |
| Windows | `%APPDATA%\Codeium\Windsurf\mcp_config.json` |
