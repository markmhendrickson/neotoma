# Connect Windsurf to Neotoma

Windsurf’s legacy Cascade agent accepts manual MCP configuration. Check which agent and configuration format your installed version uses before adding Neotoma.

Release reference: v0.26.0 (`b6ae615`, October 27th, 2026). The path was checked against source `4779784` and vendor documentation on October 24th, 2026; that source is included in this release. Installed-host compatibility and Windows behavior were not smoke tested.

**Path:** manual MCP configuration.

## Before connecting

A local stdio path installs Neotoma on the host machine and writes host configuration; a supported remote path instead configures an existing endpoint. Read [what changes on your system](../../topics/install/system-changes.md) before choosing or copying setup steps.

Follow the [human connection index](https://neotoma.io/install/) to install and initialize Neotoma. Node.js and the installed Neotoma package must be on the machine that runs a local stdio host. Use `neotoma status --json` to inspect Neotoma-side state. Remote connections require a reachable authenticated HTTPS `/mcp` endpoint; local stdio does not make a service remote. Keep credentials out of shared project files.

## Configure

For the legacy Cascade agent, add a local stdio entry in its MCP configuration (`mcp_config.json`, opened from Cascade's MCP menu):

Run `node -p "process.execPath"` and `npm root -g` to find the absolute Node.js executable and global package root. Replace the example paths below; the second is `<npm root -g>/neotoma/dist/index.js`. Confirm the entrypoint exists. This matches the installed-package entry produced by Neotoma's MCP config writer. A source checkout uses its absolute `scripts/run_neotoma_mcp_stdio_prod.sh` path instead. `neotoma mcp stdio` is not a CLI command.

```json
{ "mcpServers": { "neotoma": { "command": "/absolute/path/to/node", "args": ["/absolute/npm/root/neotoma/dist/index.js"], "env": { "NEOTOMA_ACTIONS_DISABLE_AUTOSTART": "1", "NEOTOMA_ENV": "production" } } } }
```

Reload the agent and inspect Cascade's MCP tool list. The current default Devin Local agent uses Devin CLI config files instead of this legacy Cascade file; use the primary vendor instructions for that agent. A remote HTTP entry uses your authenticated HTTPS `/mcp` URL and the selected agent's current HTTP transport syntax. `neotoma setup --tool windsurf` currently accepts the name but can write a Cursor config instead, so it is **not** the recommended route. Check the Windsurf file itself rather than trusting setup output.

## Verify and recover

Inspect the active agent’s configuration and tool list, then call `retrieve_entities` for a known entity. If setup reported success but no Windsurf entry exists, check whether it wrote Cursor config instead. An empty retrieval is not evidence that a data profile is empty; test a known positive.

## Sources

- [Neotoma Windsurf manual guide](../../developer/mcp_windsurf_setup.md)
- [Windsurf MCP documentation](https://docs.devin.ai/desktop/cascade/mcp)
