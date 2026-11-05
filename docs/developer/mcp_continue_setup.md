# Continue MCP Setup Guide

This guide covers connecting Continue to Neotoma through MCP. Continue reads `~/.continue/config.json` at startup and supports MCP servers via the `mcpServers` key.

## Compatibility status

- Neotoma installation is client-agnostic (`npm install -g neotoma`, `neotoma init`)
- Continue supports MCP servers in `~/.continue/config.json` using the `experimental.modelContextProtocolServers` array (Continue v0.9+) or the top-level `mcpServers` map (Continue v1.0+)
- Both stdio and HTTP MCP transports are supported; stdio is recommended for local installs

## Prerequisites

- Neotoma installed and initialized:

```bash
npm install -g neotoma
neotoma init
```

- Continue installed in your IDE (VS Code, JetBrains, or standalone).

## Option A: Host configuration

Configure Continue manually with the current host format. `neotoma setup --tool continue` can write Cursor configuration instead of Continue configuration. Check the active Continue file and tool list.

## Option B: Manual — stdio (local install)

For the installed-package stdio example below, run `node -p "process.execPath"` and `npm root -g`, then replace the two example paths with the absolute Node.js executable and `<npm root -g>/neotoma/dist/index.js`. Confirm that file exists. This is the launch shape used by Neotoma's MCP config writer. A source checkout uses its absolute `scripts/run_neotoma_mcp_stdio_prod.sh` path instead.

Add to `~/.continue/config.json`:

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

Restart Continue (reload the IDE window) after editing the config file.

## Option C: Remote HTTP MCP

Use HTTP when running Neotoma on a remote machine or via a tunnel.

1. Start Neotoma with an HTTPS tunnel:

```bash
neotoma api start --env prod --tunnel
```

2. Add the HTTP entry to `~/.continue/config.json`:

```json
{
  "mcpServers": {
    "neotoma": {
      "url": "https://<tunnel-host>/mcp"
    }
  }
}
```

For OAuth, `neotoma auth login` first, then add `"headers": { "Authorization": "Bearer <token>" }` if your Continue build does not support OAuth discovery.

## Verification checklist

- Reload the IDE after editing `~/.continue/config.json`
- Confirm `neotoma` tools appear in Continue's tool list (Context Providers → MCP)
- Run a test store: `retrieve_entities` should return data, `store` should create a test record
- Confirm the record is visible from another MCP client such as Cursor or Claude Code

## Troubleshooting

- If tools do not appear after reload, check the Continue output panel for MCP server errors
- If using stdio and the command is not found, confirm the absolute Node.js path and package entrypoint and restart Continue
- If using HTTP and getting 401, run `neotoma auth login` and verify the tunnel is reachable
- Continue caches MCP server state; a full IDE restart clears stale state when a config change is not picked up

## Notes on Continue config.json format

Continue's `mcpServers` key is documented at [continue.dev/docs/reference/config](https://docs.continue.dev/reference/config). The map key is the server display name shown in the Continue UI. Earlier versions of Continue used `experimental.modelContextProtocolServers` as an array; both formats are accepted depending on Continue version.
