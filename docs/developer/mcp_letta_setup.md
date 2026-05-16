---
title: Letta MCP Setup Guide
summary: "This guide covers connecting Letta agents to Neotoma through MCP. Letta registers MCP servers at runtime via its Python or TypeScript SDK — there is no static config file to write."
---

# Letta MCP Setup Guide

This guide covers connecting Letta agents to Neotoma through MCP. Letta registers MCP servers at runtime via its Python or TypeScript SDK — there is no static config file to write.

## Compatibility status

- Neotoma exposes a standard MCP endpoint over streamable HTTP (recommended) or stdio
- Letta supports MCP servers via `client.mcp_servers.create()` (Python SDK `letta-client`) or `client.mcpServers.create()` (TypeScript SDK)
- After registration, Neotoma tools (`store`, `retrieve_entities`, `retrieve_entity_by_identifier`, `correct`, and others) are available as callable agent tools in Letta
- No `neotoma setup --tool letta` CLI path exists; setup is code-only

## Prerequisites

- Neotoma installed and initialized:

```bash
npm install -g neotoma
neotoma init
neotoma auth login
```

- Letta Python SDK installed:

```bash
pip install letta-client
```

- A running Neotoma API accessible over HTTPS (for remote/streamable HTTP transport) or locally (for stdio transport in Docker environments)

## Option A: Streamable HTTP (recommended)

Start the Neotoma API with HTTPS:

```bash
neotoma api start --env prod --tunnel
```

Note the tunnel URL (e.g. `https://abc123.neotoma.dev`).

Then register Neotoma as an MCP server in your Letta agent setup code:

```python
from letta import create_client

client = create_client()

# Register Neotoma MCP server (one-time per Letta server instance)
neotoma_mcp = client.mcp_servers.create(config={
    "mcp_server_type": "streamable_http",
    "server_url": "https://abc123.neotoma.dev/mcp",
    "auth_header": "Authorization",
    "auth_token": "Bearer <your-neotoma-api-token>",
})

# Get the Neotoma tool definitions
neotoma_tools = client.tools.list_mcp_tools_by_server(neotoma_mcp.name)

# Create or update an agent with Neotoma tools attached
agent = client.agents.create(
    name="my-agent",
    tool_ids=[t.id for t in neotoma_tools],
    # ...other agent config...
)
```

Get your API token with:

```bash
neotoma auth token
```

Or use `neotoma auth login` to authenticate and then retrieve the token from `~/.neotoma/credentials.json`.

## Option B: SSE transport

Letta also supports SSE (Server-Sent Events) transport:

```python
neotoma_mcp = client.mcp_servers.create(config={
    "mcp_server_type": "sse",
    "server_url": "https://abc123.neotoma.dev/mcp",
    "auth_header": "Authorization",
    "auth_token": "Bearer <your-neotoma-api-token>",
})
```

SSE is interchangeable with streamable HTTP for Neotoma's MCP endpoint.

## Option C: Stdio (Docker-only)

Letta supports stdio MCP servers when the Letta server runs in Docker and the MCP binary is available in the same container. This path is not recommended for most setups.

```python
neotoma_mcp = client.mcp_servers.create(config={
    "mcp_server_type": "stdio",
    "command": "neotoma",
    "args": ["mcp", "stdio"],
})
```

Ensure `neotoma` is installed inside the Letta Docker container.

## TypeScript SDK

The TypeScript equivalent:

```typescript
import { LettaClient } from "@letta-ai/letta-client";

const client = new LettaClient();

const neotomaMcp = await client.mcpServers.create({
  mcpServerType: "streamable_http",
  serverUrl: "https://abc123.neotoma.dev/mcp",
  authHeader: "Authorization",
  authToken: "Bearer <your-neotoma-api-token>",
});

const neotomaTools = await client.tools.listMcpToolsByServer(neotomaMcp.name);

const agent = await client.agents.create({
  name: "my-agent",
  toolIds: neotomaTools.map((t) => t.id),
});
```

## Verification

After setup, confirm Neotoma tools are available to the agent:

```python
tools = client.tools.list_mcp_tools_by_server(neotoma_mcp.name)
print([t.name for t in tools])
# Should include: store, retrieve_entities, retrieve_entity_by_identifier, correct, ...
```

Have the agent call `retrieve_entities` to confirm live access to your Neotoma graph.

## Notes

- MCP server registrations persist on the Letta server instance. You do not need to re-register on every run — check if the server already exists before calling `create`.
- Neotoma tools appear alongside Letta's built-in core/recall/archival memory tools. They are additive — Neotoma does not replace Letta's internal memory system.
- For production deployments, use a self-hosted Neotoma instance with a stable HTTPS URL rather than a tunnel.

## Troubleshooting

- If `client.mcp_servers.create()` returns a conflict error, the server is already registered. Use `client.mcp_servers.list()` to retrieve the existing entry.
- If Neotoma tools do not appear when listing tools for the agent, verify the `tool_ids` are included in the agent's `create` or `update` call.
- If you receive `401` from the Neotoma MCP endpoint, verify the token with `neotoma auth token` and check that the tunnel is running.
- For stdio transport issues, ensure `neotoma` is in the container `PATH` and the Letta server has permission to spawn the process.
