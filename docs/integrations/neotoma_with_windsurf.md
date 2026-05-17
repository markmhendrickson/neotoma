---
title: Neotoma with Windsurf
summary: Windsurf is Codeium's AI-powered IDE. It supports MCP servers via `~/.codeium/windsurf/mcp_config.json` using the same format as Cursor, so the setup is identical to the Cursor path.
audience: user
---

# Neotoma with Windsurf

Windsurf is Codeium's AI-powered IDE. It supports MCP servers via `~/.codeium/windsurf/mcp_config.json` using the same format as Cursor, so the setup is identical to the Cursor path.

## Install Neotoma

```bash
npm install -g neotoma
neotoma init
neotoma auth login
```

## Auto-configure with neotoma setup

```bash
neotoma setup --tool windsurf --yes
```

This writes the Neotoma MCP server entry into Windsurf's user-level MCP config and verifies the connection. Restart Windsurf after setup completes.

You can also run the MCP config step directly:

```bash
neotoma mcp config --user-level --yes
```

Neotoma detects the Windsurf config path automatically on macOS, Linux, and Windows.

## Manual configuration

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

Use the absolute path to `neotoma` if the binary is not on `PATH` from Windsurf's launch environment.

**Config file locations:**

| Platform | Path |
| --- | --- |
| macOS / Linux | `~/.codeium/windsurf/mcp_config.json` |
| Windows | `%APPDATA%\Codeium\Windsurf\mcp_config.json` |

## Remote access

To connect Windsurf to a remote or tunneled Neotoma instance:

```bash
neotoma api start --env prod --tunnel
```

Then add the URL transport:

```json
{
  "mcpServers": {
    "neotoma": {
      "url": "https://<tunnel-host>/mcp"
    }
  }
}
```

Windsurf supports OAuth discovery, so `neotoma auth login` is sufficient — no manual token header needed when using the Neotoma tunnel.

See [tunnel](/tunnel) for the full tunnel setup guide.

## Verify the connection

After restarting Windsurf, Neotoma tools (`store`, `retrieve_entities`, `retrieve_entity_by_identifier`) should appear in Cascade → Tools → MCP. Ask Cascade to call `retrieve_entities` to confirm live access.

## Related

- [MCP reference](/mcp) — protocol details, transport modes, authentication
- [Install](/install) — full Neotoma install guide
- [Integrations](/integrations) — all supported hosts
