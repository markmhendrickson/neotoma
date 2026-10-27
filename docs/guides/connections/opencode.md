# Connect OpenCode to Neotoma

Use MCP to let OpenCode read and write the Neotoma instance you select. The optional `@neotoma/opencode-plugin` package is not published to npm, so this guide does not offer plugin installation.

## Prerequisites

Operate a Neotoma instance and choose the local stdio or authenticated remote MCP transport supported by your installed OpenCode version. A remote client does not need a separate local Neotoma installation. Read [what changes on your system](../../topics/install/system-changes.md) before configuring a local instance.

## Configure

Use OpenCode's [MCP server configuration](https://opencode.ai/docs/mcp-servers/) to add Neotoma in `opencode.json`. For a local stdio connection, the Neotoma binary must be installed and initialized on the host machine. For a remote connection, use the operated instance's authenticated HTTPS `/mcp` endpoint and the authentication supported by your host version. Never paste credentials into a conversation.

## Verify and recover

Inspect OpenCode's connected tools and call `retrieve_entities` for a known entity on the intended instance and profile. An empty result proves transport, not that you selected the intended record. MCP access does not prove hook capture; do not enable background capture as part of this connection.

Use the [human connection index](https://neotoma.io/install/) to compare connection paths. `neotoma setup --tool opencode` is not a supported setup target.

## Sources

- [OpenCode MCP servers](https://opencode.ai/docs/mcp-servers/)
- [Neotoma MCP overview](../../developer/mcp_overview.md)
