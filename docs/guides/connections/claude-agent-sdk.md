# Connect Claude Agent SDK to Neotoma

The Claude Agent SDK adapter records supported application events in Neotoma. Mount its hooks in the consumer app and verify a captured event.

Release reference: v0.26.0 (`b6ae615`, October 27th, 2026). The path was checked against source `4779784` and vendor documentation on October 24th, 2026; that source is included in this release. Installed-host compatibility and Windows behavior were not smoke tested.

**Path:** in-process adapter hooks.

## Before connecting

The adapter changes the consumer application and can capture later events; MCP connection is optional and separate. Read [what changes on your system](../../topics/install/system-changes.md) before enabling hooks.

Use the [human connection index](https://neotoma.io/install/) to compare the supported connection paths. Choose a Neotoma endpoint for the consumer application and install the adapter in that application. Adapter hooks capture events through the app; they do not register MCP or require a local stdio host. Check the endpoint, authorization, and capture scope before enabling hooks.

## Configure

Add `@neotoma/claude-agent-sdk-adapter` and `@neotoma/client` to the consumer application, then mount `createNeotomaAgentHooks()` callbacks in the SDK `query` options as shown in the adapter guide. Supply the Neotoma API endpoint and authentication through the adapter's supported options. Run an SDK interaction and confirm the expected turn or tool observation can be read back. Hooks do not automatically register an MCP server for the agent. If agent-driven structured reads and writes are required, add Neotoma MCP separately through the SDK's own MCP configuration.

This is a library integration; there is no `neotoma setup --tool claude-agent-sdk` target. Check the consumer application's SDK version and hook names before copying a version-specific example.

## Verify and recover

Run an SDK interaction designed to produce a permitted observation and read that event back from Neotoma. If no event appears, check hook registration, endpoint and authentication in the consumer app. MCP discovery is a separate check. An empty retrieval is not evidence that a data profile is empty; test a known positive.

## Sources

- [Neotoma SDK adapter guide](../../integrations/hooks/claude_agent_sdk.md)
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview)
