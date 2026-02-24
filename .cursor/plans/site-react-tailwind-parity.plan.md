---
name: ""
overview: ""
todos: []
isProject: false
---

# Site React/Tailwind parity plan

## Scope and target

- Build a new **site** React surface that replaces the current string-template generator in `[scripts/build_github_pages_onboarding.js](scripts/build_github_pages_onboarding.js)`.
- Rename all references from "onboarding" to **site** (route, component names, scripts, docs).
- Deliver to both targets:
  - frontend runtime route (e.g. `/site` inside existing app router)
  - GitHub Pages static artifact (`site_pages/index.html` equivalent behavior)
- Use parity references from:
  - ateles `react-app/src/pages/Post.tsx`
  - ateles `react-app/src/index.css`
  - ateles `shared/src/components/ui/sidebar.tsx`

## Naming convention

- **Product/surface:** "site" (not "onboarding")
- **Route:** `/site` (or as chosen; avoid `/onboarding`)
- **Components:** e.g. `SitePage`, `SiteSidebar`, `siteData`
- **Scripts/build:** e.g. `build:site`, `build_github_pages_site.js` (replace current onboarding script name)
- **Data/constants:** e.g. `SITE_SECTIONS`, `siteContent` — update any "onboarding" in identifiers to "site"

## Architecture and delivery model

- Source docs (markdown snippets) → typed site data model → React/Tailwind site page.
- Site page is consumed by: (1) frontend runtime route, (2) static render pipeline → `site_pages` artifact.

## Implementation phases

### Phase 1: Extract content/data model and rename to "site"

- Move all hardcoded content (sections, terminology table, functionality matrix) into a typed **site** data module.
- Preserve existing source-doc extraction (code-block anchors from developer docs).
- Single source-of-truth for section ids/labels (headings + sidebar). Use naming: `SITE_SECTIONS`, `getSiteContent()`, etc.

### Phase 2: Build React/Tailwind site page with parity behaviors

- Create **Site** page component (e.g. `SitePage.tsx`) with post-prose structure and heading-anchor behavior from ateles.
- Section sidebar with active-state sync (IntersectionObserver) and hash deep-link support.
- Heading anchor links with hover parity (40% / 70% / 100%).
- Code-block copy buttons and table wrappers with overflow detection and directional scroll hints.

### Phase 3: Style parity

- Align typography/spacing with ateles post-prose; sidebar with ateles token-like values and breakpoint behavior.
- Desktop sticky sidebar; mobile compact section nav with 44px-friendly targets.

### Phase 4: Dual-target publishing (runtime + GitHub Pages)

- Add static build path for **site** React output to replace current script output for `site_pages`.
- Script/config rename: replace `build_github_pages_onboarding.js` with site-equivalent (e.g. `build_github_pages_site.js` or integrate into frontend build).
- Preserve canonical meta/OG data.

### Phase 5: Quality gates and verification

- Tests for section ids, table rendering, heading anchors, sidebar active state, hash deep-link, copy buttons.
- Build, type-check, lint; viewport QA (mobile/tablet/desktop).

## Acceptance criteria

- Site page is React/Tailwind; no string-template HTML generation for this surface.
- Runtime route exists (e.g. `/site`) with full content and interactions.
- GitHub Pages static output is generated from React and preserves current publish behavior.
- Sidebar, heading anchors, and table-scroll match ateles functional parity.
- All user-facing and code references use "site" instead of "onboarding" for this surface.
- Build/test pipeline passes.

## Todos (frontmatter)

- extract-site-data-model: Create typed site data/extraction module from current generator content; use "site" naming.
- build-react-site-page: Implement React/Tailwind site page (SitePage) with sidebar, anchors, copy buttons, table hints.
- wire-site-route: Add site route to frontend router (e.g. /site); ensure layout integration.
- implement-static-site-export: Replace onboarding generator with React-based static export for site_pages; rename scripts.
- parity-style-pass: Align typography/sidebar/table styles to ateles patterns.
- verify-and-test: Add tests and run lint/type/build plus responsive QA; confirm "site" naming throughout.
