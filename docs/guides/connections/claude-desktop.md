# Connect Claude Desktop to Neotoma

Claude Desktop loads local MCP servers from its user configuration. Neotoma setup needs explicit user scope to write the Desktop destination.

Release reference: v0.26.0 (`b6ae615`, October 27th, 2026). The path was checked against source `4779784` and vendor documentation on October 24th, 2026; that source is included in this release. Installed-host compatibility and Windows behavior were not smoke tested.

**Path:** CLI setup with user scope for local stdio MCP.

## Before connecting

Local setup installs a CLI, initializes local profiles, and may write host MCP, instruction, and permission files; optional hooks or skills can capture later events. Read [what changes on your system](../../topics/install/system-changes.md) before running the command.

Follow the [human connection index](https://neotoma.io/install/) to install and initialize Neotoma. The `neotoma` executable must be on the same machine that runs a local stdio host. Use `neotoma status --json` to inspect Neotoma-side state. Remote connections require a reachable authenticated HTTPS `/mcp` endpoint; local stdio does not make a service remote. Keep credentials out of shared project files.

## Configure

```bash
neotoma setup --tool claude-desktop --install-scope user
```

The explicit user scope matters: the default project setup path can target `.cursor/mcp.json` rather than the Desktop config. Inspect Claude Desktop's actual MCP config and restart the app. A remote Claude connector is a separate host workflow requiring a reachable authenticated endpoint; it is not configured by this local stdio command.

## Verify and recover

Inspect `claude_desktop_config.json`, restart Desktop, and call `retrieve_entities` for a known entity. If the file was not written, confirm `--install-scope user` and inspect the CLI output. An empty retrieval is not evidence that a data profile is empty; test a known positive.

## Sources

- [MCP Desktop quickstart](https://modelcontextprotocol.io/quickstart/user)
