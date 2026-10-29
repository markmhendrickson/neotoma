# Connect Neotoma to Grok Bot

Connect a Neotoma instance through Grok Bot's documented MCP server settings.

**Manual connection path.** Grok Bot documents adding an MCP server by URL or by a command on its computer. This Neotoma route has not had an installed-host smoke test. Neotoma does not release `setup --tool grok-bot`.

## Before connecting

Read [what changes on your system](../../topics/install/system-changes.md) before choosing a local or remote connection. Follow the [human connection index](https://neotoma.io/install/) to install and initialize Neotoma on the Bot's own computer for a command-based connection. An installation on your laptop is separate. A URL-based connection requires an authenticated HTTPS endpoint reachable from the Bot. Keep credentials out of agent chats.

Grok Bot's computer is shared by every Bot on your account: files, browser sessions, and command-line credentials on it are available to those Bots. A command-based MCP server is available to your other Bots too. App connections belong to the account, so do not assume a URL-based connection is private to one Bot. Connect only a Neotoma instance and profile suitable for every Bot that can use this connection. For narrower data access, use a separately scoped Neotoma instance or credential and verify which Bots the host exposes the connection to.

## Configure

Use [Grok Bot's current MCP instructions](https://docs.x.ai/grok-bot/computer-and-apps) to add your Neotoma server by URL or command. For a URL, use the authenticated HTTPS `/mcp` endpoint. For a command, point the Bot to the installed Neotoma MCP process on its own computer. This path is distinct from Grok chat connectors. No verified Neotoma `setup --tool grok-bot` command is available.

## Verify and recover

Inspect the Bot's connected tools and retrieve a known entity on the intended Neotoma instance and profile. A successful registration alone does not prove the record is available. If retrieval fails, check the Bot's active connection, the target instance and profile, and the local process or remote endpoint.

## Sources

- [Grok Bot computer and apps](https://docs.x.ai/grok-bot/computer-and-apps)
- [Neotoma system changes](../../topics/install/system-changes.md)
