# Connect OpenClaw to Neotoma

OpenClaw connects through Neotoma’s native plugin first. Neotoma’s setup command can add instruction and MCP layers afterward, but does not install that plugin.

Release reference: v0.26.0 (`b6ae615`, October 27th, 2026). The path was checked against source `4779784` and vendor documentation on October 24th, 2026; that source is included in this release. Installed-host compatibility and Windows behavior were not smoke tested.

**Path:** native plugin first; CLI setup is a separate Neotoma layer.

## Before connecting

The native plugin command changes OpenClaw’s plugin installation; optional Neotoma setup may also write MCP, instruction, and permission files. Read [what changes on your system](../../topics/install/system-changes.md) before installing the plugin or running setup.

Use the [human connection index](https://neotoma.io/install/) to compare the supported connection paths. For the native plugin, prepare the Neotoma instance it will use and check OpenClaw’s installed plugin support. A local stdio route needs Neotoma on the machine running the host; authenticated remote MCP has separate endpoint requirements. The native plugin command below is distinct from `neotoma setup --tool openclaw`.

## Configure

The documented native path is:

```bash
openclaw plugins install clawhub:neotoma
```

Check that OpenClaw lists and loads the plugin, then make a read-only Neotoma call. If you also need Neotoma CLI instruction/MCP setup layers, `neotoma setup --tool openclaw` is a recognized target; it does **not** install the OpenClaw plugin. Local plugin operation and a remote HTTP MCP connection have different requirements. Configure remote HTTP manually in OpenClaw only when its installed version supports the transport and your `/mcp` endpoint is reachable and authenticated.

## Verify and recover

Check OpenClaw’s plugin list and make one read-only Neotoma call. If plugin loading fails, inspect the OpenClaw plugin log. A Neotoma MCP tool list alone does not prove the native plugin loaded. An empty retrieval is not evidence that a data profile is empty; test a known positive.

## Sources

- [Neotoma OpenClaw setup](../../developer/mcp_openclaw_setup.md)
- [OpenClaw plugin installation](https://docs.openclaw.ai/cli/plugins/install)
