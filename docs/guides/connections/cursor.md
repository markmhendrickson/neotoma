# Connect Cursor to Neotoma

Cursor can load Neotoma from its project or user MCP configuration. Choose the scope you intend to use and check Cursor’s tools after setup.

Release reference: v0.26.0 (`b6ae615`, October 27th, 2026). The path was checked against source `4779784` and vendor documentation on October 24th, 2026; that source is included in this release. Installed-host compatibility and Windows behavior were not smoke tested.

**Path:** CLI setup for local stdio MCP.

## Before connecting

Local setup installs a CLI, initializes local profiles, and may write host MCP, instruction, and permission files; optional hooks or skills can capture later events. Read [what changes on your system](../../topics/install/system-changes.md) before running the command.

Follow the [human connection index](https://neotoma.io/install/) to install and initialize Neotoma. The `neotoma` executable must be on the same machine that runs a local stdio host. Use `neotoma status --json` to inspect Neotoma-side state. Remote connections require a reachable authenticated HTTPS `/mcp` endpoint; local stdio does not make a service remote. Keep credentials out of shared project files.

## Configure

```bash
neotoma setup --tool cursor
```

Inspect the generated `.cursor/mcp.json` or user-scoped Cursor configuration. Restart Cursor if it has not loaded the new server. For remote use, add the authenticated HTTPS `/mcp` URL using Cursor's MCP configuration and verify that it points to the intended Neotoma instance. Neotoma's hook layer is separate from MCP and needs its own verification if enabled.

## Verify and recover

Inspect the selected `.cursor/mcp.json` or user config and Cursor’s tool list. Call `retrieve_entities` for a known entity. If tools are absent, check the config destination and the local binary PATH. An empty retrieval is not evidence that a data profile is empty; test a known positive.

## Sources

- [Neotoma Cursor guide](../../developer/mcp_cursor_setup.md)
- [Cursor MCP configuration](https://docs.cursor.com/context/model-context-protocol)
