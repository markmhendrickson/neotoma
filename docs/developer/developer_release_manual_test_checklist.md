# Developer Release Manual Test Checklist

_(Manual validation before releasing a developer-facing release)_

## Scope

This document is a checklist of functionality across the repository that you should manually test before releasing a developer release. It complements the automated pre-release validation in `docs/developer/pre_release_validation_rules.mdc` and release-specific integration tests in `docs/releases/{version}/integration_tests.md`.

## When to Use

- Before marking a release as `ready_for_deployment`
- After automated tests pass and before deployment
- When cutting a developer-focused release (MCP, CLI, API, setup flows)

## Prerequisites

- [ ] Pre-release validation checklist completed (`docs/developer/pre_release_validation_rules.mdc`): type-check, lint, build, migrations, test suite, MCP startup
- [ ] `.env` (or `.env.dev`) configured for the backend you are testing (local SQLite)

---

## 1. Installation and Setup

### 1.1 From repository (developer path)

- [ ] `git clone` (or fresh pull), `npm install`, `npm run type-check` succeeds
- [ ] `neotoma init` (from repo root) creates `data/`, SQLite DB, and `.env.example` (or prompts)
- [ ] `neotoma init --generate-keys` creates encryption key when desired
- [ ] `neotoma init --data-dir /path/to/custom` uses custom data directory
- [ ] `neotoma storage info` shows correct backend and paths

### 1.2 From npm (user path)

- [ ] `npm install -g neotoma` (or `npm link` from repo) installs `neotoma` binary
- [ ] `neotoma init` creates `~/neotoma/data/` (or configured dir), DB, and env template
- [ ] `neotoma storage info` shows expected paths and backend

### 1.3 Environment and backend

- [ ] Server uses SQLite and local `data/sources/`
- [ ] `npm run copy:env` (in worktree) copies env from main repo when documented

---

## 2. CLI

### 2.1 Auth and config

- [ ] `neotoma auth status` shows auth mode (none / dev-token / key-derived) and does not require login
- [ ] `neotoma auth login` (local) completes; with `--dev-stub` skips redirect when applicable
- [ ] `neotoma auth logout` clears stored OAuth credentials
- [ ] CLI uses `--base-url` and config from `~/.config/neotoma/config.json` as documented

### 2.2 Read-only commands (no MCP, against running API)

Start API (e.g. `npm run dev:server` or `npm run start:api`) then:

- [ ] `neotoma entities list`, `--type`, `--search`, `--limit`, `--offset`, `--include-merged`
- [ ] `neotoma entities get <id>`
- [ ] `neotoma sources list` with optional filters
- [ ] `neotoma observations list` with `--entity-id` / `--entity-type`
- [ ] `neotoma relationships list <entityId>` with `--direction`
- [ ] `neotoma timeline list` with date/type filters
- [ ] `neotoma schemas list`, `neotoma schemas get <entityType>`
- [ ] `neotoma stats` returns expected structure

### 2.3 Write and utility commands

- [ ] `neotoma store --file <path>` and/or `neotoma store --json '[...]'` create sources/entities as expected
- [ ] `neotoma upload <filePath>` uploads and processes file (if supported)
- [ ] `neotoma analyze <filePath>` runs analysis (if supported)
- [ ] `neotoma watch` (local backend) streams changes; `--tail`, `--json`, `--human` behave as documented
- [ ] `neotoma backup create` / `neotoma backup restore --from <dir>` work against local data
- [ ] `neotoma logs tail` (and `--decrypt` if encryption on) show log output
- [ ] `neotoma request --operation <id>` with `--params` or `--body`/`--query`/`--path` matches OpenAPI

### 2.4 Developer helpers

- [ ] `neotoma dev list` lists npm scripts
- [ ] `neotoma dev <script>` runs `npm run <script>` from repo root

---

## 3. MCP Server (stdio)

### 3.1 Startup and protocol

- [ ] `npm run dev` (or `npm run watch:mcp:stdio`) starts MCP server without crashing
- [ ] No stray console.log/console.error to stdout (would break JSON-RPC)
- [ ] Cursor (or other MCP client) sees the server when configured in `.cursor/mcp.json` with correct `command` and `cwd`

### 3.2 Core tools (smoke)

With MCP client connected:

- [ ] `store` with `entities` array (e.g. one `contact` or `task`) creates source and entities
- [ ] `store` with `file_content` (base64) + `mime_type` (e.g. PDF) creates source and runs interpretation when `interpret=true`
- [ ] `retrieve_entities` with `entity_type` returns stored entities
- [ ] `retrieve_entities` with `search` returns semantically similar entities when OPENAI_API_KEY set (local embeddings)
- [ ] `retrieve_entity_snapshot` for an entity ID returns snapshot and provenance
- [ ] `list_observations` for an entity returns observations
- [ ] `list_entity_types` returns schema list; optional keyword filter works
- [ ] `retrieve_entity_by_identifier` finds entity by name/email when applicable
- [ ] `retrieve_entity_by_identifier` semantic fallback when keyword returns 0 (local embeddings)
- [ ] `retrieve_related_entities` and `retrieve_graph_neighborhood` return expected structure when data exists

### 3.3 Mutations and lifecycle

- [ ] `correct` updates field and snapshot reflects correction (priority over AI)
- [ ] `create_relationship` creates typed relationship; `list_relationships` shows it
- [ ] `merge_entities` merges two entities; merged entity excluded from default `retrieve_entities`
- [ ] `reinterpret` on a source creates new interpretation run and new observations; existing observations unchanged
- [ ] `delete_entity` soft-deletes; entity excluded from default queries
- [ ] `restore_entity` restores soft-deleted entity

### 3.4 Resources (if exposed)

- [ ] Resource `neotoma://entity_types` (or equivalent) returns entity types
- [ ] Resource for entity by ID returns expected payload

### 3.5 Auth (OAuth)

- [ ] When MCP OAuth is required, authorize flow completes and subsequent tool calls are scoped to user
- [ ] Cross-user isolation: User B cannot see or modify User A’s entities/sources (see IT-006 in release report)

---

## 4. HTTP API

With API running (e.g. `npm run dev:server` on port 8080):

- [ ] `GET /api/me` returns current user or guest when anonymous sign-in enabled
- [ ] `POST /api/entities/query` with body returns entities; pagination and filters work
- [ ] `GET /api/entities/{id}` returns entity snapshot
- [ ] `GET /api/sources` returns sources list
- [ ] `POST /api/observations/query` returns observations for entity/type
- [ ] `GET /api/timeline` returns timeline events with optional filters
- [ ] `GET /api/schemas`, `GET /api/schemas/{entity_type}` return schema info
- [ ] `POST /api/observations/create` (or equivalent) creates observation when supported
- [ ] OAuth: `GET /api/mcp/oauth/authorize` and callback/token flow work for MCP Connect

---

## 5. Frontend (optional for developer release)

If the release includes UI changes or you want to validate the full stack:

- [ ] `npm run build:ui` succeeds
- [ ] `npm run dev:ui` (or full stack) serves UI; login/signup (or guest) works
- [ ] Dashboard loads; entities/sources/timeline/schemas views load without errors
- [ ] Entity detail and source detail pages open and show data
- [ ] Quick entry (contact, task, event, transaction) creates data when implemented
- [ ] MCP setup/integration pages (Cursor, ChatGPT, etc.) load and instructions/copy are correct
- [ ] File upload (if used) uploads and appears in sources
- [ ] Settings (theme, keys, connections) save and persist

---

## 6. Storage and Data

### 6.1 Local backend

- [ ] Data directory contains `neotoma.db`, `sources/`, and optionally `events/`, `logs/`
- [ ] After `store` (file), file exists under `sources/` with expected naming (e.g. by hash)
- [ ] `neotoma backup create` includes DB, sources, logs; checksums in manifest

---

## 7. Release-Specific Manual Tests

For each release, use the manual test cases defined in that release’s integration tests and release report:

- [ ] Open `docs/releases/{version}/integration_tests.md` and run any listed manual tests
- [ ] Open `docs/releases/{version}/release_report.md` Section 9 (Testing Guidance) and execute every manual test case (e.g. IT-001 through IT-010 for v0.2.0)
- [ ] Document Pass/Fail per test case; fix failures before deployment

Example flows often covered there: raw file ingestion (IT-001), deduplication (IT-002), reinterpretation immutability (IT-003), correction override (IT-004), entity merge (IT-005), cross-user isolation (IT-006), quota (IT-007), merged entity exclusion (IT-008), provenance chain (IT-009), and any additional cases for the release.

---

## 8. Smoke Command Sequence (quick pass)

After a full manual pass, a minimal smoke sequence:

1. `npm run type-check && npm run lint && npm run build:server && npm run build:ui`
2. `npm test`
3. Start API: `npm run start:api` (or `npm run dev:server`)
4. CLI: `neotoma auth status`, `neotoma entities list --limit 5`, `neotoma stats`
5. MCP: Connect Cursor; call `store` with one entity; call `retrieve_entities`; verify result
6. (Optional) Load frontend in browser; open Dashboard and one entity

---

## 9. Sign-Off

- [ ] All sections above relevant to this release are completed
- [ ] All release-specific manual test cases from `integration_tests.md` and release report Section 9 are executed and passed
- [ ] No critical or blocking issues open; known issues documented
- [ ] Release status updated to `ready_for_deployment` only after this sign-off

## Related Documents

- **Pre-release validation (automated):** `docs/developer/pre_release_validation_rules.mdc`
- **CLI reference:** `docs/developer/cli_reference.md`
- **Getting started:** `docs/developer/getting_started.md`
- **MCP spec:** `docs/specs/MCP_SPEC.md`
- **Release integration tests:** `docs/releases/{version}/integration_tests.md`
- **Release report (Testing Guidance):** `docs/releases/{version}/release_report.md` Section 9
- **Deployment checklist (example):** `docs/releases/v0.2.15/deployment_checklist.md`
