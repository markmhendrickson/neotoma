# Sandbox Neotoma Deployment
*(Public read/write demo at `sandbox.neotoma.io`)*

## Scope

This document covers the public sandbox Neotoma deployment that lets anyone
try the Neotoma MCP server, HTTP API, and Inspector UI without installing
anything. It documents:

- The architecture and sandbox-only runtime behaviors (`NEOTOMA_SANDBOX_MODE`).
- Seed data policy and the weekly reset schedule.
- Terms of use, abuse reporting pipeline, and moderation posture.
- Operator runbook for trust-and-safety (T&S) triage.
- Triggers for adding proactive scanning if abuse emerges.

This document does NOT cover:

- Local development setup (see `docs/developer/getting_started.md`).
- Production MCP deployment to `mcp.neotoma.io` (see
  `docs/infrastructure/deployment.md` §"MCP host").
- Feedback pipeline architecture (see
  `docs/subsystems/agent_feedback_pipeline.md`).

## Architecture overview

```
┌─────────────────────────────┐
│   sandbox.neotoma.io (Fly)  │
│                             │
│  ┌───────────────────────┐  │
│  │ Neotoma MCP + HTTP    │  │   NEOTOMA_SANDBOX_MODE=1
│  │ API (Express)         │  │   SANDBOX_PUBLIC_USER_ID writes
│  │                       │  │
│  │ /mcp    /store  /...  │  │
│  │ /session             →┼──┼─► AAuth verify (identity-based)
│  │ /sandbox/terms        │  │
│  │ /sandbox/report       │  │──► HttpSandboxReportTransport
│  │ /app/...  (static) ←──┼──┼─   (Inspector SPA, subpath)
│  └───────────────────────┘  │
│                             │
│  /data volume (sqlite +     │
│  sources/) — wiped weekly   │
└────────────┬────────────────┘
             │ POST /sandbox/report/submit
             ▼
┌─────────────────────────────┐
│ agent.neotoma.io (Netlify)  │
│                             │
│  sandbox_report_submit      │
│  sandbox_report_status      │
│  ──► Netlify Blobs          │
│     (sandbox_reports store) │
│                             │
│  Survives weekly resets;    │
│  triaged via same tooling   │
│  as product feedback.       │
└─────────────────────────────┘
```

Everything runs on one Fly app (`neotoma-sandbox`). The Inspector SPA is
bundled into the Docker image and served from `/app/` so users can reach both
the API (`https://sandbox.neotoma.io/mcp`) and the UI
(`https://sandbox.neotoma.io/app`) from a single hostname — no CORS, no
separate cert.

## Root landing page

`GET /` on a sandbox host (e.g. `https://sandbox.neotoma.io/`) renders a
content-negotiated landing surface — HTML for browsers, JSON for agents and
`curl` — implemented in `src/services/root_landing/`. In sandbox mode the page:

- Flags the instance as a public demo ("Data here is public and resets every
  Sunday 00:00 UTC") in both the HTML banner and the JSON `mode: "sandbox"`
  field.
- Advertises the sandbox-specific endpoints `/sandbox/terms` and
  `/sandbox/report` alongside the universal MCP and discovery endpoints.
- Renders harness connect snippets (Claude Code, Claude Desktop, ChatGPT,
  Codex, Cursor, OpenClaw) pre-filled with `https://sandbox.neotoma.io/mcp`
  so visitors can copy-paste without substitution.
- Emits a `robots.txt` at `/robots.txt` with `Disallow: /` to keep the
  sandbox out of search indices.

Non-sandbox deployments render the same surface but with personal- or
production-appropriate copy; see
[`docs/infrastructure/deployment.md`](../infrastructure/deployment.md#root-landing-page-get-)
for the full `NEOTOMA_ROOT_LANDING_MODE` / `NEOTOMA_PUBLIC_DOCS_URL`
reference.

## Sandbox-mode runtime behaviors

When `NEOTOMA_SANDBOX_MODE=1`, the server in `src/services/sandbox_mode.ts`
and `src/actions.ts` applies the following rules:

1. **Anonymous writes attributed to `SANDBOX_PUBLIC_USER_ID`**
   (`11111111-1111-1111-1111-111111111111`). Unauthenticated callers are
   treated as the shared demo user. AAuth-signed callers are still attributed
   to their own verified identity, so every AAuth capability
   (`hardware`/`software` tier, `get_session_identity`, agent lookup) is
   fully exercisable.
2. **Tighter rate limits.** Per-IP write caps and per-route limits are set
   lower than production, and destructive admin endpoints
   (`/entities/merge`, `/entities/split`,
   `/recompute_snapshots_by_type`, `/health_check_snapshots`,
   `/update_schema_incremental`) return `403 SANDBOX_DISABLED`.
3. **Soft deletes allowed.** `/delete_entity` and `/delete_relationship` stay
   available because they are reversible and the weekly reset will replace
   the dataset anyway.
4. **Response header `X-Neotoma-Sandbox: 1`** is stamped on every response
   so clients (especially the Inspector) can detect sandbox mode without an
   extra probe.
5. **Body-level `user_id` override is disabled** for the public sandbox user
   — only `LOCAL_DEV_USER_ID` on a local dev box retains that affordance.
6. **`sandbox_abuse_report` schema is seeded on boot** via
   `seedSandboxAbuseReportSchema()` so incoming reports become first-class
   entities in the same Neotoma the public is using.

## Seed data policy

The sandbox is reseeded weekly from a deterministic manifest at
`tests/fixtures/sandbox/manifest.json`. That file lists:

- **Reused fixtures** from `tests/fixtures/` — only fixtures that are
  already synthetic and safe for public display are allowed.
- **New sandbox-only conversation fixtures**
  (`tests/fixtures/sandbox/conversations/*.json[l]`) — handcrafted synthetic
  ChatGPT / Claude conversations.
- **Public-domain source material**
  (`tests/fixtures/sandbox/public_domain/`) — e.g. Gutenberg excerpts (CC0).
- **Synthetic agent identities** so visitors can see multi-agent provenance
  in the Inspector without a live AAuth setup.
- **Explicit exclusions** — most notably
  `tests/fixtures/feedback/simon_apr21_reports.json`, which is attributed to
  a real internal collaborator and therefore must never appear publicly.

### Allowed content in `tests/fixtures/sandbox/`

- Synthetic / handcrafted dialogue only — no real users, no leaked emails,
  no real phone numbers.
- Public-domain or CC0-licensed source text only (include provenance line
  per file).
- No API keys, no secrets, no internal URLs.

Adding a new fixture requires reviewing it against this policy **and**
referencing it from `manifest.json` — fixtures not listed in the manifest
are ignored by the seeder.

## Weekly reset

**Sunday 00:00 UTC** (documented policy). The reset is implemented by the
compiled entrypoint `node dist/scripts/reset_sandbox.js` (built from
`scripts/reset_sandbox.ts` via `npm run build:server`).

The script:

1. Asserts `NEOTOMA_SANDBOX_MODE=1` (refuses to run otherwise; guards
   against accidental wipes of a prod dataset).
2. Removes `neotoma.db*` files and the contents of `sources/` under
   `NEOTOMA_DATA_DIR`.
3. Optionally waits `NEOTOMA_SANDBOX_POST_WIPE_DELAY_MS` milliseconds (default
   in automation: **3000**) so the running API process can recover after the
   SQLite files disappear.
4. Calls `seedSandbox()` over HTTP (`NEOTOMA_SANDBOX_BASE_URL`, defaulting to
   `http://127.0.0.1:3180` when run **inside** the Fly VM) to repopulate from the
   manifest.

### Why not a second Fly Machine on a schedule?

A Fly Volume attaches to **at most one** Machine at a time. The public sandbox
app already mounts `persistent_sandbox` at `/data`, so a separate
`fly machines run --volume …` reset job **cannot** mount the same volume while
the app is up.

**Automation:** enable `.github/workflows/sandbox-weekly-reset.yml` (Sunday
00:05 UTC) with repository secret `FLY_API_TOKEN`. It runs
`scripts/schedule_sandbox_reset.sh`, which uses **`fly ssh console`** to execute
the reset **on the running app VM** (same `/data` mount).

**Manual:** with `fly auth login` or `FLY_API_TOKEN` set, run:

```bash
./scripts/schedule_sandbox_reset.sh
```

Override defaults if needed: `NEOTOMA_SANDBOX_FLY_APP`, `NEOTOMA_SANDBOX_RESET_BASE_URL`,
`NEOTOMA_SANDBOX_POST_WIPE_DELAY_MS`.

## Terms of use

`GET /sandbox/terms` returns a versioned terms-of-use document (see
`src/shared/sandbox_terms_content.ts`, re-exported from
`src/services/sandbox/terms.ts`). The same text is published as HTML on
the marketing site at <https://neotoma.io/sandbox/terms-of-use>. Key clauses:

- The sandbox is a **public demo** — assume anyone can read anything you
  write.
- **No PII, secrets, or confidential data.**
- Data is wiped **weekly, Sunday 00:00 UTC**.
- Destructive admin endpoints and body-level `user_id` overrides are
  disabled.
- Neotoma may delete or purge entities proactively to maintain the sandbox
  experience (see `scripts/sandbox_purge_entity.ts`).

The Inspector shows these terms on the `/app/sandbox` page and the
`SandboxBanner` links to them from every page.

## Abuse reporting pipeline

Rather than building a bespoke `sandbox_reports` SQLite table, the sandbox
reuses the existing feedback pipeline pattern (see
`docs/subsystems/agent_feedback_pipeline.md` for the feedback architecture
this mirrors). This gives us durability across weekly resets, the same PII
redaction backstop, and the same operator tooling.

### Flow

1. A user (or agent) submits an abuse report via the Inspector
   (`/app/sandbox`) or directly via `POST /sandbox/report` on the Fly host.
2. `resolveSandboxReportTransport()` selects:
   - `LocalSandboxReportTransport` (file-backed JSON store under
     `NEOTOMA_DATA_DIR/sandbox_reports/`) when `NEOTOMA_SANDBOX_REPORT_FORWARD_URL`
     is unset — useful for local dev / tests.
   - `HttpSandboxReportTransport` otherwise — forwards the report to the
     Netlify functions on `agent.neotoma.io`.
3. The Netlify function (`sandbox_report_submit`) authenticates with
   `AGENT_SITE_SANDBOX_BEARER`, runs the same PII redaction scanner used for
   product feedback, and persists the record to the `sandbox_reports` Blobs
   store.
4. The submitter gets back an `access_token` they can use on
   `GET /sandbox/report/status?token=...` to see triage progress without
   re-identifying themselves.

The Netlify side persists reports independently of the Fly volume, so a
weekly reset does **not** destroy the abuse-report history. This is the key
property we need for durable triage.

### Entity type

The Fly host also seeds a `sandbox_abuse_report` entity type into its own
Neotoma (`src/services/sandbox/seed_schema.ts`), so internal triage tooling
can query reports as first-class entities using the standard Neotoma surface.

### Operator triage

For T&S / on-call:

1. Poll `GET /sandbox/report/status` (admin tooling) or inspect the
   `sandbox_reports` Blobs store via the Netlify UI / existing feedback
   triage scripts adapted for the new store name.
2. For each report, inspect the referenced `entity_id` or URL in the
   sandbox Inspector at `https://sandbox.neotoma.io/app`.
3. If the content should be removed **immediately** (rather than waiting
   for the weekly reset), run
   `NEOTOMA_ADMIN_BEARER=... npx tsx scripts/sandbox_purge_entity.ts \
      --entity-id <id> --reason "<short-reason>"`
   which calls `/delete_entity` against the sandbox API with admin
   credentials and records an audit trail.
4. Update the report's `status` / `resolution_notes` via the admin bearer
   so the submitter's status-lookup call reflects the outcome.

## Moderation posture

v0 is **reactive**, not proactive. Rationale:

- The sandbox is short-lived data (≤ 7 days) and behind a dedicated user id,
  so blast radius is tightly bounded.
- Proactive scanning (e.g. LLM-based moderation on every write) is
  expensive, slow, and adds a new failure mode (false positives blocking
  legitimate demo traffic).
- The three controls that matter most for a public demo are already in
  place: rate limiting, destructive-op gating, and scheduled wipes.

### Triggers for adding proactive scanning

Add a proactive moderation layer (and update this section) if **any** of
the following occurs:

1. More than **3 genuine abuse reports per week** for two consecutive
   weeks.
2. A single incident requiring a **manual full wipe before the scheduled
   Sunday reset**.
3. Any report involving **CSAM, doxxing, or credible threats of violence**
   (triggers immediate proactive-scanning posture regardless of volume).
4. **Legal / regulatory request** for takedown or logging we cannot satisfy
   with weekly resets alone.

The recommended v1 proactive layer is an LLM-based content classifier on
`store_structured` writes in sandbox mode only (gated behind
`NEOTOMA_SANDBOX_MODERATION=1` so it stays off in production). Design notes
for that layer live in
[`docs/proposals/`](../proposals/) when the trigger fires.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEOTOMA_SANDBOX_MODE` | Fly (`fly.sandbox.toml`) | Enable all sandbox-only behaviors. |
| `NEOTOMA_DATA_DIR` | Fly | Persisted volume path; used by reset script. |
| `NEOTOMA_INSPECTOR_STATIC_DIR` | Fly | Directory holding the prebuilt Inspector SPA. |
| `NEOTOMA_INSPECTOR_BASE_PATH` | Fly | URL prefix for the Inspector (default `/app`). |
| `NEOTOMA_SANDBOX_REPORT_FORWARD_URL` | Fly | Target for `HttpSandboxReportTransport` (Netlify). |
| `NEOTOMA_SANDBOX_REPORT_FORWARD_BEARER` | Fly | Bearer sent to Netlify with each forwarded report (must match Netlify). |
| `AGENT_SITE_SANDBOX_BEARER` | Netlify | Same secret value as `NEOTOMA_SANDBOX_REPORT_FORWARD_BEARER`. |
| `VITE_NEOTOMA_API_URL` | Inspector build | API base the SPA points at (sandbox: `https://sandbox.neotoma.io`). |
| `VITE_PUBLIC_BASE_PATH` | Inspector build | Must match `NEOTOMA_INSPECTOR_BASE_PATH`. |
| `VITE_NEOTOMA_SANDBOX_UI` | Inspector build | Turns on banner + disables API URL override + hides destructive actions. |
| `NEOTOMA_ROOT_LANDING_MODE` | Fly (optional) | Override root landing mode (`sandbox`, `personal`, `prod`, `local`); defaults to sandbox when `NEOTOMA_SANDBOX_MODE=1`. |
| `NEOTOMA_PUBLIC_DOCS_URL` | Fly (optional) | Base URL the root landing page uses to link back to marketing docs. Defaults to `https://neotoma.io`. |

## References

- [`docs/infrastructure/deployment.md`](../infrastructure/deployment.md) — Fly.io provisioning, Netlify setup.
- [`docs/subsystems/agent_feedback_pipeline.md`](agent_feedback_pipeline.md) — feedback pipeline that abuse reporting mirrors.
- [`docs/subsystems/agent_attribution_integration.md`](agent_attribution_integration.md) — AAuth identity tiers shown in the banner.
- `fly.sandbox.toml` — Fly app configuration.
- `scripts/reset_sandbox.ts` / `scripts/seed_sandbox.ts` — data-lifecycle scripts.
- `scripts/sandbox_purge_entity.ts` — T&S hard-delete utility.
- `src/services/sandbox_mode.ts` — runtime flag + destructive-route guard.
- `src/services/sandbox/` — report pipeline, terms, schema seeding.
