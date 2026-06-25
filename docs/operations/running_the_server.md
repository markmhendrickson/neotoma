---
title: Running the Server
summary: Transports, ports, processes, background services, and HTTPS for running a Neotoma instance.
category: operations
audience: operator
visibility: public
order: 20
tags: [server, transports, mcp, http, operations]
---

# Running the Server

Neotoma exposes the same state over several transports. You run only the ones your clients need.

## Transports and processes

- **Stdio MCP.** The simplest local path: an agent spawns the Neotoma process and speaks MCP over stdin/stdout. No port or network exposure. This is what `neotoma mcp config` sets up by default.
- **HTTP API (and HTTP MCP).** The Express server exposes the REST API and the streamable HTTP MCP endpoint on `NEOTOMA_HTTP_PORT` (default `3080` dev, `3180` prod). It also serves the bundled Inspector.
- **WebSocket MCP bridge.** A separate process for browser and remote clients on `WS_PORT` (default `8280`), with optional end-to-end encryption of the payloads.

All three resolve to one OpenAPI-backed contract, so behavior is identical regardless of transport.

## Starting it

From a source checkout:

```bash
npm run dev          # MCP server over stdio (development)
npm run dev:server   # HTTP API (MCP available at /mcp)
npm run start:ws     # WebSocket MCP bridge
npm run dev:full     # API + Inspector + build watch
```

From an install, the `neotoma` CLI manages the API runtime (start, stop, status, logs). See the [CLI reference](../developer/cli_reference.md).

## Environments

`NEOTOMA_ENV` selects `development` or `production`. Production uses separate database, source, and log paths and the prod port. See the [Configuration Reference](configuration.md).

## Background services

On macOS, launch agents keep the API and supporting watchers running across logins. The repository provides setup scripts for the dev server, the prod server, and build watchers. See `developer/launchd_dev_servers.md` and `developer/launchd_prod_server.md`.

## HTTPS for remote clients

Remote MCP hosts (for example ChatGPT, or Claude over remote MCP) require HTTPS. The repository includes a tunnel script that exposes the local server over HTTPS for testing; for a durable deployment use a real hostname and TLS in front of the HTTP port. See [Deployment Modes](deployment.md).

## Health and recovery

Run `neotoma doctor` to check the environment, database, and security configuration. For operational procedures and database salvage, see the [runbook](runbook.md) and [health check](health_check.md).
