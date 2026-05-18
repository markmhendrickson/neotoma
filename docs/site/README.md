---
title: "Public site MDX (`docs/site/pages`)"
summary: "**Authoring surface:** Allowlisted MDX for the marketing/docs SPA lives under `docs/site/pages/<locale>/`. Each registered page has a sibling **`.meta.json`** (schema: `frontend/src/site/mdx_page_meta.ts`). Prose and light layout live he..."
---

# Public site MDX (`docs/site/pages`)

**Authoring surface:** Allowlisted MDX for the marketing/docs SPA lives under `docs/site/pages/<locale>/`. Each registered page has a sibling **`.meta.json`** (schema: `frontend/src/site/mdx_page_meta.ts`). Prose and light layout live here; heavy tables, charts, and complex widgets stay in **`frontend/src/components/`** and are imported from MDX when needed (**hybrid** pages).

**Architecture (how it is wired, SEO, validation, i18n):** See the canonical guide **`docs/developer/site_mdx_documentation.md`**.

**Do not** import arbitrary paths under `docs/` into the frontend bundle. Only this tree (plus explicit component imports from MDX) is supported for shipped site content.

**Locales:** English (`en`) is required per route. Spanish (`es`) siblings exist for thin hybrid shells and hand-maintained pages (see `docs/developer/site_mdx_documentation.md` invariant on locale shells). Regenerate coverage with `tsx scripts/mdx_site_translation_audit.ts` (writes `docs/site/generated/translation_audit.md`).

**Also see:** `MIGRATION_BATCHES.md` (migration status), `site_doc_manifest.yaml` (reconciliation with longer-form repo docs under `docs/`), and `generated/ROUTE_INVENTORY.md` (machine-generated route classification).
