# Tunnel + Auth Audit Matrix

Generated as part of the tunnel/OAuth/bearer-token audit. Maps each critical flow step to implementation code, documentation, and test coverage.

## 1. Flow Step Matrix

| Flow Step | Implementation | Docs | Tests | Status |
|-----------|---------------|------|-------|--------|
| **Tunnel URL discovery** (`discoverTunnelUrl`) | `src/config.ts:61-85` reads `/tmp/ngrok-mcp-url.txt` and `/tmp/cloudflared-tunnel.txt` | `tunnels.md` (Tunnel URL Auto-Discovery section) | **None** | Gap: no unit test for discovery logic |
| **Tunnel script** (ngrok + cloudflare) | `scripts/setup-https-tunnel.sh` | `tunnels.md` (provider sections) | **None** (shell script) | Covered by manual testing |
| **`isLocalRequest` classification** | `src/actions.ts:266-270` checks `Host` header for localhost/loopback | `tunnels.md` Security section (implicit) | **None** | **Gap: critical — no tests** |
| **`/mcp` auth gate (encryption off)** | `src/actions.ts:322-342` local → auto-assign, bearer → validate `NEOTOMA_BEARER_TOKEN` | `tunnels.md` Security, `auth.md` MCP Authentication | **None** for remote path | **Gap: no integration test for remote rejection** |
| **`/mcp` auth gate (encryption on)** | `src/actions.ts:312-321` requires key-derived MCP token | `tunnels.md` line 56, `auth.md` Key-Based Auth section | **None** for tunnel path | Gap |
| **`NEOTOMA_BEARER_TOKEN` validation** | `src/actions.ts:336-342` (MCP), `src/actions.ts:1648-1657` (REST) | `tunnels.md` line 55, `getting_started.md` line 65 | **None** | **Gap: no test** |
| **`ACTIONS_BEARER_TOKEN` (REST API)** | Not in `src/` code (playwright test fixtures only) | `rest_api.md:38-44` | Playwright fixtures set it | **FIXED**: `.env.example` now uses `NEOTOMA_BEARER_TOKEN`; `ACTIONS_BEARER_TOKEN` is a legacy alias. |
| **OAuth discovery** (`/.well-known/oauth-authorization-server`) | `src/actions.ts:162` | `rest_api.md` (not documented), `mcp_https_tunnel_status.md` mentions it | Playwright `oauth-flow.spec.ts` (indirect) | Gap: docs don't list this endpoint |
| **OAuth initiate** (`POST /mcp/oauth/initiate`) | `src/actions.ts:628` | `rest_api.md:55` uses `/api/mcp/oauth/initiate` | Playwright `oauth-flow.spec.ts` mocks it | **Route mismatch**: code = `/mcp/oauth/initiate`, docs = `/api/mcp/oauth/initiate` |
| **OAuth callback** (`GET /mcp/oauth/callback`) | `src/actions.ts:695` | `rest_api.md:90` uses `/api/mcp/oauth/callback` | Playwright mocks | **Route mismatch** |
| **OAuth key-auth gate** (`/mcp/oauth/key-auth`) | `src/actions.ts:767-845` | `auth.md:75-76` | `oauth_key_gate.test.ts` (unit only) | Partial: no tunnel-context test |
| **OAuth authorize** (`GET /mcp/oauth/authorize`) | `src/actions.ts:848` — tunnel requests require approval page + `isRedirectUriAllowedForTunnel` | `auth.md:84` | **None** | **Gap: redirect URI tunnel filtering untested** |
| **`isRedirectUriAllowedForTunnel`** | `src/services/mcp_oauth.ts:290-302` | `tunnels.md:60` (brief), `auth.md:84` | **None** | **Gap: critical security function untested** |
| **OAuth local-login** (`GET /mcp/oauth/local-login`) | `src/actions.ts:926` — tunnel approval page | Not in docs | **None** | Gap: undocumented |
| **OAuth status** (`GET /mcp/oauth/status`) | `src/actions.ts:1104` | `rest_api.md:111` | Playwright polls it | Route mismatch |
| **OAuth connections list** | `src/actions.ts:1123` | `rest_api.md:141` | Playwright mocks | Route mismatch |
| **OAuth token endpoint** (`POST /mcp/oauth/token`) | `src/actions.ts` (registered via SDK) | `auth.md:78` | **None** | Gap |
| **OAuth register** (`POST /mcp/oauth/register`) | `src/actions.ts:1063` | Not in docs | **None** | Gap |
| **Frontend OAuth page** | `frontend/src/components/OAuthPage.tsx` | `mcp_oauth_migration_guide.md` | `oauth-flow.spec.ts` (E2E) | Covered |
| **Frontend tunnel URL** | Uses `VITE_API_BASE_URL` or falls back to `""` / `localhost` | Not documented for tunnel use | **None** | Gap: frontend doesn't auto-detect tunnel |
| **CLI `auth login --tunnel`** | `src/cli/index.ts:4825-4875` reads tunnel URL file | `tunnels.md:104` | **None** | Gap: no CLI tunnel auth test |
| **CLI `api start --tunnel`** | `src/cli/index.ts:6863-7055` | `tunnels.md:102`, `cli_reference.md` | **None** | Gap |

## 2. Route Mismatch Summary

Code routes use `/mcp/oauth/*`. Documentation previously used `/api/mcp/oauth/*`. **FIXED**: All docs updated to match code (`/mcp/oauth/*`) in: `rest_api.md`, `auth.md`, `MCP_SPEC.md`, `developer_release_manual_test_checklist.md`, `mcp_server_examples_from_cursor_docs.md`.

## 3. Token Naming Divergence

| Token | Used in code | Used in docs | Resolution |
|-------|-------------|-------------|------------|
| `NEOTOMA_BEARER_TOKEN` | `src/actions.ts:336,1648`, CLI | `tunnels.md`, `auth.md` | **Active token for MCP/REST auth** |
| `ACTIONS_BEARER_TOKEN` | Playwright test fixtures only | `rest_api.md:38`, `getting_started.md:65` | **Legacy**: not checked in production code. `.env.example` migrated to `NEOTOMA_BEARER_TOKEN`. |

## 4. Previously Missing Referenced Documents — CREATED

| Referenced from | File | Status |
|----------------|------|--------|
| `tunnels.md`, `mcp_overview.md`, `mcp_oauth_migration_guide.md`, `chatgpt_actions_setup.md`, `mcp_claude_code_setup.md`, `agent_cli_configuration.md` | `mcp_cursor_setup.md` | **Created** — Cursor setup guide (stdio + HTTP, OAuth, troubleshooting) |
| `tunnels.md`, `mcp_overview.md`, `mcp_oauth_migration_guide.md` | `mcp_oauth_implementation.md` | **Created** — OAuth flow details, endpoint table, sequence diagram |
| `tunnels.md` | `mcp_oauth_troubleshooting.md` | **Created** — Common failure diagnostics and fixes |
| `mcp_https_testing.md` | `mcp_connect_button_troubleshooting.md` | **Created** — Redirect to `mcp_oauth_troubleshooting.md` |
| `mcp_overview.md` | `mcp_authentication_summary.md` | **Created** — Auth decision tree and method overview |

## 5. Test Coverage Gaps (Priority Order)

1. **`isLocalRequest` host classification** — No test at all. Security-critical.
2. **`isRedirectUriAllowedForTunnel`** — Security function with no test coverage.
3. **`/mcp` remote auth enforcement** — No integration test verifying tunnel requests without auth get 401.
4. **`NEOTOMA_BEARER_TOKEN` validation** — No test for the bearer path on `/mcp` or REST endpoints.
5. **Tunnel URL discovery** (`discoverTunnelUrl`) — No unit test.
6. **CLI `auth login --tunnel`** — No test.

## 6. Gap Closure Summary

### Implementation Changes (Phase 2)

| Change | File | Description |
|--------|------|-------------|
| Export `isLocalRequest` | `src/actions.ts:266` | Made testable from integration tests |
| Tunnel-preflight warning | `src/actions.ts` (OAuth initiate) | Logs warning when tunnel request arrives but `config.apiBase` is localhost |
| Fix bearer guard | `src/actions.ts:1657` | Added `headerAuth.startsWith("Bearer ")` check before extracting token |

### New Test Coverage (Phase 3)

| Test file | Tests | Coverage area |
|-----------|-------|---------------|
| `tests/integration/tunnel_auth.test.ts` | 8 | `isLocalRequest` host classification (localhost, 127.0.0.1, IPv6 limitation, ngrok, cloudflare, custom domain, empty, case-insensitive) |
| `src/services/__tests__/tunnel_oauth.test.ts` | 15 | `isRedirectUriAllowedForTunnel` allow/deny matrix (cursor/vscode/app schemes, localhost, 127.0.0.1, IPv6, external domains, edge cases) |
| `tests/integration/tunnel_discovery.test.ts` | 7 | Tunnel URL file discovery (ngrok, cloudflare, priority, fallback, empty, invalid content) |
| **Total new tests** | **30** | |

### Documentation Fixes (Phase 4)

| Fix | Files affected |
|-----|---------------|
| Route prefix `/api/mcp/oauth/*` → `/mcp/oauth/*` | `rest_api.md`, `auth.md`, `MCP_SPEC.md`, `developer_release_manual_test_checklist.md`, `mcp_server_examples_from_cursor_docs.md` |
| Token naming clarification | `rest_api.md` — `ACTIONS_BEARER_TOKEN` → `NEOTOMA_BEARER_TOKEN` with legacy note; `.env.example` corrected |
| Created `mcp_cursor_setup.md` | Cursor IDE setup (stdio + HTTP, OAuth, troubleshooting) |
| Created `mcp_oauth_implementation.md` | OAuth flow details, endpoint table, sequence diagram |
| Created `mcp_oauth_troubleshooting.md` | Common failure diagnostics (connect button, flow, token, tunnel) |
| Created `mcp_connect_button_troubleshooting.md` | Redirect to consolidated troubleshooting doc |
| Created `mcp_authentication_summary.md` | Auth decision tree and method overview |

### Deferred Risks

| Risk | Severity | Reason deferred |
|------|----------|----------------|
| `isLocalRequest` IPv6 `[::1]` limitation | Low | IPv6 loopback in Host headers is extremely rare; tunnel providers never use it. Documented in test. |
| No E2E Playwright test for full tunnel OAuth flow | Medium | Requires live tunnel or complex mock; existing unit/integration tests cover all component behavior. |
| `ACTIONS_BEARER_TOKEN` not used in code | Low | Only in Playwright test fixtures. May be removed in future cleanup. |
| Node.js `keepAliveTimeout` (5 s default) drops tunnel MCP sessions | Medium | **FIXED**: `src/actions.ts` `tryListen()` now sets `keepAliveTimeout=120s`, `headersTimeout=125s`; configurable via `NEOTOMA_KEEPALIVE_TIMEOUT_MS` / `NEOTOMA_HEADERS_TIMEOUT_MS`. |

## Related Documents

- [tunnels.md](tunnels.md)
- [auth.md](../subsystems/auth.md)
- [rest_api.md](../api/rest_api.md)
- [mcp_overview.md](mcp_overview.md)
- [mcp_cursor_setup.md](mcp_cursor_setup.md)
- [mcp_oauth_implementation.md](mcp_oauth_implementation.md)
- [mcp_oauth_troubleshooting.md](mcp_oauth_troubleshooting.md)
- [mcp_authentication_summary.md](mcp_authentication_summary.md)
