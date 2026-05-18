---
title: Sandbox Neotoma Deployment
summary: "*(Public read/write demo at `sandbox.neotoma.io`)*"
---

# Sandbox Neotoma Deployment
*(Public read/write demo at `sandbox.neotoma.io`)*

## Scope

This document covers the public sandbox Neotoma deployment that lets anyone
try the Neotoma MCP server, HTTP API, and Inspector UI without installing
anything. It documents:

- The architecture and sandbox-only runtime behaviors (`NEOTOMA_SANDBOX_MODE`).
- Ephemeral per-visitor sessions and hard-ephemerality contract.
- Seed data policy, fixture packs, and the weekly reset schedule.
- Terms of use, abuse reporting pipeline, and moderation posture.
- Operator runbook for trust-and-safety (T&S) triage.

This document does NOT cover:

- Local development setup (see `docs/developer/getting_started.md`).
- Production MCP deployment to `mcp.neotoma.io` (see
  `docs/infrastructure/deployment.md` §"MCP host").
- Feedback pipeline architecture (see
  `docs/subsystems/agent_feedback_pipeline.md`).

## Architecture overview

```
┌──────────────────────────────────┐
│   sandbox.neotoma.io (Fly)       │
│                                  │
│  ┌────────────────────────────┐  │
│  │ Neotoma MCP + HTTP         │  │  NEOTOMA_SANDBOX_MODE=1
│  │ API (Express)              │  │
│  │                            │  │
│  │ /mcp    /store  /...       │  │
│  │ /sandbox/session/new      →│  │  Ephemeral session creation
│  │ /sandbox/session/redeem   →│  │  One-time code redemption
│  │ /sandbox/session (GET/DEL) │  │  Session info / termination
│  │ /sandbox/terms             │  │
│  │ /sandbox/report           →│──┼─► HttpSandboxReportTransport
│  │ /inspector/...  (static) ←─│──┼─  (Inspector SPA, /inspector)
│  └────────────────────────────┘  │
│                                  │
│  /data volume (sqlite +          │
│  sources/) — wiped weekly        │
└───────────────┬──────────────────┘
                │ POST /sandbox/report/submit
                ▼
┌──────────────────────────────────┐
│ agent.neotoma.io (Netlify)       │
│                                  │
│  sandbox_report_submit           │
│  sandbox_report_status           │
│  ──► Netlify Blobs               │
│     (sandbox_reports store)      │
│                                  │
│  Survives weekly resets;         │
│  triaged via same tooling        │
│  as product feedback.            │
└──────────────────────────────────┘
```

Everything runs on one Fly app (`neotoma-sandbox`). The Inspector SPA is
unconditionally bundled into the Docker image and served at `/inspector` on
the same origin. Users reach both the API (`https://sandbox.neotoma.io/mcp`)
and the UI (`https://sandbox.neotoma.io/inspector`) from a single hostname —
no CORS, no separate cert, no separate deployment.

**`inspector.neotoma.io` is deprecated.** All Inspector access is via
`/inspector` on the Neotoma server.

## Ephemeral session lifecycle

Each sandbox visitor gets an isolated, ephemeral workspace:

### Session handoff flow

1. Visitor arrives at `sandbox.neotoma.io/` and picks a fixture pack
   (generic, empty, or a use case) from the pack picker.
2. The landing page POSTs to `/sandbox/session/new { pack_id }`.
3. The server creates an ephemeral user (`is_ephemeral=1`), a
   `sandbox_sessions` row with hashed bearer and one-time code, and returns
   `{ one_time_code, expires_at, pack_id }`.
4. The landing page redirects to `/inspector#session=<code>` (same origin).
5. The Inspector's `consumeSandboxSessionHandoff` reads the hash, POSTs
   `/sandbox/session/redeem { code }` (same-origin), receives the bearer,
   stores it in `sessionStorage`, scrubs the hash, and reloads.
6. The Inspector is now authenticated as the ephemeral user.

### Session management endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/sandbox/session/new` | Create session (rate-limited 10/hr/IP) |
| `POST` | `/sandbox/session/redeem` | Exchange one-time code for bearer |
| `GET` | `/sandbox/session` | Session info (pack, expiry, user_id) |
| `POST` | `/sandbox/session/reset` | Purge data + reseed, keep session |
| `DELETE` | `/sandbox/session` | End session, hard-delete all data |

### Hard-ephemerality contract

- Session data is completely and permanently deleted when:
  - The session expires (default TTL: 7 days, capped to next Sunday 00:00 UTC).
  - The visitor explicitly ends the session (`DELETE /sandbox/session`).
  - The visitor resets the session (`POST /sandbox/session/reset`).
  - The weekly reset runs (`scripts/reset_sandbox.ts`).
- Deletion is hard: the ephemeral user, all their entities, observations,
  sources, relationships, and the `sandbox_sessions` row are removed.
- A background sweep runs every 15 minutes to clean up expired sessions.

### Cookie semantics

- Cookie name: `neotoma_sandbox_session`
- Flags: `HttpOnly; SameSite=Lax; Path=/`
- Same-origin: no `Secure` flag required for local dev; `SameSite=Lax` is
  sufficient because the Inspector and API share an origin.

## Fixture packs

Each sandbox session is seeded from a fixture pack defined in
`src/services/sandbox/pack_registry.ts`:

| Pack ID | Kind | Seed policy | Description |
| --- | --- | --- | --- |
| `generic` | `generic` | fixtures | Cross-domain starter with contacts, transactions, etc. |
| `empty` | `empty` | none | Empty workspace |
| `crm` | `use_case` | fixtures | CRM entities: contacts, deals, accounts |
| `financial-ops` | `use_case` | fixtures | Financial ops entities: transactions |
| `personal-data` | `use_case` | fixtures | Personal data: habits, preferences |
| `agent-auth` | `use_case` | fixtures | Agent authorization scenarios |
| … | `use_case` | fixtures | Additional use case packs |

Pack definitions must stay in sync between `src/services/sandbox/pack_registry.ts`
(backend) and `frontend/src/data/sandbox_packs.ts` (frontend). The unit test
`tests/unit/sandbox_pack_registry.test.ts` enforces this.

## Root landing page

`GET /` on a sandbox host renders a content-negotiated landing surface — HTML
for browsers, JSON for agents and `curl` — implemented in
`src/services/root_landing/`. In sandbox mode the page:

- Flags the instance as a public demo in both the HTML banner and the JSON
  `mode: "sandbox"` field.
- Renders a **pack picker** for starting ephemeral sessions, grouped into
  "Starter" (generic, empty) and "Use cases" (use-case-specific packs).
- Advertises sandbox-specific endpoints alongside the universal MCP and
  discovery endpoints.
- Renders harness connect snippets pre-filled with the sandbox MCP URL.
- Includes `sandbox_packs` and `sandbox_default_pack_id` in the JSON payload.
- Includes `curl` examples for session creation in the Markdown payload.
- Emits `robots.txt` with `Disallow: /`.

## Sandbox-mode runtime behaviors

When `NEOTOMA_SANDBOX_MODE=1`, the server applies the following rules:

1. **Ephemeral session auth (priority).** The auth middleware resolves
   sandbox sessions from the `neotoma_sandbox_session` cookie or
   `Authorization: Bearer` header before falling back to the shared public
   user. Expired/revoked sessions return 401.
2. **Anonymous writes attributed to `SANDBOX_PUBLIC_USER_ID`**
   (`11111111-1111-1111-1111-111111111111`). Unauthenticated callers without
   a session are treated as the shared demo user.
3. **Tighter rate limits.** Per-IP write caps and per-route limits are lower
   than production, and destructive admin endpoints return
   `403 SANDBOX_DISABLED`.
4. **Response header `X-Neotoma-Sandbox: 1`** is stamped on every response.
5. **Body-level `user_id` override is disabled** for the public sandbox user.
6. **`sandbox_abuse_report` schema is seeded on boot.**

## Seed data policy

The sandbox is reseeded weekly from a deterministic manifest at
`tests/fixtures/sandbox/manifest.json`. Per-use-case manifests live under
`tests/fixtures/sandbox/use_cases/<slug>/manifest.json`.

### Allowed content in `tests/fixtures/sandbox/`

- Synthetic / handcrafted dialogue only — no real users, no leaked emails,
  no real phone numbers.
- Public-domain or CC0-licensed source text only (include provenance line
  per file).
- No API keys, no secrets, no internal URLs.

## Weekly reset

**Sunday 00:00 UTC** (documented policy). The reset script
(`scripts/reset_sandbox.ts`):

1. Asserts `NEOTOMA_SANDBOX_MODE=1`.
2. Sweeps all expired ephemeral sessions.
3. Removes `neotoma.db*` files and `sources/` contents under `NEOTOMA_DATA_DIR`.
4. Waits `NEOTOMA_SANDBOX_POST_WIPE_DELAY_MS` milliseconds.
5. Calls `seedSandbox()` to repopulate from the manifest.

**Automation:** `.github/workflows/sandbox-weekly-reset.yml` (Sunday 00:05
UTC) runs `scripts/schedule_sandbox_reset.sh` via `fly ssh console`.

## Terms of use

`GET /sandbox/terms` returns a versioned terms-of-use document. Key clauses:

- The sandbox is a **public demo** — assume anyone can read anything you write.
- **No PII, secrets, or confidential data.**
- Data is wiped **weekly, Sunday 00:00 UTC**.
- Ephemeral sessions are hard-deleted on expiry or explicit termination.
- Destructive admin endpoints and body-level `user_id` overrides are disabled.

## Abuse reporting pipeline

The sandbox reuses the existing feedback pipeline pattern (see
`docs/subsystems/agent_feedback_pipeline.md`). Reports submitted via the
Inspector (`/inspector/sandbox`) or directly via `POST /sandbox/report` are
forwarded to the Netlify functions on `agent.neotoma.io` for durable storage
across weekly resets.

### Operator triage

1. Poll `GET /sandbox/report/status` or inspect the `sandbox_reports` Blobs
   store via the Netlify UI.
2. Inspect referenced entities in the sandbox Inspector at
   `https://sandbox.neotoma.io/inspector`.
3. For immediate removal, run
   `NEOTOMA_ADMIN_BEARER=... npx tsx scripts/sandbox_purge_entity.ts \
      --entity-id <id> --reason "<short-reason>"`

## Moderation posture

v0 is **reactive**, not proactive. The three controls that matter most for a
public demo are in place: rate limiting, destructive-op gating, and scheduled
wipes. Add proactive scanning if abuse thresholds are exceeded (see trigger
criteria in the previous version of this document).

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEOTOMA_SANDBOX_MODE` | Fly (`fly.sandbox.toml`) | Enable all sandbox-only behaviors. |
| `NEOTOMA_DATA_DIR` | Fly | Persisted volume path; used by reset script. |
| `NEOTOMA_SANDBOX_REPORT_FORWARD_URL` | Fly | Target for `HttpSandboxReportTransport` (Netlify). |
| `NEOTOMA_SANDBOX_REPORT_FORWARD_BEARER` | Fly | Bearer sent to Netlify with each forwarded report. |
| `AGENT_SITE_SANDBOX_BEARER` | Netlify | Same secret as `NEOTOMA_SANDBOX_REPORT_FORWARD_BEARER`. |
| `VITE_NEOTOMA_SANDBOX_UI` | Inspector build | Build-time flag for sandbox UI (banner, hide destructive actions). |
| `NEOTOMA_ROOT_LANDING_MODE` | Fly (optional) | Override root landing mode; defaults to sandbox when `NEOTOMA_SANDBOX_MODE=1`. |
| `NEOTOMA_PUBLIC_DOCS_URL` | Fly (optional) | Base URL for marketing docs links. Defaults to `https://neotoma.io`. |

**Removed variables** (no longer needed with bundled Inspector):
`NEOTOMA_INSPECTOR_STATIC_DIR`, `NEOTOMA_INSPECTOR_BASE_PATH`,
`NEOTOMA_PUBLIC_INSPECTOR_URL`, `VITE_NEOTOMA_API_URL`,
`VITE_PUBLIC_BASE_PATH`, `BUILD_INSPECTOR`.

## References

- [`docs/infrastructure/deployment.md`](../infrastructure/deployment.md) — Fly.io provisioning, Netlify setup.
- [`docs/subsystems/agent_feedback_pipeline.md`](agent_feedback_pipeline.md) — feedback pipeline that abuse reporting mirrors.
- [`docs/subsystems/agent_attribution_integration.md`](agent_attribution_integration.md) — AAuth identity tiers.
- `fly.sandbox.toml` — Fly app configuration.
- `scripts/reset_sandbox.ts` / `scripts/seed_sandbox.ts` — data-lifecycle scripts.
- `scripts/sandbox_purge_entity.ts` — T&S hard-delete utility.
- `src/services/sandbox_mode.ts` — runtime flag + destructive-route guard.
- `src/services/sandbox/` — sessions, report pipeline, terms, pack registry, seeder.
