# Codex remote MCP setup

Connect Codex CLI to a Neotoma instance over HTTPS with MCP OAuth.

Applies to v0.25.0 and main. The Codex CLI commands reflect the installed CLI's `codex mcp --help`; check your own installed version if its options differ.

## Scope

This guide covers Codex on a different machine or in a sandbox that cannot run Neotoma locally. For a same-machine stdio connection, use [`neotoma setup --tool codex`](../../install.md#step-24-apply-the-full-setup-in-one-call). The repository's [`agent_cli_configuration.md`](agent_cli_configuration.md) describes local project config syncing, not this remote connection.

## Connect

1. Install and configure Neotoma on the machine that will host the instance, following [`install.md`](../../install.md). Start its API with an HTTPS tunnel or use an existing HTTPS deployment. For a local instance exposed by a tunnel, the documented command is:

   ```bash
   neotoma api start --env prod --tunnel
   ```

   Follow the [tunnel guide](tunnels.md) for the public HTTPS URL. Use the instance's actual URL; the MCP endpoint is `/mcp`.

2. On the machine running Codex, add the streamable HTTP endpoint. Substitute your own host in the command:

   ```bash
   codex mcp add neotoma --url https://<your-instance-host>/mcp
   ```

3. Start the OAuth flow and complete the browser's Neotoma authorization prompts. The instance may require its key-auth preflight before it offers connection approval. Codex also supports `codex mcp login neotoma --no-browser` when it cannot open a browser; that option prints an authorization URL and accepts the callback URL.

   ```bash
   codex mcp login neotoma
   ```

4. Confirm that Codex has the server entry, then start or restart a Codex session and check its available MCP tools. `codex mcp get` checks configuration; a tool-list check in the session confirms the connection and authorization actually work.

   ```bash
   codex mcp get neotoma
   ```

OAuth credentials are managed by Codex. Do not put an access token in the URL or commit one to project config. If discovery or login fails, consult [OAuth troubleshooting](mcp_oauth_troubleshooting.md) and confirm the instance's HTTPS URL and [OAuth discovery endpoint](mcp_cursor_setup.md#option-b-http-remote-via-tunnel).

## File storage across the connection

For `store`, a `file_path` names a path on the Neotoma server. A path on the Codex machine is not available to a remote instance and is rejected with `ERR_FILE_PATH_IS_SERVER_LOCAL`. Send bytes as `file_content` (base64) with `mime_type`, as shown in the [MCP overview](mcp_overview.md#store-a-file-over-remote-http-mcp), or use the REST multipart upload route for a larger file.

## Testing requirements

The supported command shapes are visible in `codex mcp add --help`, `codex mcp login --help`, and `codex mcp get --help`. Neotoma's HTTP endpoint and OAuth flow are implemented in `src/actions.ts` and `src/services/mcp_oauth.ts`; the [OAuth implementation reference](mcp_oauth_implementation.md) describes the server behavior. This guide does not assert that every third-party Codex version has been exercised against every Neotoma deployment.

See the [official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) for client-side server and OAuth options.

## Agent Instructions

### When to Load This Document

Load this guide when configuring Codex CLI to reach a remote Neotoma MCP server.

### Constraints Agents Must Enforce

Use the instance's actual HTTPS `/mcp` URL, keep credentials out of project files, and verify the tool list after login.
