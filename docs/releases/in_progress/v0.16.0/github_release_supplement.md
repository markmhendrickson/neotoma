# v0.16.0 Release Supplement

## Summary

v0.16.0 ships the first-party agent SDK + memory-protocol layer, inspector skinning for embedders, merge-relationship hardening, override-policy enforcement for `agent_definition` writes, and the remaining PR-salvage queue from the v0.16.0 consolidation pass.

1. **`@neotoma/agent` harness SDK (#318)** — protocol-enforcing TypeScript SDK with `withMemory` / `NeotomaMemory` turn lifecycle (bounded retrieval → user-phase store → assistant-phase store), deterministic idempotency keys, and `REFERS_TO` / `PART_OF` edges by construction.
2. **Python `NeotomaMemory` layer (#322)** — parity memory protocol for `neotoma-client` (`with_memory`, sync + async), Claude Code hook integration, and published SDK docs (`docs/developer/sdk_python.md`, site pages).
3. **Inspector skinning (#1585)** — configurable palette via `NEOTOMA_INSPECTOR_SKIN` (bundled presets under `inspector/public/skins/`) or `NEOTOMA_INSPECTOR_SKIN_CONFIG` (arbitrary JSON path); server injects sanitized CSS variables before first paint.
4. **Merge relationship repoint (#1534 / #1507)** — `mergeEntities` repoints `relationship_observations` to the survivor, returns `relationships_repointed` in the OpenAPI merge response, and collapses duplicate edges by `relationship_key` (not metadata hash).
5. **`override_validation` service (#1634 / #398)** — per-field write policies on `agent_definition` entities enforced at observation/correction write time via `enforceOverridePolicy`.
6. **Issues repo discovery (#1617)** — M2 `.well-known/neotoma.json` resolver for cross-repo issue targeting.
7. **Peer-sync runbook (#1560)** — cloud availability / Stop-hook peer documentation from salvage Wave 2.
8. **Site UI salvage (#396, #395)** — remove MDX locale fallback banner; docs link in header nav + mobile FAB visibility fix.
9. **Inspector pinned dashboard panel** — home page (`/`) shows a `PinnedDashboardPanel` grid when the API URL is configured; sidebar caps visible pins at 8 with a **Show all (N)** link back to home.

## RC cycle fixes (post-rc.1)

The RC smoke-test loop produced two additional merges on top of the supplement scope above. Both are user-facing and worth calling out in the GitHub release notes.

### Inspector pre-merge UI audit (#1674)

Operator-focused Inspector polish + design-system consistency pass landed before tagging:

- **Operator home, mobile shell, drawer** — refreshed Inspector home for operators, mobile drawer + responsive polish across pages.
- **Design-system consistency** — filters, selects, code blocks, recent feeds, and design surfaces migrated onto the canonical primitives. New reusable `EmptyState`, `ApiNotConfiguredState`, `ListSurface`, `SegmentedControl`, `FiltersCard`, `MobileFilterPopover`, `ActiveFilterBadges`, `CopyableCodeBlock` primitives wired across every index page.
- **Catch-all 404 route** (`inspector/src/pages/not_found.tsx`) plus light/dark color audit (`chart-1..5` tokens, `success`/`warning` utilities, dark-mode entity colors).
- **Backend `/usage` route + dashboard stats service** (`src/services/dashboard_stats.ts`, `src/services/timeline_query.ts`) backing the dashboard with a real usage service.
- **Ops fixes** — `/me` path redaction, `dev:full:prod` token loading, chokidar-polling API watcher.

### Windows `spawn EINVAL` regression fix (#1676 / #1677)

Field-reported regression: on Windows with modern Node.js (post CVE-2024-27980 patch — Node ≥ 18.20.2 / 20.12.2 / 21.7.2, all v22+), `child_process.spawn('npm.cmd', ...)` and other `.cmd` shims (`npx.cmd`, `claude.cmd`, `tsx.cmd`, `neotoma.cmd`) threw `EINVAL` unless `shell: true` was set. Most user-visible consequence: `neotoma api start` failed on Windows, so the local data API never came up and CLI writes were effectively blocked.

- **New helper** `src/shared/spawn_platform.ts` (`IS_WINDOWS`, `WIN_SHELL`, `shellOnWin()`) centralizes the `shell: true`-on-win32 decision with explicit security reasoning (args stay an argv array — no command-string concatenation, no shell-injection vector).
- **Updated spawn sites** — `src/cli/index.ts`, `src/cli/hooks.ts`, `src/cli/doctor.ts`, `src/services/schema_registry.ts`, `src/mcp_dev_shim.ts` now use the helper. `doctor.ts` also maps `which` → `where` on Windows.
- **Tests** — `src/shared/spawn_platform.test.ts` covers both platform branches and the spread-into-options shape.

### Session identity inspector origin (#1591 / #1688)

Agents were defaulting Inspector links to `sandbox.neotoma.io` when no configured origin was available. `GET /session` and MCP `get_session_identity` now expose `origins.inspector_origin` and `origins.app_origin` from `NEOTOMA_PUBLIC_BASE_URL` when set, otherwise from the inbound request — never a hardcoded sandbox guess. MCP instructions require agents to use session-provided origins for turn-summary links.

- **Server** — `src/services/session_info.ts` builds normalized origin info; OpenAPI documents `SessionOriginInfo`.
- **Tests** — unit coverage for empty/malformed origins; integration test confirms configured URL wins over request-derived host headers.

## Known issues (won't ship a fix this release)

These were surfaced during the RC audit and are tracked for follow-up; they do not block v0.16.0 but are worth user awareness.

- **#1668 — `store`: two `agent_message` rows in one request can silently merge when `message_id` is omitted.** A single `/store` request with both a user and assistant `agent_message` (or `conversation_message`) sharing one `turn_key` and no `message_id` collapses to one entity (`matched_existing` action) instead of two distinct rows. Server-side protection (`ERR_CONVERSATION_MESSAGE_ROLE_CONFLICT`) has been in place since v0.12.0 for the standard ordering and now has additional single-batch regression coverage; if the guard does not fire in your environment, ensure you are on the latest server. **Workaround:** use the `:assistant` suffix on the closing message (`turn_key: "{conversation_id}:{turn_id}:assistant"`) — the canonical pattern the MCP turn lifecycle already documents.
- **#1598 / #1587 — auto-enhance queue / schema drift errors in server logs** (`AUTO_ENHANCE_QUEUE`). Visible in production logs as `APIError:store` events on certain entity types (e.g. `checkpoint_brief`); does not corrupt stored data — observations are preserved, but the snapshot reducer may exclude undeclared fields. Use `audit_undeclared_fragments` (MCP) or `neotoma schemas audit-fragments` (CLI) to triage; promote high-occurrence fields via `update_schema_incremental` / `register_schema` per the per-store `unknown_fields` hint.
- **#1667 — public endpoints returning 401 / tight CORS posture.** RC audit identified some endpoints that surface 401 where 200/anonymous would be more appropriate, and a tighter-than-needed CORS configuration for public read paths. Read paths intended for public consumption should continue to be inspected against the auth posture documented in `docs/subsystems/auth.md` before relying on them anonymously.

## What changed for npm package users

### `@neotoma/agent` protocol-enforcing harness SDK (#318)

Provider-agnostic agent harness that wraps `@neotoma/client` with the canonical Neotoma turn protocol so custom agent loops get correct memory behavior without hand-implementing MCP instruction rules.

- **New package `packages/agent/`** (`@neotoma/agent`): `withMemory()` wrapper, explicit `NeotomaMemory` (`open_turn` / `close_turn`), `turn_helpers`, `turn_report`, and `diagnose` utilities.
- **Turn lifecycle by construction** — on each call: bounded retrieval from the user message, user-phase `conversation` + `conversation_message` store with `PART_OF` and `REFERS_TO`, agent invocation with `ctx.retrieved`, assistant-phase store with separate `turn_key` suffix and idempotency key.
- **Contract tests** — `tests/contract/sdk_client_store_shape.test.ts` and `tests/unit/agent_memory.test.ts` / `tests/integration/agent_memory_turn_lifecycle.test.ts` lock store payload shapes against the live client.
- **Docs** — `docs/developer/sdk_agent.md` and site page `docs/site/pages/en/sdk-agent.mdx`.

```bash
npm install @neotoma/agent @neotoma/client
```

```ts
import { HttpTransport } from "@neotoma/client";
import { withMemory } from "@neotoma/agent";

const wrapped = withMemory(yourAgentFn, {
  transport: new HttpTransport({ baseUrl, token }),
  conversationId: "conv-2026-05-20",
  platform: "my-agent",
});
```

### Python `NeotomaMemory` protocol layer (#322)

Python parity for the same store-first turn protocol — HTTP-only client reaching the Node Neotoma engine over REST.

- **New modules** in `packages/client-python/`: `memory.py`, `with_memory.py`, `helpers.py` with sync and async `with_memory` / `NeotomaMemory.open_turn` / `close_turn`.
- **Claude Code hooks** — `packages/claude-code-plugin/hooks/neotoma_client/` gains the same memory layer for Python hook plugins.
- **Tests** — `packages/client-python/tests/test_memory.py`.
- **Docs** — `docs/developer/sdk_python.md` and site page `docs/site/pages/en/sdk-python.mdx`.

```bash
pip install neotoma-client
```

```python
from neotoma_client import NeotomaClient, with_memory

client = NeotomaClient(base_url="http://127.0.0.1:3080", token="dev-local")
wrapped = with_memory(my_agent, transport=client, conversation_id="conv-1")
result = wrapped("Tell me about Acme Corp")
```

### Inspector skinning via `NEOTOMA_INSPECTOR_SKIN` (#1585)

Embedders and operators can theme the bundled Inspector SPA without forking the React app.

- **`NEOTOMA_INSPECTOR_SKIN=<name>`** — load a bundled preset from `dist/inspector/skins/<name>.json` (source: `inspector/public/skins/`). Ships with a neutral `sample` preset for verification.
- **`NEOTOMA_INSPECTOR_SKIN_CONFIG=/abs/path/custom.json`** — load arbitrary skin JSON from disk.
- **Server injection** — `src/services/inspector_skin.ts` sanitizes token values (HSL triplet shape only), injects `window.__NEOTOMA_INSPECTOR_SKIN__` into the SPA shell before React mounts; `inspector/src/lib/inspector_skin.ts` applies CSS variables on load.
- **Tests** — `tests/unit/inspector_skin.test.ts`, `tests/integration/inspector_skinning.test.ts`, `inspector/src/lib/inspector_skin.test.ts`.

### Inspector pinned dashboard panel

Operators with a configured API URL see pinned primitives on the Inspector home page (`/`) as a responsive card grid (`PinnedDashboardPanel`). The sidebar still shows up to eight pins; when more exist, **Show all (N)** links to home where the full set is visible. Public marketing sections remain for visitors without a configured API URL.

- **Component** — `inspector/src/components/home/pinned_dashboard_panel.tsx` (grid of pin tiles with kind label and relative pin time).
- **Home wiring** — `inspector/src/pages/home.tsx` renders the panel when `isApiUrlConfigured()` is true, above the marketing hero.
- **Sidebar cap** — `inspector/src/components/layout/pinned_primitives_sidebar.tsx` (`SIDEBAR_PIN_LIMIT = 8`, link to `/`).

### Merge repoints relationship edges (#1534 / #1507)

- **`mergeEntities`** now repoints `relationship_observations` from the merged-away entity to the survivor and returns `relationships_repointed` in the `POST /entities/merge` 200 response (OpenAPI + generated types).
- **Dedup by `relationship_key`** — duplicate edges differing only in observation metadata collapse to a single survivor edge (fixes stale `canonical_hash` dedup after repoint).
- **Integration suite** — `tests/integration/merge_repoint_relationship_edges.test.ts` (9 tests).

### `override_validation` per-field write policies (#1634 / #398)

- **New service** `src/services/override_validation.ts` — reads `override_policy` JSON on `agent_definition` entities and enforces per-field write restrictions by derived caller role (`operator` / `service`). Phase 1: only `agent_definition` carries a policy; other types pass through (fail-open default).
- **Write hooks** — `enforceOverridePolicy` wired into `createObservation` and `createCorrection` after attribution / protected-type checks.
- **Tests** — `src/services/__tests__/override_validation.test.ts` (17), `tests/integration/retrieve_graph_neighborhood_tenant_isolation.test.ts` (3).

### Issues M2 repo discovery (#1617)

- Resolver for `.well-known/neotoma.json` manifest discovery, enabling cross-repo issue targeting without hard-coded repo assumptions.

### Peer-sync documentation (#1560)

- Cloud availability peer runbook and Stop-hook documentation from salvage Wave 2.

### Site / marketing UI (#396, #395)

- Remove locale fallback banner from MDX site pages.
- Docs link in header nav (`header_docs` analytics CTA) and mobile FAB visibility fix on marketing home.

## API surface & contracts

- **Additive:** `relationships_repointed` on merge response (#1534); SDK packages are new npm/PyPI surfaces, not OpenAPI changes.
- **Behavioral:** `override_validation` may reject corrections/observations on restricted `agent_definition` fields when `override_policy` is set.
- Run `npm run openapi:bc-diff` against v0.15.1 before tagging to confirm no unintended breaking changes beyond documented merge-response field addition.

## Breaking changes

- None identified for core HTTP/MCP contracts in this supplement scope. The merge response gains `relationships_repointed` (additive). Confirm `additionalProperties` posture separately if v0.15.1 breaking notes apply to this train.

## Tests and validation

- [x] `@neotoma/agent` unit + integration turn-lifecycle tests
- [x] Python `test_memory.py`
- [x] Inspector skinning unit + integration (24 tests)
- [x] `override_validation` + graph-neighborhood tenant isolation
- [x] `merge_repoint_relationship_edges` integration (9 tests)
- [x] `spawn_platform` cross-platform spawn helper (`src/shared/spawn_platform.test.ts`)
- [x] `store_conversation_message_role_conflict` — extended to cover single-batch user + assistant payloads and the `agent_message` alias (regression coverage for #1668)
- [ ] Full CI baseline + security gates on #1634, #1534, #1585 after rebase onto latest `main`

## Related PRs

| PR | Status | Topic |
|----|--------|-------|
| #318 | Merged | `@neotoma/agent` SDK |
| #322 | Merged | Python `NeotomaMemory` |
| #1585 | In review | Inspector skinning |
| #1634 | In review | `override_validation` |
| #1534 | In review | Merge relationship repoint |
| #1617 | Merged | Issues repo discovery |
| #1560 | Merged | Peer-sync docs |
| #396, #395 | Merged | Site UI salvage |
| #1674 | Merged | Inspector pre-merge UI audit (mobile shell, design system, empty states, color audit, dashboard backing service) |
| #1677 (closes #1676) | Merged | Windows `spawn EINVAL` regression fix for `.cmd` shims |
| #1688 (closes #1591) | Merged | Session identity exposes inspector origin (no sandbox default) |
