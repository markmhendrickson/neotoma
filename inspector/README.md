# Neotoma Inspector

A React SPA for inspecting and managing all data stored in a Neotoma instance. Provides full-coverage UI for every Neotoma REST API endpoint: browsing entities, observations, sources, relationships, schemas, timeline events, and interpretations, with an interactive graph explorer and top-level dashboard analytics.

## Architecture: Bundled into the Neotoma server

The Inspector is always bundled into the Neotoma server build and served at `/`
on the same origin by default. There is no separate deployment, no GitHub
Pages, no external URL to configure. `npm run dev` in the parent repo and the
Inspector is live at `localhost:3080/`.

The build that ships in the npm tarball lives at
`<neotoma-package>/dist/inspector` (and `/app/inspector` inside the Docker
image). `VITE_PUBLIC_BASE_PATH=/` is set at build time; `VITE_NEOTOMA_API_URL`
is intentionally left unset so the Inspector uses relative same-origin URLs at
runtime. Set `NEOTOMA_INSPECTOR_BASE_PATH=/inspector` only when a deployment
needs the legacy subpath mount.

## Quick Start

```bash
# Install dependencies
npm install

# Start inspector + matching Neotoma dev API
npm run dev

# Start inspector + matching Neotoma prod API
npm run dev -- --env prod

# Build for production
npm run build
```

Vite defaults to **`base: /`** when `VITE_PUBLIC_BASE_PATH` is unset, so the dev
server is at **`http://localhost:5175/`** (port **5175** avoids clashing with
the repo root marketing Vite dev server, which often runs on
**5173**/**5174**). Override the dev port with **`VITE_INSPECTOR_DEV_PORT`** or
**`INSPECTOR_DEV_PORT`**. Set `VITE_PUBLIC_BASE_PATH=/inspector/` only when
testing the legacy subpath mount.

## Configuration

`npm run dev` launches a Neotoma API automatically via the CLI and injects the matching default API URL:

- `npm run dev` -> `dev` environment -> `http://localhost:3080`
- `npm run dev -- --env prod` -> `prod` environment -> `http://localhost:3180`

During local development, the SPA talks to the API through the Vite proxy at `/api`, which avoids browser CORS issues while still targeting the matching Neotoma environment above.

You can still override the API URL via environment variable or the Settings page:

```bash
# .env or .env.local
VITE_NEOTOMA_ENV=dev
VITE_NEOTOMA_API_URL=http://localhost:3080
```

Saved API URLs and auth tokens are scoped per environment (`dev` / `prod`), so switching preserves separate connection settings.

## Skinning

The Inspector ships with a default Neotoma palette, but embedders can override
the colour palette and brand text (sidebar title, document title, home-link
aria-label) at server start via JSON config files. No fork required.

Two environment variables drive resolution; precedence is highest first:

- **`NEOTOMA_INSPECTOR_SKIN_CONFIG=/abs/path/custom.json`** — load an arbitrary
  skin JSON from disk. Useful for one-off embedder customizations without
  rebuilding the package.
- **`NEOTOMA_INSPECTOR_SKIN=<name>`** — load a bundled preset shipped under
  `dist/inspector/skins/<name>.json` (built from `inspector/public/skins/`).
  The repository ships with `sample` — a deliberately garish magenta/cyan
  palette for verifying that skinning took effect — as the initial preset; add
  more by dropping additional JSON files under `inspector/public/skins/`.

When neither variable is set (or the configured file is missing/invalid), the
Inspector renders the default Neotoma palette unchanged.

### Skin JSON shape

```jsonc
{
  "name": "sample",               // stable slug; required
  "label": "Sample Skin",         // optional human-readable label

  "brand": {
    "sidebar_title": "Sample Skin",         // replaces the sidebar wordmark
    "header_title": "Sample Skin (test)",   // sets document.title
    "home_aria_label": "Sample Skin home"
  },

  "light": {                       // CSS variables for light mode
    "background": "300 100% 98%",
    "foreground": "300 80% 10%",
    "primary":    "315 90% 50%",
    "sidebar":    "315 70% 90%"
    // ... see sample.json for the full token list
  },

  "dark": {                        // optional dark-mode overrides
    "background": "290 50% 8%",
    "foreground": "300 100% 95%"
    // ...
  }
}
```

See [`inspector/public/skins/sample.json`](https://github.com/markmhendrickson/neotoma/blob/main/inspector/public/skins/sample.json) for the full token list.

Token values use the shadcn / Tailwind HSL triplet format
(`"<hue> <saturation>% <lightness>%"`, optionally followed by `/ <alpha>`).
The frontend sanitizer in `inspector/src/lib/inspector_skin.ts` rejects any
value that doesn't match this shape, so a malformed skin can never break out of
the CSS variable context.

The server-side loader injects the sanitized skin into the SPA shell at runtime
as `<script>window.__NEOTOMA_INSPECTOR_SKIN__ = {...};</script>`, and
`initialize_inspector_skin_on_load()` applies it before the React tree mounts
so first paint matches the configured palette.

## Sandbox mode & session handoff

On the hosted sandbox (`sandbox.neotoma.io`), the Inspector is served at `/` on
the same origin as the API. Ephemeral sessions are created via the landing page
pack picker and handed off to the Inspector via a one-time code in the hash
fragment:

1. **Sandbox handoff (default for visitors).** Users start at
   `sandbox.neotoma.io/`, pick a fixture pack (generic, empty, or a use case),
   and stay on `/#session=<one_time_code>`.

   `src/lib/sandbox_session.ts` (`consumeSandboxSessionHandoff`) runs on boot, POSTs `/sandbox/session/redeem` (same-origin), stores the returned bearer via `setApiUrl` / `setAuthToken`, scrubs the hash, and reloads. The `SandboxBanner` then shows the active pack id + expiry countdown + Reset / End-session controls.

2. **Manual bearer (power users).** Paste an API base URL and bearer on **Settings**. While a redeemed sandbox session is active, these fields collapse under "Show advanced connection settings."

3. **Local dev proxy.** `npm run dev` still launches a local Neotoma and proxies `/api`; no handoff needed.

### Sandbox UI flag

`VITE_NEOTOMA_SANDBOX_UI=1` (or any live redeemed session) enables:

- A persistent `SandboxBanner` with pack + expiry countdown, AAuth tier, and Reset / End-session buttons when a session is active; the public weekly-reset notice + terms / abuse links otherwise.
- Destructive admin surfaces are hidden to match the server-side destructive-op gate.

See [docs/subsystems/sandbox_deployment.md](../docs/subsystems/sandbox_deployment.md) for the full sandbox architecture.

## Pages

- **Dashboard** (`/`) — Top-level stats, entity type breakdown chart, recent timeline activity, health status
- **Entities** (`/entities`) — Filterable/sortable entity list with search, type filtering, pagination
- **Entity Detail** (`/entities/:id`) — Snapshot, observations, relationships, graph neighborhood, field provenance; Edit tab for multi-field batch corrections
- **Observations** (`/observations`) — Browse and create observations with JSON field viewer
- **Sources** (`/sources`) — Browse sources, upload files, structured store; download via signed URLs
- **Relationships** (`/relationships`) — Browse, create, delete/restore relationships with snapshot provenance
- **Graph Explorer** (`/graph`) — 1-hop neighborhood visualization with React Flow (default tree layout, optional radial)
- **Schemas** (`/schemas`) — Registry browser, field/reducer detail, register/update forms, candidate analysis
- **Timeline** (`/timeline`) — Chronological event stream with date/type filters
- **Interpretations** (`/interpretations`) — AI interpretation run history
- **Settings** (`/settings`) — API connection, server info, user details, snapshot health

## Tech Stack

- React 18 + TypeScript
- Vite 6
- Tailwind CSS + shadcn/ui (Radix)
- TanStack Query v5 + TanStack Table
- React Router v7
- Recharts (dashboard charts)
- @xyflow/react (graph visualization)
- lucide-react (icons)

## API Coverage

Covers all endpoints from the Neotoma OpenAPI spec.

## Integration

This app is a git submodule of the main Neotoma repo:

```bash
git submodule add <repo-url> inspector
```
