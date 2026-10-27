# Connect Codex CLI to Neotoma

Codex CLI reads MCP servers from its configuration. Neotoma’s setup target writes a local stdio entry; a remote server needs Codex’s separate HTTP and authentication flow.

Release reference: v0.26.0 (`b6ae615`, October 27th, 2026). The path was checked against source `4779784` and vendor documentation on October 24th, 2026; that source is included in this release. Installed-host compatibility and Windows behavior were not smoke tested.

**Path:** CLI setup for local stdio MCP.

## Before connecting

Local setup installs a CLI, initializes local profiles, and may write host MCP, instruction, and permission files; optional hooks or skills can capture later events. Read [what changes on your system](../../topics/install/system-changes.md) before running the command.

Follow the [human connection index](https://neotoma.io/install/) to install and initialize Neotoma. The `neotoma` executable must be on the same machine that runs a local stdio host. Use `neotoma status --json` to inspect Neotoma-side state. Remote connections require a reachable authenticated HTTPS `/mcp` endpoint; local stdio does not make a service remote. Keep credentials out of shared project files.

## Configure

```bash
neotoma setup --tool codex
```

Inspect `~/.codex/config.toml` and run `codex mcp list`; use a read-only Neotoma call from Codex after the server starts. The local setup target does not establish a remote OAuth session. For a remote endpoint, use `codex mcp add neotoma --url https://YOUR-HOST/mcp` and complete the host's authentication flow. Verify any permissions or approval rules in Codex itself rather than relying solely on generated config text.

## Verify and recover

Run `codex mcp list`, then call `retrieve_entities` for a known entity. If discovery works but retrieval fails, check the local process log or remote OAuth and endpoint separately. An empty retrieval is not evidence that a data profile is empty; test a known positive.

## Sources

- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
