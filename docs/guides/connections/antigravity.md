# Connect Neotoma to Antigravity

Connect a Neotoma instance through Antigravity's custom MCP server settings.

**Manual connection path.** Antigravity documents custom MCP servers, but this Neotoma route has not had an installed-host smoke test. Neotoma does not release `setup --tool antigravity`.

## Before connecting

Read [what changes on your system](../../topics/install/system-changes.md) before choosing a local or remote connection. Follow the [human connection index](https://neotoma.io/install/) to install and initialize Neotoma on the machine running a local host. A remote connection requires an existing authenticated HTTPS endpoint; local `stdio` does not make an instance reachable elsewhere. Keep credentials out of shared project files and agent chats.

## Configure

Open [Antigravity's MCP settings](https://www.antigravity.google/docs/mcp?tab=cli) and add a custom server. For a local instance, point a `stdio` entry at the installed Neotoma MCP process on that machine. For a remote instance, use the authenticated HTTPS `/mcp` endpoint and Antigravity's current Streamable HTTP format. Follow the host's current authentication instructions. No verified Neotoma `setup --tool antigravity` command is available.

## Verify and recover

Inspect the tools Antigravity exposes and use a read-only retrieval of a known entity on the intended Neotoma instance and profile. A successful connection alone does not establish that it targets your records. If the tool is absent, inspect the active host configuration and Neotoma process or remote endpoint before changing credentials or data.

## Sources

- [Antigravity MCP settings](https://www.antigravity.google/docs/mcp?tab=cli)
- [Neotoma system changes](../../topics/install/system-changes.md)
