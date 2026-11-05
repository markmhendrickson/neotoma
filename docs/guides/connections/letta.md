# Connect Letta to Neotoma

Letta Agent SDK can attach Neotoma MCP tools to a session. Configure the endpoint in the SDK application and verify the tools in that session.

Release reference: v0.26.0 (`b6ae615`, October 27th, 2026). The path was checked against source `4779784` and vendor documentation on October 24th, 2026; that source is included in this release. Installed-host compatibility and Windows behavior were not smoke tested.

**Path:** Letta Agent SDK session configuration for a Neotoma MCP endpoint.

## Before connecting

Session registration changes Letta’s available tools, while Neotoma data stays at the operated endpoint. Read [what changes on your system](../../topics/install/system-changes.md) before attaching the endpoint.

Use the [human connection index](https://neotoma.io/install/) to compare the supported connection paths. Use an already operated, reachable authenticated HTTPS Neotoma `/mcp` endpoint for the Letta Agent SDK session. This registration does not install Neotoma on the Letta client machine. Check the current session API and keep credentials out of shared project files.

## Configure

Run a reachable authenticated Neotoma HTTPS `/mcp` endpoint. In the current Letta Agent SDK, pass it in `mcpServers` when creating or resuming a session:

```ts
await using session = client.resumeSession("YOUR_AGENT_ID", {
  mcpServers: {
    neotoma: {
      type: "http",
      url: "https://YOUR-HOST/mcp",
      headers: { Authorization: `Bearer ${process.env.NEOTOMA_TOKEN}` },
    },
  },
});
```

Use the `LettaAgentClient` initialization from Letta's current SDK guide. These tools belong to the SDK session; they are not persisted on the Letta agent. The older Neotoma guide describes a V1 `mcp_servers.create()` registration path and should not be copied into a current Agent SDK application without checking its version. Neotoma has no `setup --tool letta` target. The direction matters: Letta's own hosted MCP server exposes Letta agents to other clients, while this path gives a Letta agent Neotoma tools.

Verify that the session exposes `mcp__neotoma__retrieve_entities`, then have the agent call it. If initialization succeeds but the agent sees no Neotoma tools, inspect the session's MCP connection result and the endpoint/authentication before checking data.

## Verify and recover

Inspect the session’s MCP tools and call `retrieve_entities` for a known entity. If no tool appears, compare the SDK version and session-scoped registration format. An empty retrieval is not evidence that a data profile is empty; test a known positive.

## Sources

- [Neotoma Letta guide](../../developer/mcp_letta_setup.md)
- [Letta Agent SDK MCP tools](https://docs.letta.com/agent-sdk/mcp)
