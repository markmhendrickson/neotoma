# Connect ChatGPT to Neotoma

ChatGPT reaches a Neotoma MCP server over authenticated HTTPS. A local stdio command on your computer is not a ChatGPT connection.

Release reference: v0.26.0 (`b6ae615`, October 27th, 2026). The path was checked against source `4779784` and vendor documentation on October 24th, 2026; that source is included in this release. Installed-host compatibility and Windows behavior were not smoke tested.

**Path:** manual remote MCP connector, or Custom GPT Actions.

## Before connecting

The host stores a remote connector and may gain access to the operated record; the CLI and database remain where the endpoint is operated. Read [what changes on your system](../../topics/install/system-changes.md) before adding the connector.

Use the [human connection index](https://neotoma.io/install/) to compare the supported connection paths. Use an already operated, reachable authenticated HTTPS Neotoma `/mcp` endpoint. ChatGPT does not run your local Neotoma CLI, and connecting it does not initialize a local record. Confirm the account’s current connector and authentication requirements; keep credentials out of shared project files.

## Configure

ChatGPT cannot launch a Neotoma stdio process on your computer. Make Neotoma's authenticated `/mcp` endpoint reachable over HTTPS, then add that URL using ChatGPT's current MCP connector or plugin flow, according to the features available to your account. Configure its authentication in the host flow. If you are building a Custom GPT with Actions, use Neotoma's OpenAPI schema instead; Actions are a distinct API surface and are not an MCP connection. There is no `neotoma setup --tool chatgpt` target.

Verify the connected MCP tools or, for Actions, the imported operation list and a read-only retrieval. A 401 points to credentials or OAuth configuration; a missing tool list points to registration or endpoint discovery.

## Verify and recover

Inspect the connected tools and call `retrieve_entities` for a known entity. For Custom GPT Actions, inspect the imported operations and make a read-only API call instead. A 401 indicates an authentication issue; an empty successful query proves only transport. An empty retrieval is not evidence that a data profile is empty; test a known positive.

## Sources

- [Neotoma ChatGPT MCP guide](../../developer/chatgpt_apps_setup.md)
- [OpenAI custom MCP server setup](https://developers.openai.com/api/docs/guides/custom-mcp-server)
