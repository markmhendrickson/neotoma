# Neotoma MCP identity proxy (`neotoma mcp proxy`)

Stdio-only MCP clients (Cursor, Claude Code, Codex) can run **`neotoma mcp proxy`** (with optional **`--aauth`**) to forward JSON-RPC to Neotoma’s **HTTP** **`/mcp`** endpoint, inject `clientInfo`, relay `Mcp-Session-Id`, and optionally **RFC 9421 / AAuth**-sign each downstream request.

Canonical Cursor wiring, screenshots, and transport choice live in **[`mcp_cursor_setup.md`](../mcp_cursor_setup.md)**. This page summarizes **env vars**, the **local port file**, and **links to implementation**.

## Downstream URL and signing

| Variable | Default / notes |
|----------|-----------------|
| `MCP_PROXY_DOWNSTREAM_URL` | `http://127.0.0.1:3080/mcp` when unset (override per environment). |
| `MCP_PROXY_AAUTH` | When truthy, load `~/.neotoma/aauth/` keys and sign requests (`neotoma mcp proxy --aauth`). |
| `MCP_PROXY_CLIENT_NAME`, `MCP_PROXY_CLIENT_VERSION`, `MCP_PROXY_AGENT_LABEL` | Self-report for `clientInfo` injection. |
| `MCP_PROXY_BEARER_TOKEN`, `MCP_PROXY_CONNECTION_ID` | Optional auth headers. |
| `MCP_PROXY_SESSION_PREFLIGHT`, `MCP_PROXY_SESSION_PREFLIGHT_BASE`, `MCP_PROXY_FAIL_CLOSED` | Trust / preflight behavior. See `src/cli/mcp_proxy.ts` and `src/proxy/mcp_stdio_proxy.ts`. |
| `NEOTOMA_AAUTH_AUTHORITY_OVERRIDE` | Canonical host for signing when downstream uses `127.0.0.1` (often `localhost:<port>`). The signed **stdio shim** script can derive this from `MCP_PROXY_DOWNSTREAM_URL` when unset. |

## Signed stdio shim (`scripts/run_neotoma_mcp_signed_stdio_dev_shim.sh`)

Cursor’s `command` usually points at this script instead of invoking `neotoma mcp proxy` directly. The script:

1. Optionally resolves **`MCP_PROXY_DOWNSTREAM_URL`** from the **local port file** (below).
2. Sets **`NEOTOMA_AAUTH_AUTHORITY_OVERRIDE`** when appropriate.
3. **`exec`s** `mcp_dev_shim.ts`, whose worker runs **`npx tsx src/cli/index.ts mcp proxy --aauth`** by default.

### Local port files (dynamic `HTTP_PORT`, parallel dev + prod)

When **`NEOTOMA_MCP_USE_LOCAL_PORT_FILE=1`** (or `true`) is set in **`mcp.json` → `env`**:

- On each successful HTTP bind, the Actions server writes **`<repo>/.dev-serve/local_http_port_dev`** or **`local_http_port_prod`** from `NEOTOMA_ENV` (`src/actions.ts` → `writeLocalHttpPortFile` in `src/utils/local_http_port_file.ts`). **Dev** also mirrors the legacy **`<repo>/.dev-serve/local_http_port`** so older configs keep working. **`NODE_ENV=test`** skips the write so Vitest does not clobber a developer file.
- The shim reads port files based on **`NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE`**:
  - **`dev`** — tries `local_http_port_dev`, then legacy `local_http_port`.
  - **`prod`** — tries `local_http_port_prod` only.
  - **Unset** — legacy `local_http_port` only (same as pre-parallel behavior).
- Preset **A** / packaged **`neotoma mcp config`** entries set **`NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE`** to **`dev`** on `neotoma-dev` and **`prod`** on `neotoma`, so you can run **dev and prod HTTP APIs in parallel** and each MCP slot follows the correct bound port.
- If the port parses and a **TCP connect** to `127.0.0.1:<port>` succeeds within **`NEOTOMA_MCP_PORT_PROBE_MS`** (default **1200**, clamped **200–5000**), the shim sets `MCP_PROXY_DOWNSTREAM_URL=http://127.0.0.1:<port>/mcp`.
- Otherwise it falls back to **`MCP_PROXY_DOWNSTREAM_URL`** if set, else **`http://127.0.0.1:3080/mcp`** (dev / legacy) or **`http://127.0.0.1:3180/mcp`** when **`NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE=prod`**, and logs a **stderr** warning.

**Verification:** on MCP spawn, stderr should show `[neotoma-mcp-signed-shim] NEOTOMA_MCP_USE_LOCAL_PORT_FILE: …` and `[neotoma-mcp-proxy] Starting proxy: downstream=…`.

| Variable | Purpose |
|----------|---------|
| `NEOTOMA_MCP_USE_LOCAL_PORT_FILE` | `1` / `true` → resolve downstream URL from port files + TCP probe. |
| `NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE` | `dev` or `prod` — which port file(s) to read (preset A sets this per MCP slot). |
| `NEOTOMA_MCP_PORT_PROBE_MS` | TCP probe timeout in ms (default `1200`, max `5000`). |

**CLI parity:** When the same env vars are set in the shell (not only in `mcp.json`), the **`neotoma` CLI** `resolveBaseUrl()` path uses the same profile rules and TCP probe after session port env and before `config.json` `base_url`, returning `http://localhost:<port>` so AAuth authority matches the API (for example `neotoma inspector admin unlock`). Profile follows **`NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE`** if set, else **`NEOTOMA_ENV`**. Project root: `NEOTOMA_PROJECT_ROOT`, then `project_root` / `repo_root` in `~/.config/neotoma/config.json`, else `cwd`.

## MCP `initialize` capabilities

HTTP and stdio transports share the same **`NeotomaServer`** `initialize` behavior: declared **`tools.listChanged`** and **`resources`** must appear in the **`initialize` response** so clients can surface tools correctly. See **`docs/specs/MCP_SPEC.md` § 1.1** and `NEOTOMA_MCP_DECLARED_CAPABILITIES` in `src/server.ts`.

## HTTP 400 / 503 from `POST /mcp` (session errors)

Streamable HTTP MCP keeps each session in **process memory** (`mcpTransports` in `src/actions.ts`). The stdio proxy captures **`mcp-session-id`** from the **`initialize`** response and attaches it to later tool calls.

| Symptom | Typical cause | What to do |
|--------|----------------|------------|
| **400** — no session header on a non-`initialize` POST | Proxy never stored an id (failed init, stripped response header) or client skipped `initialize` | Restart the MCP server in the IDE; confirm proxy stderr shows a successful downstream `initialize` and that your reverse proxy **forwards** `mcp-session-id` on responses and requests (custom headers are not hop-by-hop but some templates hide unknown headers). |
| **503** — session header present but unknown on this instance | **Load-balanced replicas** without affinity: `initialize` hit instance A, `tools/call` hit B | Use **sticky sessions** for `POST /mcp` (same as [`/mcp/oauth`](../subsystems/auth.md) guidance), scale MCP to **one** API replica for `/mcp`, or terminate TLS on a single Node process. |
| **503** / **400** after deploy or restart | In-memory map cleared | Restart the MCP client once so `initialize` runs again. |

When debugging, read the proxy line `Downstream error status=… body=…` (stderr): the JSON body includes the real `message` from Neotoma or the MCP SDK.

## Related

- [`mcp_cursor_setup.md`](../mcp_cursor_setup.md) — Cursor `mcp.json` examples, signed shim, port file JSON.
- [`cli_reference.md`](../cli_reference.md) — Shim env vars in the runtime / MCP subsection.
- [`instructions.md`](instructions.md) — Agent behavior over MCP.
