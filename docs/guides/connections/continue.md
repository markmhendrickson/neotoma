# Connect Continue to Neotoma

Continue loads MCP tools through its current agent configuration. Add Neotoma to the format your installed Continue version uses, then inspect Agent mode.

Release reference: v0.26.0 (`b6ae615`, October 27th, 2026). The path was checked against source `4779784` and vendor documentation on October 24th, 2026; that source is included in this release. Installed-host compatibility and Windows behavior were not smoke tested.

**Path:** manual MCP configuration.

## Before connecting

A local stdio path installs Neotoma on the host machine and writes host configuration; a supported remote path instead configures an existing endpoint. Read [what changes on your system](../../topics/install/system-changes.md) before choosing or copying setup steps.

Follow the [human connection index](https://neotoma.io/install/) to install and initialize Neotoma. Node.js and the installed Neotoma package must be on the machine that runs a local stdio host. Use `neotoma status --json` to inspect Neotoma-side state. Remote connections require a reachable authenticated HTTPS `/mcp` endpoint; local stdio does not make a service remote. Keep credentials out of shared project files.

## Configure

Current Continue documentation uses `config.yaml` with an `mcpServers` list. Add a local entry to your active Continue configuration:

Find the absolute Node.js executable and global package root without changing either install:

```bash
node -p "process.execPath"
npm root -g
```

Replace the two example paths below with those results. The second path is `<npm root -g>/neotoma/dist/index.js`; confirm that file exists before saving the host configuration. The installed-package entry is the same stdio entrypoint used by Neotoma's MCP config writer. A source checkout instead uses its absolute `scripts/run_neotoma_mcp_stdio_prod.sh` path. Do not use `neotoma mcp stdio`; the CLI has no such command.

```yaml
mcpServers:
  - name: Neotoma
    command: /absolute/path/to/node
    args:
      - /absolute/npm/root/neotoma/dist/index.js
    env:
      NEOTOMA_ACTIONS_DISABLE_AUTOSTART: "1"
      NEOTOMA_ENV: production
```

Continue also documents JSON server files under `.continue/mcpServers/`; follow that format if your installed build uses it. Reload the IDE, choose Agent mode, and inspect the tool list. The older Neotoma guide's `~/.continue/config.json` example may not match current Continue releases. `neotoma setup --tool continue` can write Cursor config instead of Continue config; use the manual route and inspect the actual file.

## Verify and recover

Inspect Continue Agent mode’s tool list and call `retrieve_entities` for a known entity. If the server is absent, compare the saved YAML or JSON location with the installed version’s documentation; do not trust a setup success code. An empty retrieval is not evidence that a data profile is empty; test a known positive.

## Sources

- [Continue MCP configuration](https://docs.continue.dev/customize/deep-dives/mcp)
- [Neotoma legacy guide](../../developer/mcp_continue_setup.md)
