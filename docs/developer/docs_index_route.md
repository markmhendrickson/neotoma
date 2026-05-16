---
title: /docs index route
summary: How the server-rendered /docs index works, how to add a doc, frontmatter reference, and visibility rules.
category: development
subcategory: site
order: 30
audience: developer
visibility: public
tags: [docs, route, frontmatter]
---

# /docs index route

The `/docs` route is a server-rendered HTML index of every markdown file under
the repo `docs/` tree. It exists so the markdown files in `docs/` remain the
canonical source of truth for documentation while also being browseable at
runtime via the same Neotoma server that hosts the inspector and root landing.

This page documents how the route works, how to author docs that surface
correctly, and how the featured list and category tree are curated.

## URLs

- `GET /docs` — Index page. Embeds an in-memory JSON of all visible docs and
  filters via a small client-side `<script>`. Featured docs render at the top;
  the rest are grouped by category and subcategory.
- `GET /docs/<slug>` — Render a single markdown doc. Slug is the path under
  `docs/` with no `.md` suffix. Example: `/docs/foundation/core_identity`
  renders `docs/foundation/core_identity.md`.

## Visibility

Every doc has a `visibility` value: `public` or `internal`.

- `public` docs are always shown.
- `internal` docs 404 unless one of:
  - `NEOTOMA_DOCS_SHOW_INTERNAL=true`, or
  - `NODE_ENV !== "production"`.

The default for a folder is in `FOLDER_DEFAULTS` in
`src/services/docs/doc_frontmatter.ts`. Folders that default to internal:

- `docs/plans/`
- `docs/proposals/`
- `docs/prototypes/`
- `docs/reports/`
- `docs/implementation/`
- `docs/assets/`

Anything under `docs/private/` is never served regardless of the visibility
flag.

## Frontmatter

Frontmatter is optional. Every field is inferred when missing.

```yaml
---
title: Core Identity
summary: What Neotoma is and is not.
category: foundation
subcategory: null
order: 10
featured: false
visibility: public
audience: developer
tags: [identity, state-layer]
last_reviewed: 2026-05-01
---
```

Field reference:

| Field | Type | Default | Notes |
|---|---|---|---|
| `title` | string | first `# H1`, else humanized filename | Display title. |
| `summary` | string | first paragraph (240 char max) | One-line summary for the index. |
| `category` | slug | inferred from folder | Must match a key under `categories:` in `docs/site/site_doc_manifest.yaml`. |
| `subcategory` | slug or null | inferred from folder | Optional. |
| `order` | number | 100 (0 for `README.md` / `index.md`) | Lower = earlier within group. |
| `featured` | bool | false | Display-only; featuring is curated in the manifest. |
| `visibility` | `public` \| `internal` | inferred from folder | See above. |
| `audience` | `developer` \| `operator` \| `agent` \| `user` | inferred from folder | |
| `tags` | string list | `[]` | Free-form, used by client-side search. |
| `last_reviewed` | `YYYY-MM-DD` or null | null | Displayed on the doc page. |

The parser is a narrow flat-YAML reader (`parseFlatYaml` in
`src/services/docs/doc_frontmatter.ts`). It accepts primitives and bracketed
string lists; anything more exotic is ignored and inferred instead.

## Category tree

Categories and subcategories are declared in
`docs/site/site_doc_manifest.yaml` under the top-level `categories:` key.
Each category has `key`, `display_name`, `order`, and optional `description`.

```yaml
categories:
  - key: foundation
    display_name: "Foundation"
    description: "Core identity, philosophy, and architectural invariants."
    order: 20
    subcategories: []
```

The index renders categories in `order`, then declared subcategories in order,
then undeclared subcategories alphabetically, then any docs that declared the
category but no subcategory.

A doc whose `category` slug isn't declared in the manifest still renders — it
shows up under an auto-generated category at the end of the page. Adding the
category to the manifest is the way to give it a friendly name and placement.

## Featured list

Featured docs are curated in `docs/site/site_doc_manifest.yaml` under the
top-level `featured:` key. The order in the manifest is the display order on
the index page.

```yaml
featured:
  - docs/NEOTOMA_MANIFEST.md
  - docs/foundation/core_identity.md
  - docs/developer/cli_reference.md
```

Featured docs that resolve to an internal-visibility doc are filtered out in
production; no manual action needed.

## Adding a doc

1. Write the markdown file under the appropriate `docs/` subfolder.
2. Optional: add frontmatter to override the inferred title, summary,
   category, etc.
3. If the doc introduces a new category, add it to `categories:` in
   `docs/site/site_doc_manifest.yaml`.
4. If the doc should appear in the featured list, add its repo path to
   `featured:` in the same manifest.
5. No build step is required at runtime — `/docs` reads from disk on each
   request.

## Security

- Slug allowlist: `[A-Za-z0-9_./-]+`. Any other character returns 404.
- `..` is rejected before any filesystem call.
- The resolved absolute path must stay strictly under the repo `docs/` root;
  symlinks pointing outside are rejected.
- `docs/private/` is never served, even with `NEOTOMA_DOCS_SHOW_INTERNAL=true`.
- The route is registered in
  `scripts/security/protected_routes_manifest.json` under the
  runtime-only unauth allow-list with a stated reason.
- No reads of `req.socket.remoteAddress`, `X-Forwarded-For`, or `Host` — the
  route is stateless and serves identical bytes regardless of caller.

## Determinism

The index is a pure function of the on-disk `docs/` tree plus the manifest.
Sort order is:

1. `category.order` (manifest)
2. `subcategory.order` (manifest)
3. `frontmatter.order` (doc)
4. `frontmatter.title` (alphabetical)

Two consecutive requests against the same files return byte-identical HTML.

## Related

- `src/services/docs/index.ts` — route mount.
- `src/services/docs/index_builder.ts` — tree builder.
- `src/services/docs/render.ts` — single-doc renderer + slug sanitization.
- `src/services/docs/doc_frontmatter.ts` — schema + inference rules.
- `src/services/docs/markdown_render.ts` — markdown → HTML.
- `docs/site/site_doc_manifest.yaml` — category tree + featured list +
  status entries for site-mapped docs.
