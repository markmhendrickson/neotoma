---
title: "Public site content: MDX and markdown-backed pages"
summary: "This document describes how **public marketing and docs-facing pages** in the Neotoma SPA are authored, where sources live, and how they connect to routing, SEO, and validation."
---

# Public site content: MDX and markdown-backed pages

## Scope

This document describes how **public marketing and docs-facing pages** in the Neotoma SPA are authored, where sources live, and how they connect to routing, SEO, and validation.

It covers:

- The **`docs/site/pages/`** tree (MDX + companion metadata)
- The **registry and shell** (`mdx_site_registry`, `MdxSitePage`, React Router)
- **Hybrid pages** (MDX + React bodies), **full-bleed** shells, and **data-only** TypeScript modules
- **SEO**, **i18n**, and **automation** (scripts, tests)

It does not cover:

- Long-form subsystem specs under `docs/subsystems/` (those may **support** site pages via `docs/site/site_doc_manifest.yaml` but are not imported wholesale into the bundle)
- Inspector app, API docs outside the SPA, or release processes

## Purpose

Keep a **single, reviewable source** for site copy and structure that:

1. Lives in **`docs/`** (with `docs/site/pages/<locale>/…`) so changes are visible in diffs and PRs like other documentation.
2. Is **bundled explicitly** through Vite’s MDX pipeline and a small registry, instead of importing arbitrary paths from `docs/` into the frontend.
3. Stays aligned with **`frontend/src/site/seo_metadata.ts`** (`ROUTE_METADATA`) and route parity checks.

## Invariants

1. **Default locale required:** Every public path must have an English (`en`) MDX + `.meta.json` pair. Other locales are optional; the UI falls back to English when missing (`resolveMdxSitePage` in `frontend/src/site/mdx_site_registry.ts`).
2. **Meta sibling:** Each `*.mdx` under `docs/site/pages/` that participates in the registry must have a same-basename **`*.meta.json`** validated by `scripts/validate_mdx_site_pages.ts` (see `frontend/src/site/mdx_page_meta.ts` for the schema).
3. **Route metadata:** `meta.path` must exist as a key in `ROUTE_METADATA` so titles, descriptions, and robots rules stay consistent with `SeoHead`.
4. **No wildcard doc imports:** Do not add `import.meta.glob` over all of `docs/` for the product site. New pages are added as explicit MDX files under `docs/site/pages/`.
5. **Manifest closure:** Every routed `*.mdx` under `docs/site/pages/` MUST have a matching entry in [`docs/site/site_doc_manifest.yaml`](../site/site_doc_manifest.yaml) with `status: canonical_site_page` and a `canonical_site_path`. When a longer repo doc supports the page (for example a foundation or subsystem doc), add a sibling `supporting_source` entry pointing at that doc. Pages without a repo source-of-truth (pure marketing landings) MUST carry a `notes:` line stating that explicitly so the gap is intentional, not accidental. The audit scripts (`mdx_site_docs_audit.ts`, `validate_mdx_site_pages.ts`) flag missing entries.
6. **Non-default locale shells:** For **hybrid** routes whose English MDX is only an import plus a single React component (no meaningful MDX prose), you may add **`docs/site/pages/es/<same-relative-path>.mdx`** with identical MDX and a Spanish `.meta.json` (`locale: es`, `translation_of` equal to `path`, `translation_status: machine_draft`) so Spanish URLs load the same component tree without showing the fallback banner. **`page_title`** may stay English until a copy pass; bump `translated_from_revision` when the English `en` meta revision changes. Do **not** copy this pattern for long-form English MDX: translate prose in place or keep `en` only until a real `es` document exists.

## Definitions

| Term | Meaning |
|------|--------|
| **MDX site page** | A compiled MDX module registered via `*.meta.json` into `mdx_site_registry` for a canonical path (for example `/install`). |
| **Hybrid page** | MDX holds prose and layout hooks; **heavy UI or tables** live in React (`*_page_body.tsx` or named exports) imported from MDX. |
| **`shell="bare"`** | `MdxSitePage` renders SEO + MDX only (no `DetailPage` chrome). Used for full-bleed marketing shells; inner components may use `omitSeoHead` so `SeoHead` is not duplicated. |
| **`shell="detail"`** (default) | MDX body is wrapped in `DetailPage` using `page_title` from meta (or an override such as `detailTitle`). |
| **Site doc manifest** | `docs/site/site_doc_manifest.yaml` maps longer repo docs to canonical site paths and roles (`canonical_site_page` vs `supporting_source`). |

## Architecture

### Source layout

```text
docs/site/pages/
  <locale>/           # e.g. en, es; must include "en" for every routed path
    <name>.mdx
    <name>.meta.json
    … nested dirs as needed (e.g. en/primitives/entities.mdx)
```

- **Prose and light structure** belong in MDX (headings, lists, `MdxI18nLink`, short intros).
- **Charts, complex tables, locale-heavy widgets** stay in **`frontend/src/components/`** and are imported into MDX where needed.

### Runtime wiring

1. **`frontend/src/site/mdx_site_registry.ts`:** At build time, Vite collects `docs/site/pages/**/*.mdx` and `**/*.meta.json` (eager `import.meta.glob`). `hasMdxSitePage(path)` and `resolveMdxSitePage(path, locale)` power routing and tests.
2. **`frontend/src/components/subpages/MdxSitePage.tsx`:** Resolves the bundle, renders `SeoHead` with the effective route path (`useEffectiveRoutePath`), optional locale fallback banner, and either `DetailPage` or bare layout.
3. **`frontend/src/components/MainApp.tsx`:** Routes that use MDX render `<MdxSitePage canonicalPath="…" />` (and `shell="bare"` when the MDX page owns the full viewport).
4. **MDX provider components:** `frontend/src/components/mdx/mdx_site_components.tsx` (and related) supply shortcodes (`MdxI18nLink`, tracked install links, FAQ blocks, etc.).

### Hybrid and data layers

- **Hybrid:** MDX is the stable entry file; React exports a `*PageBody` or similar. Example pattern: `docs/site/pages/en/install.mdx` imports `InstallPageBody`.
- **Config-heavy guides:** Large structured blobs (e.g. primitive or schema concept guides) may live in **`*.ts`** modules colocated with components (`primitive_record_guides.ts`, `schema_concept_guides.ts`) so MDX/React stay thin and data can be tested or codegen’d without pulling markdown from random paths.

### SEO and markdown mirrors

- **`frontend/src/site/seo_metadata.ts`:** `ROUTE_METADATA` is the canonical map from path to title, description, robots, JSON-LD, etc. `SeoHead` resolves metadata from the active path.
- **`frontend/src/site/site_page_markdown.ts`:** Builds **Markdown bundles from SEO metadata** for tools like `/site-markdown` and `/markdown/…`. That is **not** a second copy of MDX bodies; long-form site prose remains in MDX where migrated.
- **`scripts/mdx_site_route_inventory.ts`:** Classifies routes (for example `static_mdx` vs other); writes `docs/site/generated/ROUTE_INVENTORY.md`.

## Flow: adding or changing a page

1. Add or edit **`docs/site/pages/en/<route>.mdx`** and **`docs/site/pages/en/<route>.meta.json`** (`path` must match the React Router canonical path, starting with `/`).
2. Ensure **`ROUTE_METADATA`** in `seo_metadata.ts` contains that `path` (titles, descriptions, `robots`, etc.).
3. Wire **`MainApp.tsx`** (or an existing route component) to `<MdxSitePage canonicalPath="/your/path" />` if not already generic.
4. For non-English: add **`docs/site/pages/<locale>/…`** with aligned `translation_of` / `source_locale` in meta when you want a real translation (see existing `es` examples).
5. Run **`npm run validate:mdx-site`**, **`npm run build:ui`**, and **`npm run validate:routes`**.
6. Update **`docs/site/site_doc_manifest.yaml`** when a page corresponds to a longer repo doc (supporting vs canonical).
7. Record large migrations or batch status in **`docs/site/MIGRATION_BATCHES.md`** when relevant.

## Testing requirements

| Check | Command or location |
|--------|----------------------|
| Meta + sibling MDX | `npm run validate:mdx-site` (`scripts/validate_mdx_site_pages.ts`) |
| Registry smoke | `frontend/src/site/mdx_site_registry.test.ts` |
| UI compile | `npm run build:ui` |
| Route vs metadata parity | `npm run validate:routes` (`scripts/validate_site_route_parity.ts`) |

## Related documents

- **`docs/site/README.md`:** Short entrypoint for authors under `docs/site/pages/`.
- **`docs/site/MIGRATION_BATCHES.md`:** What was migrated and which patterns apply per batch.
- **`docs/site/site_doc_manifest.yaml`:** Maps repo markdown to site paths.
- **`frontend/src/site/mdx_page_meta.ts`:** JSON schema for `.meta.json`.
- **`docs/conventions/documentation_standards.md`:** General doc structure for the repo.

## Agent instructions

- Prefer **editing MDX** under `docs/site/pages/` for user-visible site copy when a route is already MDX-backed.
- When adding a **new** public path, add **en** MDX + meta, **`ROUTE_METADATA`**, route element, and validation scripts in the same change.
- Do not import arbitrary **`docs/**/*.md`** files into the SPA bundle; use the manifest and MDX allowlist described here.
- After substantive site doc edits, run **`validate:mdx-site`** and **`build:ui`** before merging.
