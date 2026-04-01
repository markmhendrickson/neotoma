**Note:** Git tag **`v0.3.11`** describes this train, but **`neotoma@0.3.11` was not published to npm**; registry users last had **`0.3.10`** until **`0.4.0`**. This file remains the curated narrative for the **`v0.3.10…v0.3.11`** git range.

Patch release (git **`v0.3.11`**): large **CLI + HTTP action + MCP runtime** hardening, **instruction / OpenAPI** alignment, plus the **docs site** and **ChatGPT / MCP** integration pages. The single release commit bundles prior work on retrieval parity, entity query paths, and agent-facing rules—not “docs only.”

## What changed for npm package users

**CLI (`neotoma`)**

- **`entities search`:** positional identifier, **`--identifier`**, and compatibility alias **`--query`** (documented in `docs/developer/cli_reference.md`); MCP/CLI parity called out there and in MCP instructions.
- **`store`:** preferred structured input **`--entities`** / **`--file`**; legacy **`--json=<payload>`** remains as an alias for structured entities (still use **`--json=`** with no space for reliable shells). Bare **`--json`** stays the global JSON output flag.
- **`storage merge-db`:** merge SQLite DBs with **`--source` / `--target`**, conflict modes **`safe` (default) | `keep-target` | `keep-source`**, **`--dry-run`**, optional **`--no-recompute-snapshots`**. Documented in CLI reference.
- **`sync_mcp_configs` script** and related config wiring updated for current MCP layouts.

**HTTP Actions / in-process API (`dist/`)**

- Substantial updates to **`src/actions.ts`** and shared handlers: entity listing/query behavior, schema/action plumbing, and alignment with MCP-facing flows. Consumers of the packaged server/API binary pick this up via **`dist/`**.

**Retrieval & entities**

- **`entity_queries`**, **`entity_handlers`**, **`entity_identifier_handler`**, and related server paths: broader query/identifier handling and regression coverage (including **lexical search** integration tests). Aims at more reliable list vs identifier-style queries and parity with MCP expectations.

**MCP server runtime (`dist/`)**

- **`server.ts`** and related services (**MCP OAuth**, **oauth key gate**, **local entity embedding** edge cases, etc.) updated alongside the action layer. MCP clients using the published package get the new behavior from the built server.

**Bundled OpenAPI (npm tarball)**

- **`openapi.yaml`** shipped in the package **`files`** list is updated this release.

**Repository-only (not in the npm `files` list)**

- **`openapi_actions.yaml`** — OpenAPI-shaped surface oriented toward **Custom GPT / HTTP Actions** workflows; clone or copy from the repo when you need it. The **npm package** still ships **`openapi.yaml`** only unless `package.json` `files` is expanded later.

**Agent / instruction sources (repo + sync workflows)**

- **`docs/developer/mcp/instructions.md`** — expanded MCP interaction block: prod vs **neotoma-dev** default, retrieval query-shape guidance, publication-recency vs observation recency, relationship batching in `store`, **`create_relationship` + EMBEDS** clarification, external-tool and **research deliverable** store-first rules, entity-type consistency for imports, **CLI parity** (`search` / `store` aliases), **CLI backup transport** (`--api-only` / `--base-url`) when reconciling with MCP.
- **`docs/developer/cli_agent_instructions.md`** — same **prod vs dev** default, **publication recency** semantics for “recently published” style prompts.
- **`docs/developer/cli_reference.md`** — documents the flags above, **`storage merge-db`**, and MCP/CLI parity notes.
- **`docs/developer/mcp_overview.md`** — batched **`store` + `relationships`** example; **`mcp_chatgpt_setup.md`** — points ChatGPT Apps connector readers to **`chatgpt_apps_setup.md`**.
- These files are what **`sync_mcp_configs`** / rule-copy flows use; refresh local rules after pull if you rely on generated `.cursor` / MCP instruction payloads.

## API surface & contracts

- **`src/shared/action_schemas.ts`** and **`openapi.yaml`** evolved together with the action handlers.
- New **`docs/developer/chatgpt_integration_instructions.md`** and related ChatGPT/MCP setup docs for connector and Custom GPT paths.

## Docs site & CI / tooling

- Integration **subpages** (per-product connect flows), **ICP** copy, **multilingual** site generation, **`validate:locales`**, GitHub Pages workflow (**Playwright Chromium**, path filters), Playwright **site / 404** specs.
- **`docs/releases/in_progress/v0.3.11/`** release tracking; foundation submodule doc nits.

## Breaking changes

- None called out; **`storage merge-db`** defaults to **`safe`** mode to avoid silent data loss—call that out to operators merging databases.
