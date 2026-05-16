---
title: ChatGPT Apps Setup Guide
summary: This guide explains how to run Neotoma as a ChatGPT App connector using the MCP endpoint.
---

# ChatGPT Apps Setup Guide

This guide explains how to run Neotoma as a ChatGPT App connector using the MCP endpoint.

For Custom GPT Actions (OpenAPI), see `docs/developer/mcp_chatgpt_setup.md`.
For auth/security hardening, see `docs/developer/chatgpt_apps_auth_security.md`.

## Prerequisites

1. Public HTTPS URL for your Neotoma API host
2. MCP endpoint reachable at `https://<host>/mcp`
3. OAuth endpoints reachable at:
   - `https://<host>/.well-known/oauth-authorization-server`
   - `https://<host>/.well-known/oauth-protected-resource`
   - `https://<host>/mcp/oauth/authorize`
   - `https://<host>/mcp/oauth/token`
4. ChatGPT account with Apps/Connectors Developer Mode enabled by your organization policy

## 1) Start Neotoma MCP Server

Local development:

```bash
npm run build:server
npm run dev:server
```

Expose HTTPS (for local dev) with a tunnel:

```bash
ngrok http 3080
```

Use the resulting HTTPS URL as your base.

## 2) Verify MCP + OAuth Endpoints

```bash
curl "https://<host>/.well-known/oauth-authorization-server"
curl "https://<host>/.well-known/oauth-protected-resource"
curl "https://<host>/mcp"
```

Expected behavior:

- `.well-known` endpoints return JSON metadata.
- `/mcp` unauthenticated requests return `401` with `WWW-Authenticate`.

## 3) Enable ChatGPT Developer Mode

In ChatGPT:

1. `Settings -> Apps & Connectors -> Advanced settings`
2. Enable **Developer mode**
3. Go back to `Settings -> Apps & Connectors` and click **Create**

## 4) Create Neotoma Connector

Set:

- **Connector URL**: `https://<host>/mcp`
- **Connector name**: `Neotoma`
- **Description**: concise and intent-rich; include when to use the connector

Then save and connect.

## 5) Validate Connector in Chat

Open a new chat and add the connector. Test:

- Retrieval intent: "Find my recent tasks."
- Identifier intent: "Find entities for identifier Jane Doe."
- Timeline intent: "Show timeline events from last month."
- Write intent: "Store this note: Reviewed launch checklist."

For write intents, confirm ChatGPT prompts for approval as expected.

## 6) Refresh Metadata After Tool Changes

After updating tool names/descriptions/schemas:

1. Redeploy the MCP server.
2. In ChatGPT connector settings, click **Refresh**.
3. Re-run the golden prompt set.

## Neotoma App-Specific Notes

- The timeline tool includes optional embedded UI metadata via `ui://neotoma/timeline_widget`.
- Tool descriptions are loaded from `docs/developer/mcp/tool_descriptions.yaml`.
- OAuth and dynamic registration are served from `src/actions.ts`.
