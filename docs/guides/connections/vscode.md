# Connect VS Code / Copilot Chat to Neotoma

VS Code can load Neotoma through Agent mode’s MCP configuration. The workspace-specific VS Code file and portable MCP file use different JSON keys.

Release reference: v0.26.0 (`b6ae615`, October 27th, 2026). The path was checked against source `4779784` and vendor documentation on October 24th, 2026; that source is included in this release. Installed-host compatibility and Windows behavior were not smoke tested.

**Path:** manual MCP configuration.

## Before connecting

A local stdio path installs Neotoma on the host machine and writes host configuration; a supported remote path instead configures an existing endpoint. Read [what changes on your system](../../topics/install/system-changes.md) before choosing or copying setup steps.

Follow the [human connection index](https://neotoma.io/install/) to install and initialize Neotoma. Node.js and the installed Neotoma package must be on the machine that runs a local stdio host. Use `neotoma status --json` to inspect Neotoma-side state. Remote connections require a reachable authenticated HTTPS `/mcp` endpoint; local stdio does not make a service remote. Keep credentials out of shared project files.

## Configure

Use **MCP: Add Server** in VS Code and choose a local stdio command or your authenticated HTTPS `/mcp` URL. For local stdio, run `node -p "process.execPath"` and `npm root -g`; replace the example paths below with the absolute Node.js executable and `<npm root -g>/neotoma/dist/index.js`. Confirm the entrypoint exists. This is the installed-package launch shape produced by Neotoma's MCP config writer. A source checkout uses its absolute `scripts/run_neotoma_mcp_stdio_prod.sh` path instead. `neotoma mcp stdio` is not a CLI command. Choose the configuration destination intentionally. For the VS Code workspace format, `.vscode/mcp.json` uses `servers`:

```json
{ "servers": { "neotoma": { "type": "stdio", "command": "/absolute/path/to/node", "args": ["/absolute/npm/root/neotoma/dist/index.js"], "env": { "NEOTOMA_ACTIONS_DISABLE_AUTOSTART": "1", "NEOTOMA_ENV": "production" } } } }
```

VS Code's newer portable Copilot format uses `mcpServers` in workspace `.mcp.json` or Copilot's global config; do not mix the two schemas. Select an agent harness that exposes MCP tools, then inspect its tool list. `neotoma setup --tool vscode` can write Cursor config instead of VS Code config, so configure manually and check the destination file.

## Verify and recover

Inspect the active VS Code configuration and Agent mode tool picker, then call `retrieve_entities` for a known entity. If tools are absent, check the `servers` versus `mcpServers` file format and the chosen workspace. An empty retrieval is not evidence that a data profile is empty; test a known positive.

## Sources

- [VS Code MCP setup](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
- [VS Code config formats](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
