# npm script taxonomy

`package.json` uses script prefixes by runtime shape:

| Prefix | Meaning | Examples |
|--------|---------|----------|
| `dev` / `dev:*` | Long-running local development, watch processes, and dev-only helpers | `dev`, `dev:mcp`, `dev:server`, `dev:types`, `dev:docs` |
| `start:*` | Built `dist/` entrypoints | `start:server`, `start:mcp`, `start:ws` |
| `build:*` | One-shot compile or export | `build:server`, `build:ui`, `build:docs`, `build:site:pages` |
| `info:*` | One-shot informational output | `info:dev-resources` |
| `watch:*` | Deprecated compatibility aliases for old watch names | `watch:server`, `watch:prod` |

`npm run dev` is the full local app stack. Use `dev:mcp` for MCP stdio hot reload and `dev:server*` for the HTTP stack process. Product CLI wording is intentionally separate: `neotoma api start` remains the CLI command until a dedicated CLI rename release, but its source-checkout spawn targets use `dev:server*` npm scripts.

## Canonical Hot Path

| Script | Purpose |
|--------|---------|
| `dev` | Full local stack: HTTP server, Vite UI, TypeScript watch, links/resources output, inspector live build |
| `dev:mcp` | MCP stdio hot reload from `src/index.ts` |
| `dev:mcp:prod` | Production-env MCP stdio hot reload |
| `dev:server` | HTTP stack Node watch only |
| `dev:server:tunnel` | Tunnel plus HTTP stack |
| `dev:server:tunnel:types` | Tunnel plus HTTP stack plus `tsc --watch` |
| `dev:server:prod` | Production-env HTTP stack with types and inspector watch |
| `dev:server:prod:tunnel` | Production-env tunnel plus HTTP stack with types and inspector watch |
| `dev:ui` | Vite app UI dev server |
| `dev:types` | Standalone `tsc --watch --preserveWatchOutput` |
| `dev:links` | Long-running link/resources lane for the full stack |
| `dev:inspector` / `dev:inspector:prod` | Inspector live builds |
| `dev:full:prod` | Full app stack in production env |

## Built Entrypoints

`start:server` is the single long-lived runner (`node dist/actions.js`). Callers set `NEOTOMA_ENV`, `HTTP_PORT`, and other env as needed. `start:server:prod` is a one-shot recipe: `build:server`, pick HTTP port from 3180, set `NEOTOMA_ENV=production`, then `npm run start:server` (same entrypoint as `start:server`).

| Canonical | Compatibility alias |
|-----------|---------------------|
| `start:server` | `start:api` |
| `start:server:prod` | `start:api:prod` |
| `start:mcp` | none |
| `start:ws` | none |

## Docs And Site Scripts

The app UI and static pages site are separate outputs:

| Script | Output |
|--------|--------|
| `build:ui` / `dev:ui` | Main Neotoma app UI through Vite |
| `build:site:pages` / `dev:site:pages` | GitHub Pages static export into `site_pages/` |
| `build:docs` / `dev:docs` / `dev:docs:serve` | React docs app build, dev server, and local serve |

Keep the pages-site aliases for one release:

| Old name | Canonical name |
|----------|----------------|
| `build:pages:site` | `build:site:pages` |
| `watch:pages:site` | `watch:site:pages` |
| `dev:pages:site` | `dev:site:pages` |
| `docs:build` | `build:docs` |
| `docs:dev` | `dev:docs` |
| `docs:serve` | `dev:docs:serve` |

## Compatibility Aliases

Keep these aliases for one minor release, update docs and automation to the canonical names, then remove aliases in a follow-up release.

| Old name | Canonical name |
|----------|----------------|
| `watch` / `watch:mcp:stdio` | `dev:mcp` |
| `watch:mcp:stdio:prod` | `dev:mcp:prod` |
| `watch:mcp:dev-shim` | `dev:mcp:dev-shim` |
| `watch:server` | `dev:server` |
| `watch:dev:tunnel` / `dev:api` | `dev:server:tunnel` |
| `watch:server+api` / `watch:dev` / `dev:server+api` | `dev:server:tunnel:types` |
| `watch:prod` / `dev:prod` | `dev:server:prod` |
| `watch:prod:tunnel` | `dev:server:prod:tunnel` |
| `watch:build` / `dev:mcp:watch` | `dev:types` |
| `watch:full` / `dev:full` | `dev` |
| `watch:full:prod` | `dev:full:prod` |
| `dev:resources` | `info:dev-resources` |
| `dev:resources:watch` | `dev:links` |
| `dev:server+mcp` | `dev:server:mcp` |
| `build:inspector:watch-target` | `build:inspector:dev-target` |
| `build:inspector:watch-target:prod` | `build:inspector:prod-target` |

## macOS LaunchAgents

| npm script | Installs |
|------------|----------|
| `setup:launchd-dev` / `setup:launchd-dev-server` | `com.neotoma.dev-server` → `npm run dev:server` ([`launchd_dev_servers.md`](launchd_dev_servers.md)) |
| `setup:launchd-prod-server` | `com.neotoma.prod-server` → `npm run start:server:prod` ([`launchd_prod_server.md`](launchd_prod_server.md)) |
| `setup:launchd-cli-sync` | `com.neotoma.watch-build` → `npm link`, one `build:server`, then `dev:types` using the captured setup-time Node/npm toolchain (keeps global `neotoma` pointed at the checkout and aligned with `dist/`) |
| `setup:launchd-watch-build` | Alias → `setup:launchd-cli-sync` |
| `setup:launchd-watch-stacks` | Dev server agent + `setup:launchd-cli-sync` (compatibility wrapper) |
| `setup:launchd-issues-sync` | `com.neotoma.issues-sync` |
| `reload:launchd-neotoma` | Unloads then loads each installed Neotoma plist (dev-server, prod-server, watch-build, issues-sync); macOS only |
| `shutdown:launchd-neotoma` | Unloads Neotoma launchagents, stops dev/prod APIs, and reaps leftover launchd-owned repo processes; macOS only |

## Validation

After script changes, run targeted CLI tests that assert spawn target names and smoke at least:

- `npm run build:server`
- `npm run build:site:pages`
- `npm run dev:mcp -- --help` only if a short non-watch mode is available; otherwise verify the script exists with `npm run`
- `neotoma api start --env dev --output json` from a source checkout when testing manually
