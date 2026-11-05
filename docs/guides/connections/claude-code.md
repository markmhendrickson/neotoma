# Connect Claude Code to Neotoma

Claude Code can launch Neotoma as a local MCP process while you work in a project. Use Neotoma’s supported setup target, then inspect the connection in Claude Code.

Release reference: v0.26.0 (`b6ae615`, October 27th, 2026). The path was checked against source `4779784` and vendor documentation on October 24th, 2026; that source is included in this release. Installed-host compatibility and Windows behavior were not smoke tested.

**Path:** CLI setup for local stdio MCP.

## Before connecting

Local setup installs a CLI, initializes local profiles, and may write host MCP, instruction, and permission files; optional hooks or skills can capture later events. Read [what changes on your system](../../topics/install/system-changes.md) before running the command.

Follow the [human connection index](https://neotoma.io/install/) to install and initialize Neotoma. The `neotoma` executable must be on the same machine that runs a local stdio host. Use `neotoma status --json` to inspect Neotoma-side state. Remote connections require a reachable authenticated HTTPS `/mcp` endpoint; local stdio does not make a service remote. Keep credentials out of shared project files.

## Configure

```bash
neotoma setup --tool claude-code
```

The setup target writes Neotoma's Claude Code MCP entry and instruction layers. Inspect the project `.mcp.json` or the selected user scope; these scopes differ. In Claude Code, run `/mcp` to confirm the server is connected. For a remote Neotoma instance, configure an authenticated HTTP MCP endpoint using Claude Code's own `claude mcp add --transport http` flow instead of assuming that local stdio reaches the remote instance. Hooks and skills are separate capabilities; an MCP connection alone does not prove they are active.

## Verify and recover

In Claude Code, run `/mcp`. Confirm the selected local instance and data profile through MCP configuration and `neotoma status --json`; for remote access, compare the configured authenticated `/mcp` URL with the intended host. For an existing profile, retrieve a known existing entity **before any write** and check that it belongs to the intended profile. For a new, empty profile, the host's MCP tool list confirms transport and tool access, not that the data profile is the intended one; do not create a fixture just to verify installation. After the first user-authorized store of supplied data, retrieve the exact returned entity ID to confirm the connected instance's read/write path, while recognizing that this does not independently prove it was the intended target. If the server is absent, inspect the chosen `.mcp.json` or user entry and local `neotoma` PATH. Hooks, skills, and permissions need their own checks.

## Sources

- [Neotoma Claude Code guide](../../developer/mcp_claude_code_setup.md)
- [Claude Code MCP](https://docs.anthropic.com/en/docs/claude-code/mcp)
