---
title: Github Release Supplement
summary: "v0.7.0 turns the hosted Neotoma story into a coherent product surface: a public sandbox with weekly resets and abuse reporting, a mode-aware root landing page for hosted instances, admin feedback proxying for the Inspector, new hosted/co..."
---

v0.7.0 turns the hosted Neotoma story into a coherent product surface: a public sandbox with weekly resets and abuse reporting, a mode-aware root landing page for hosted instances, admin feedback proxying for the Inspector, new hosted/connect marketing routes, and the deployment/runtime plumbing to operate all of it.

## Ship constraints

- This preview assumes the shippable working-tree changes land before tagging. It excludes local-only and protected paths such as `docs/private/`, `.tmp_*`, backup files, `__pycache__/`, and generated cache output, and it does not assume any uncommitted internals inside dirty submodules ship unless those submodules are committed and the parent pointers are updated.

## Highlights

- **Try Neotoma in public without installing anything.** `sandbox.neotoma.io` now has a first-class sandbox mode with public writes, weekly resets, `/sandbox/terms`, `/sandbox/report`, `/sandbox/report/status`, and a bundled Inspector at `/app`.
- **Every hosted Neotoma can explain itself at `/`.** The new root landing surface serves HTML for browsers and JSON/Markdown for agents, advertises the live MCP/discovery endpoints, and renders harness-specific connect snippets prefilled to the current host.
- **Moderate the feedback and sandbox pipeline from the Inspector without leaking admin secrets.** `/admin/feedback/*` now proxies to `agent.neotoma.io` only for hardware/software AAuth tiers, while Netlify functions persist sandbox abuse reports durably outside the weekly reset cycle.
- **Hosted onboarding is now a connected site flow instead of scattered docs.** New `/sandbox`, `/hosted`, `/connect`, and `/crypto-engineering` pages, plus route/SEO/navigation updates, turn the marketing site into a path from “kick the tires” to “self-host or deploy.”
- **Hosted legal and sandbox policy pages now ship as first-class site surfaces.** The site now publishes `/terms`, `/privacy`, and a human-readable sandbox-terms page backed by the same canonical content as `GET /sandbox/terms`, so hosted usage policy is explicit instead of buried in repo docs.
- **The site now shows the product instead of only describing it.** The interactive homepage demo adds an Inspector mode and richer CLI/agent/API walkthroughs, while new illustration support gives hosted pages a clearer Inspector preview frame.

## What changed for npm package users

**CLI / runtime**

- Hosted and self-hosted Neotoma instances now render a content-negotiated root page at `GET /`, backed by `src/services/root_landing/`, instead of dropping browsers onto a generic 404. The same surface returns HTML, Markdown, or JSON depending on `Accept`.
- Sandbox operators get a dedicated runtime mode via `NEOTOMA_SANDBOX_MODE=1`, with response header stamping (`X-Neotoma-Sandbox: 1`), lower write limits, destructive-route blocking, and a shared demo user path for unauthenticated writes.
- `scripts/reset_sandbox.ts`, `scripts/seed_sandbox.ts`, `scripts/sandbox_purge_entity.ts`, and `scripts/schedule_sandbox_reset.sh` add an operator workflow for wiping and reseeding the public demo deterministically from `tests/fixtures/sandbox/manifest.json`.
- `tsconfig.scripts.json` is introduced so the sandbox/reset/cron scripts compile into `dist/scripts/*` as part of the server build instead of staying tsx-only.

**Runtime / data layer**

- `src/actions.ts` adds the sandbox routes (`/sandbox/terms`, `/sandbox/report`, `/sandbox/report/status`) and the root landing/robots surfaces (`/`, `/robots.txt`) while keeping them available across hosted modes.
- `src/services/sandbox/transport.ts` and `src/services/sandbox/local_store.ts` mirror the existing feedback transport design: local file-backed persistence for dev, HTTP forwarding for hosted moderation, and shared redaction/backstop behavior before any durable write.
- `src/services/sandbox/seed_schema.ts` seeds `sandbox_abuse_report` so moderation records can live in the same graph as the public demo data.

**Shipped artifacts**

- The npm package picks up the new runtime modules under `dist/services/root_landing/*`, `dist/services/sandbox/*`, `dist/services/feedback/admin_proxy.js`, and the compiled sandbox scripts.
- `openapi.yaml` is not materially tightened in this release, and the `openapi:bc-diff` preflight reports no breaking changes versus `v0.6.0`.

## API surface & contracts

- `GET /` is now a product surface, not just an unhandled root: HTML for humans, Markdown for copy/paste docs flows, and JSON for agents/curl.
- `GET /robots.txt` is now mode-aware: sandbox/local deployments can stay out of search indices, while personal/prod hosts advertise only the safe public surfaces.
- New sandbox routes:
  - `GET /sandbox/terms`
  - `POST /sandbox/report`
  - `GET /sandbox/report/status`
- New local admin proxy routes for the feedback pipeline:
  - `GET /admin/feedback/preflight`
  - `GET /admin/feedback/pending`
  - `GET /admin/feedback/by_commit/:sha`
  - `POST /admin/feedback/:id/status`
- The sandbox report relay on `agent.neotoma.io` adds Netlify-backed `POST /sandbox/report/submit` and `GET /sandbox/report/status` so moderation history survives sandbox resets.

## Behavior changes

- Hosted Neotoma roots now identify the deployment mode (`sandbox`, `personal`, `prod`, `local`) and surface the correct MCP URL, Inspector URL, docs URL, and harness connect snippets for that host.
- Public sandbox deployments no longer behave like a lightly skinned prod instance. Destructive routes such as `/entities/split`, `/entities/merge`, `/health_check_snapshots`, and `/update_schema_incremental` return `403 SANDBOX_DISABLED`, while soft deletes remain reversible.
- Sandbox abuse reports are rate-limited separately from normal writes and go through PII redaction before local storage or remote forwarding.
- The Inspector-hosting path continues the post-`v0.6.0` work already committed on `main`: hosted static builds avoid implicit localhost defaults, support a public base path, and point Pages-hosted experiences at the sandbox API by default.

## Plugin / hooks / SDK changes

- `@neotoma/cursor-hooks` wires Cursor’s `postToolUse` hook to `after_tool_use.js`, which records passive `tool_invocation` observations so timeline coverage does not depend on the agent voluntarily writing structured memory later in the turn.
- The Cursor hooks installer now supports explicit install/uninstall flows, merges into an existing `.cursor/hooks.json` instead of clobbering it, and strips only Neotoma-owned hook entries when uninstalling.
- `packages/cursor-hooks/hooks.template.json` and the package README are updated to match the new hook set and install behavior.

## Security hardening

- The feedback admin proxy intentionally refuses anonymous or merely “unverified client” browser sessions: `/admin/feedback/*` requires a resolved `hardware` or `software` AAuth tier before it will forward anything to `agent.neotoma.io`.
- Sandbox moderation transport never trusts raw reporter IPs in the forwarded payload. The Fly host hashes the submitter IP and the Netlify layer treats that hash as the provenance handle.
- Sandbox mode centralizes route gating in `src/services/sandbox_mode.ts` so public-demo restrictions do not depend on scattered route-level conditionals.

## Docs site & CI / tooling

- The static site grows dedicated hosted-product pages: `ConnectIndexPage`, `HostedLandingPage`, `SandboxLandingPage`, and `CryptoEngineeringLandingPage`, plus route, navigation, icon, SEO, and analytics updates.
- The hosted site also publishes synced legal/policy surfaces for `/terms`, `/privacy`, and the sandbox terms page, with shared content helpers so the browser copy and `/sandbox/terms` JSON do not drift.
- `frontend/src/components/CliDemoInteractive.tsx` expands the interactive product demo to cover chat, CLI, agentic, API, and Inspector views, using the new `InspectorPreviewIllustration` asset and refreshed scenario copy.
- `frontend/src/components/DetailPage.tsx` adds automatic section dividers and hero-illustration support so the new hosted/sandbox pages can carry product art without page-specific layout hacks.
- `docs/infrastructure/deployment.md` now documents the hosted root landing page, GitHub Pages setup, and the Fly/Netlify deployment posture for hosted surfaces.
- `docs/subsystems/sandbox_deployment.md` documents the sandbox architecture, seed-data policy, weekly reset workflow, abuse reporting pipeline, and moderation runbook.
- `fly.sandbox.toml` and `.github/workflows/sandbox-weekly-reset.yml` add a repeatable deployment/reset story for the public demo.
- `services/agent-site/netlify.toml` wires the sandbox report relay endpoints into the existing feedback site alongside the scheduled webhook worker.

## Internal changes

- `src/services/root_landing/` introduces a dedicated rendering layer (`html_template.ts`, `md_template.ts`, `site_nav.ts`, `harness_snippets.ts`) so deployment-mode copy stays deterministic and testable.
- `src/services/sandbox/` formalizes sandbox-specific types, terms payloads, schema seeding, local persistence, and transport selection instead of keeping sandbox behavior inline in the main server.
- `src/server.ts`, `src/actions.ts`, and `src/services/local_auth.ts` are updated to support the hosted/sandbox/admin-proxy flow across both MCP and HTTP entrypoints.

## Fixes

- Hosted Inspector and Pages flows are less confusing: the already-committed submodule bumps after `v0.6.0` remove localhost assumptions from hosted builds and set a sane default API for public Pages-backed experiences.
- The public demo now has an explicit abuse-reporting and early-purge path instead of relying on ad hoc manual cleanup.
- Remote-connect documentation is now organized by harness and hosting mode instead of leaving users to stitch together install docs and subpages manually.
- The marketing surfaces now preview the Inspector more faithfully instead of relying on placeholder or text-only affordances.

## Tests and validation

- `npm run -s openapi:bc-diff -- --base v0.6.0` reports no breaking changes.
- New or updated coverage is present for the major new surfaces, including `tests/integration/root_landing.test.ts`, `tests/integration/sandbox_mode.test.ts`, `tests/integration/sandbox_report.test.ts`, `tests/integration/feedback_admin_proxy.test.ts`, `tests/unit/root_landing_harness_snippets.test.ts`, `tests/unit/root_landing_site_nav_drift.test.ts`, and `tests/unit/sandbox_reset.test.ts`.
- The release scope also includes fixture coverage for sandbox reseeding under `tests/fixtures/sandbox/`.

## Breaking changes

No breaking changes.
