# Connect IronClaw to Neotoma

IronClaw uses its own MCP registration flow. Neotoma has no IronClaw setup target, so inspect the host version and register the server there.

This path is described by checked Neotoma main (`4779784`); no released host-compatibility claim is made. Vendor documentation was checked on October 24th, 2026; installed-host compatibility and Windows behavior were not smoke tested.

**Path:** manual host-side MCP registration.

## Before connecting

Remote registration changes IronClaw’s host configuration; choosing local stdio additionally installs and initializes Neotoma on that host machine. Read [what changes on your system](../../topics/install/system-changes.md) before configuring either route.

Use the [human connection index](https://neotoma.io/install/) to compare the supported connection paths. Choose a Neotoma instance that IronClaw can reach. Remote MCP uses an operated authenticated HTTPS `/mcp` endpoint and does not require a local Neotoma CLI on the IronClaw client; local stdio, if supported by the installed version, requires Neotoma on the machine that launches it. Keep credentials out of shared project files.

## Configure

Neotoma has no `setup --tool ironclaw` target. For an IronClaw build that supports its MCP registration command, register a reachable authenticated Neotoma `/mcp` URL with `ironclaw mcp add`, then use `ironclaw mcp list` and `ironclaw mcp test neotoma` to check discovery. Follow the installed IronClaw version's command syntax and auth flow. Local stdio is conditional on that build's transport support; the Neotoma CLI does not write IronClaw's config for you.

## Verify and recover

Inspect IronClaw’s registered servers and use a read-only `retrieve_entities` call on a known entity. If registration fails, check the installed CLI syntax and endpoint/auth support. An empty retrieval is not evidence that a data profile is empty; test a known positive.

## Sources

- [Neotoma IronClaw guide](../../developer/mcp_ironclaw_setup.md)
- [IronClaw MCP CLI](https://www.mintlify.com/nearai/ironclaw/cli/mcp)
