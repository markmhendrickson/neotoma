# VS Code (GitHub Copilot Chat MCP) Setup Guide

This guide covers connecting VS Code's GitHub Copilot Chat to Neotoma through MCP. VS Code reads `.vscode/mcp.json` in the workspace (project-level) for MCP server configuration, which Neotoma's project-level scanner detects automatically.

## Compatibility status

- Neotoma installation is client-agnostic (`npm install -g neotoma`, `neotoma init`)
- VS Code supports MCP servers in `.vscode/mcp.json` via the Copilot Chat Agent Mode (VS Code 1.99+)
- Both stdio and HTTP MCP transports are supported
- `neotoma mcp config` auto-detects `.vscode/mcp.json` by directory scan

## Prerequisites

- Neotoma installed and initialized:

```bash
npm install -g neotoma
neotoma init
```

- VS Code with GitHub Copilot Chat extension installed and GitHub Copilot subscription active.
- VS Code 1.99 or later (MCP support in Copilot Chat is generally available from 1.99).

## Option A: Auto-install via neotoma setup (recommended)

```bash
neotoma setup --tool vscode --yes
```

This writes the Neotoma MCP server entry into `.vscode/mcp.json` in the current workspace directory.

Alternatively, run the MCP config command directly:

```bash
neotoma mcp config --yes
```

When Neotoma detects a `.vscode/` directory, it writes `.vscode/mcp.json` automatically.

## Option B: Manual — stdio (local install)

Create or edit `.vscode/mcp.json` in your workspace root:

```json
{
  "servers": {
    "neotoma": {
      "type": "stdio",
      "command": "neotoma",
      "args": ["mcp", "stdio"]
    }
  }
}
```

If `neotoma` is not on `PATH` from VS Code's terminal environment, use the absolute path:

```bash
which neotoma
```

VS Code picks up `.vscode/mcp.json` changes on file save without requiring a restart.

## Option C: Remote HTTP MCP

1. Start Neotoma with an HTTPS tunnel:

```bash
neotoma api start --env prod --tunnel
```

2. Add the HTTP entry to `.vscode/mcp.json`:

```json
{
  "servers": {
    "neotoma": {
      "type": "sse",
      "url": "https://<tunnel-host>/mcp"
    }
  }
}
```

For OAuth, run `neotoma auth login` and add the bearer token:

```json
{
  "servers": {
    "neotoma": {
      "type": "sse",
      "url": "https://<tunnel-host>/mcp",
      "headers": {
        "Authorization": "Bearer ${input:neotomaToken}"
      }
    }
  }
}
```

Using `${input:neotomaToken}` prompts VS Code to ask for the token on first use and store it in the VS Code secrets store.

## Accessing MCP tools in Copilot Chat

MCP tools registered in `.vscode/mcp.json` appear in Copilot Chat when using **Agent Mode** (`@workspace` → click the tools icon or type `#` to insert a tool). Neotoma tools such as `store`, `retrieve_entities`, and `retrieve_entity_by_identifier` will be listed.

## Verification checklist

- Open Copilot Chat in Agent Mode (the sparkle icon or `Ctrl+Shift+I`)
- Click the tools icon and confirm Neotoma tools appear
- Run a test: ask Copilot to call `retrieve_entities` — it should return data
- Ask Copilot to `store` a test entity and confirm it is visible from another MCP client

## Troubleshooting

- If tools do not appear, ensure Copilot Chat is in **Agent Mode**, not the default chat mode
- If the command is not found, check that `neotoma` is on `PATH` from VS Code's integrated terminal: run `which neotoma` in the terminal
- If `.vscode/mcp.json` is not detected, verify the file is in the workspace root (same directory as `.vscode/`)
- MCP support requires GitHub Copilot Chat and a Copilot subscription; it is not available with Copilot Free

## Config file location

`.vscode/mcp.json` lives at the workspace root alongside `.vscode/settings.json`. It is safe to commit to version control — it does not contain secrets when using `${input:…}` for tokens. Add it to `.gitignore` if you prefer not to share MCP config with collaborators.

## Note on VS Code server format

VS Code's `.vscode/mcp.json` uses `servers` (not `mcpServers`) as the top-level key, and transport is declared via `"type": "stdio"` or `"type": "sse"` (not via a bare `command` or `url`). This differs from Cursor's format. Neotoma's MCP config writer handles this automatically when `neotoma setup --tool vscode` is used.
