---
title: Bundled Docs Reconciliation Plan
summary: Audit of the documentation currently bundled into the app/Inspector and a plan to reconcile it with the prioritized documentation outline.
category: internal
subcategory: plans
audience: developer
visibility: internal
order: 10
tags: [documentation, reconciliation, inspector, bundling, plan]
---

# Bundled Docs Reconciliation Plan

This plan audits the documentation **currently bundled into the app and served by the Inspector** (the in-app `/docs` browser), and reconciles it with the [Documentation Outline](../site/documentation_outline.md). It deliberately ignores the marketing site (`neotoma.io`, built from `docs/site/pages/**`), per scope. Where site MDX overlaps the in-app surface, that overlap is noted but the site is not the subject.

## Goals

- Make the in-app `/docs` browser useful to the [primary ICP](../icp/icp_from_functionality.md) on a normal npm install.
- Provide a curated user/operator path (P0–P2) that today does not exist, on top of the strong developer/subsystem coverage that already does.
- Stop internal strategy content from rendering publicly in-app.
- Lead the index with what a new user needs first, not internal architecture.

## How the in-app docs work today

- The route lives in `src/services/docs/`. `GET /docs` (JSON or HTML) builds an index from the repo `docs/` tree at runtime; `GET /docs/<slug>` renders one doc. The Inspector SPA mirrors this at `/docs`.
- The category tree and featured list are declared in `docs/site/site_doc_manifest.yaml`. Per-doc `category`, `subcategory`, `audience`, and `visibility` come from frontmatter, falling back to `FOLDER_DEFAULTS` in `src/services/docs/doc_frontmatter.ts` based on the folder under `docs/`.
- Visibility: most folders default to `public`; `reports`, `plans`, `proposals`, `prototypes`, `implementation`, and `assets` default to `internal`. Unmapped folders fail closed to `internal`. Internal docs 404 on the public route unless a show-internal env flag is set.

## Problems (current state)

1. **The npm package does not ship the docs.** `package.json#files` includes only `docs/developer/mcp/instructions.md` from the docs tree (plus `dist`, `openapi.yaml`, `skills`, `README.md`). No build step copies docs into `dist`. So when a user installs Neotoma via npm (the primary distribution), the in-app `/docs` browser resolves a near-empty tree (effectively one doc). The in-app docs are only complete in a source checkout or the hosted instance. This is the single highest-impact gap.

2. **Audience skew toward developers and internals.** Of ~1,063 markdown/MDX files under `docs/`, the bulk is developer- and process-oriented: `docs/site/` (352, the site), `docs/releases/` (187), `docs/developer/` (120), `docs/plans/` (68), `docs/subsystems/` (48), `docs/reports/` (48), `docs/ui/` (41), `docs/feature_units/` (30). The ICP-facing operational areas are the thinnest: `docs/operations/` (2), `docs/observability/` (3), `docs/security/` (2), `docs/api/` (1). The system is well documented for developers; it is under-documented for the person installing, using, and operating it.

3. **No curated user/operator path; subsystem docs are written at developer altitude.** The underlying capabilities are documented (for example `subsystems/reducer.md`, `entity_merge.md`, `deletion.md`, `peer_sync.md`, `subscriptions.md`, `auth.md`, `agent_capabilities.md`, `aauth.md`), but as developer subsystem references, not as task-oriented user/operator guides. There is no "Using the Inspector" guide for users (the only Inspector doc, `inspector/README.md`, covers skinning for developers).

4. **The "Getting Started" category is empty.** The manifest declares a `getting_started` category, but no folder maps to it in `FOLDER_DEFAULTS` and no doc declares `category: getting_started`. Install/connect content lives either in the site MDX (`docs/site/pages/en/install.mdx`, the site) or in developer docs (`developer/getting_started.md`, which lands under "Development"). A new user opening in-app docs finds no Getting Started.

5. **The featured list is not for new users.** The featured set is `NEOTOMA_MANIFEST`, `core_identity`, `philosophy`, `architecture`, `determinism`, `cli_reference`, `mcp/instructions`, `logging`, `threat_model`, `testing_standard`. None of these is a "what is this / install / first use / use the Inspector" page.

6. **Internal strategy renders publicly.** `docs/icp/*.md` (including `primary_icp.md` at 48KB and `profiles.md` at 180KB), and many `docs/developer/*` planning files, carry no `visibility` frontmatter and so default to `public`. Internal go-to-market and strategy content is therefore exposed in the in-app `/docs` browser.

7. **Site/in-app duplication.** `docs/site/pages/**` MDX (install, cli, mcp, api, schema-management, troubleshooting) renders in-app under a `site` subcategory in addition to the canonical in-repo markdown. The in-app surface should prefer the in-repo markdown as canonical and not double-list the site mirror.

## Gap analysis: outline vs current bundled docs

Status legend: **Have** (a fitting doc exists), **Partial** (content exists but wrong audience/scattered), **Missing**.

### P0 Adopt

| Outline item | Status | Where it is now / note |
| --- | --- | --- |
| What Neotoma is | Partial | `foundation/core_identity.md`, `philosophy.md` (developer altitude). Need a plain user orientation page. |
| Install | Partial | Site MDX `site/pages/en/install.mdx`; `developer/docker.md`, `developer/getting_started.md`. Need an in-app Getting Started install doc. |
| Connect your tool | Partial | Scattered: `developer/mcp_*_setup.md`, `integrations/matrix.md`, `integrations/hooks/*`. Need one consolidated entry. |
| First ingestion / quick start | Partial | `developer/canonical_walkthrough.md`. Need a short user quick start. |
| Verify your setup | Have | `operations/health_check.md` (reframe entry under Getting Started). |

### P1 Use and trust

| Outline item | Status | Where it is now / note |
| --- | --- | --- |
| What gets stored and when | Partial | `foundation/what_to_store.md`, `developer/mcp/instructions.md` (agent/dev audience). |
| Record types and schema | Partial | `subsystems/record_types.md`, `foundation/data_models.md` (developer). |
| Using the Inspector | **Missing** | No user guide. `inspector/README.md` is skinning. Highest user-facing gap. |
| Correcting and editing state | Partial | `subsystems/reducer.md`, `observation_architecture.md`, `interpretations.md` (developer). |
| Merge/split/delete/restore | Partial | `subsystems/entity_merge.md`, `deletion.md` (developer). No user how-to. |
| Searching and retrieving | Partial | `subsystems/vector_ops.md` (developer). No user search guide. |
| File ingestion | Partial | `subsystems/sources.md`, `architecture/source_material_model.md`. No user "what can I upload". |
| Exporting and owning your data | Partial | `subsystems/markdown_mirror.md`. No consolidated user export guide. |
| Privacy and data ownership | Have | `subsystems/privacy.md`, `legal/privacy_policy.md` (tighten for users). |
| What is guaranteed | Partial | `NEOTOMA_MANIFEST.md`, `developer/developer_preview_storage.md`. Need a concise in-app page. |
| Skills | Partial | `docs/skills/` (1 file). Need a user catalog. |

### P2 Control and operate

| Outline item | Status | Where it is now / note |
| --- | --- | --- |
| Agent identity and attribution | Have | `subsystems/agent_attribution_integration.md`, `agent_capabilities.md`. |
| Agent grants and capabilities | Partial | `subsystems/agent_capabilities.md` (developer). Need operator how-to. |
| Hardware-attested auth (AAuth) | Have | `subsystems/aauth.md`, `aauth_attestation.md`, `developer/aauth_overview.md`, `integrations/aauth_*`. |
| Authentication and access control | Have | `subsystems/auth.md`, `guest_access_policy.md`. |
| Encryption and key management | Partial | `architecture/architecture.md` §7.2 only. Need an operator encryption guide. |
| Running the server | Partial | `developer/launchd_*`, `developer/mcp_https_*`. Need a consolidated operator page. |
| Backup, recovery, and health | Have | `operations/runbook.md`, `health_check.md`, recover-db skill. |
| Configuration reference | Partial | `.env.example`, `developer/environment_distinction_audit.md`. Need a `NEOTOMA_*` reference. |

### P3 Build and federate

| Outline item | Status | Where it is now / note |
| --- | --- | --- |
| REST API reference | Have | `api/rest_api.md`. |
| MCP tool reference | Have | `developer/mcp/instructions.md`, `developer/mcp_overview.md`. |
| Client SDKs | Have | `developer/sdk_agent.md`, `developer/sdk_python.md`. |
| Hooks and plugins | Have | `integrations/hooks/*`, `integrations/openclaw.md`. |
| Schema management | Have | `architecture/schema_handling.md`, `subsystems/schema_registry.md`. |
| Subscriptions and events | Have | `subsystems/subscriptions.md`, `events.md`, `substrate_events.md`. |
| Federation and peers | Have | `subsystems/peer_sync.md`. |
| Canonical Markdown mirror | Have | `subsystems/markdown_mirror.md`. |
| Webhooks and external integrations | Partial | `subsystems/issues.md`, `github_entities.md`. |

### P4 Understand deeply, P5 Reference

Almost entirely **Have** (architecture, determinism, reducer, entity_resolution, timeline_events, consistency, idempotence, foundations; CLI reference, errors, vocabulary, legal, troubleshooting, contributing). These are the repo's strength.

## Solutions (reconciliation actions, phased)

### Phase 1: Make in-app docs usable on npm installs (infrastructure)

1. **Ship the public docs in the npm package.** Define the bundled docs set as the public (non-internal) docs the ICP needs (P0–P3 plus P4 foundations). Implement by either adding a curated docs allowlist to `package.json#files`, or adding a build step that copies the public docs subtree into `dist/docs` and pointing the docs route at `dist/docs` when the source tree is absent. Exclude `reports`, `plans`, `proposals`, `prototypes`, `implementation`, `feature_units`, `releases`, and `site/pages` to control package size.
2. **Graceful fallback.** When the docs tree is absent, the in-app browser should link to `neotoma.io/docs` rather than render an empty index.

### Phase 2: Create the missing user/operator layer (authoring; see step 5)

3. Author the P0/P1 user-facing docs that are Missing or Partial, in a new `docs/getting_started/` folder and as user-audience guides:
   - What Neotoma is (user orientation)
   - Getting Started (install, connect a tool, first ingestion, verify)
   - Using the Inspector (user tour of every screen)
   - Working with your memory (what gets stored, correcting, merging/splitting, searching, exporting)
   These consolidate and re-frame existing developer subsystem docs; they link down to them rather than duplicating internals.

### Phase 3: Re-curate the index for new users

4. **Add a `getting_started` folder default** in `FOLDER_DEFAULTS` (category `getting_started`, audience `user`, visibility `public`) so the empty category populates.
5. **Rewrite the featured list** in `site_doc_manifest.yaml` to lead with: What Neotoma is, Getting Started, Using the Inspector, Working with your memory, then Architecture and Determinism for depth.

### Phase 4: Fix visibility and dedupe

6. **Mark internal strategy docs internal.** Add `visibility: internal` to `docs/icp/primary_icp.md`, `profiles.md`, `secondary_icps.md`, `future_icps.md`, `developer_release_targeting.md`, `general_release_criteria.md`, `prioritized_pain_points_and_failure_modes.md`, `qualification_survey.md`, and audit `docs/developer/*` planning files for the same. Keep `icp_from_functionality.md` and a short public ICP summary public.
7. **Prefer in-repo markdown as canonical in-app.** Avoid double-listing `docs/site/pages/**` MDX in the in-app index where an in-repo markdown equivalent exists.

## Key problems solved

- npm-installed users get a useful in-app docs browser (Phase 1).
- A new user has a clear first-run path and an Inspector guide (Phases 2–3).
- Internal strategy stops leaking into the public docs surface (Phase 4).
- The index leads with adoption, not architecture (Phase 3).

## Key solutions implemented

- A curated, shippable bundled-docs set and runtime fallback.
- A new user/operator documentation layer that reuses, not duplicates, existing developer docs.
- Manifest and `FOLDER_DEFAULTS` changes that populate Getting Started and re-curate featured.
- Visibility frontmatter corrections.

## QA needs

- The docs index builds with the new docs and updated manifest (`GET /docs?format=json` returns them; new slugs resolve).
- Internal docs do not appear on the public route after visibility changes (`src/services/docs/visibility` behavior; existing `index_builder` and `visibility` tests).
- Featured list and Getting Started category render the new docs.
- If Phase 1 is implemented, a simulated npm install (`npm run simulate:install` / `npm run pack:local`) shows the bundled docs resolving in-app.
- Run `npm run validate:doc-deps` and the docs frontmatter tests after edits.

## Documentation update needs

- Update `docs/site/site_doc_manifest.yaml` (featured list, any new category entries).
- Update `src/services/docs/doc_frontmatter.ts` `FOLDER_DEFAULTS` for `getting_started`.
- Cross-link new user docs to the existing developer subsystem docs.
- Reflect the new top-level docs in the README documentation section (already points to in-app `/docs`).

## Scope note

Step 5 of this effort implements Phase 2 (the highest-priority new user/operator docs) and the Phase 3 manifest/`FOLDER_DEFAULTS` curation, plus the Phase 4 visibility fixes that overlap ICP reconciliation. Phase 1 (npm packaging change) is specified here and recommended but is a build/release change; it is flagged for follow-up rather than bundled into the same docs change unless approved.
