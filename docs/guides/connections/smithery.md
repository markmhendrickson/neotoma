# Connect Smithery to Neotoma

Smithery can publish an existing Neotoma HTTPS MCP endpoint for discovery. Registry publication and a working authenticated tool connection require separate checks.

Release reference: v0.26.0 (`b6ae615`, October 27th, 2026). The path was checked against source `4779784` and vendor documentation on October 24th, 2026; that source is included in this release. Installed-host compatibility and Windows behavior were not smoke tested.

**Path:** external HTTPS URL registry.

## Before connecting

Registry publication exposes the selected endpoint address and connection metadata; it does not itself install Neotoma. Read [what changes on your system](../../topics/install/system-changes.md) before registering the endpoint.

Use the [human connection index](https://neotoma.io/install/) to compare the supported connection paths. Operate an authenticated HTTPS Neotoma `/mcp` endpoint before registering it. Smithery receives an endpoint registration; it does not install or initialize Neotoma on the visitor’s machine. Keep credentials out of shared project files.

## Configure

Smithery is a discovery/registration route, not a local Neotoma harness. First operate an authenticated HTTPS endpoint that serves Neotoma's `/mcp`; validate access from the network Smithery will use. Then follow Smithery's external URL publishing flow, supplying that endpoint and only the configuration schema required for registration. There is no `neotoma setup --tool smithery` command and no bundled Smithery-specific server to install.

After registration, read the registry entry back and confirm that it points to the intended `/mcp` URL. Use a read-only MCP call through the published connection. If scanning fails, inspect endpoint reachability, authentication discovery and server-card metadata; do not interpret a published card alone as a working tool connection.

## Verify and recover

Read back the Smithery entry and compare its URL with the intended HTTPS `/mcp` endpoint. Call `retrieve_entities` through the connection on a known entity; a published listing alone is insufficient. An empty retrieval is not evidence that a data profile is empty; test a known positive.

## Sources

- [Neotoma Smithery external URL guide](../../integrations/smithery_external_url.md)
- [Smithery external servers](https://smithery.ai/docs/build/publish)
