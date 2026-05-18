---
title: MDX ↔ markdown parity
summary: How and why each MDX site page should have a canonical markdown counterpart, with JSX serving as a progressive enhancement.
category: development
subcategory: site
order: 40
audience: developer
visibility: public
tags: [mdx, markdown, accessibility, progressive-enhancement]
---

# MDX ↔ markdown parity

## Why

The public site at [docs/site/pages/en/](../site/pages/en/) is authored as MDX. Some pages are plain markdown wrapped in a tiny MDX shell; others import React components that produce rich UI (tables, snippet pickers, harness configurators).

The MDX renders fine for users with JavaScript. For users without — search engines, screen readers in degraded modes, LLM crawlers, archive.org, terminal-mode browsers, the in-repo `/docs` index — JSX evaporates and content is lost.

The contract: **every MDX page that uses JSX components should have a canonical markdown counterpart in `docs/<topic>/<slug>.md` with static equivalents of the JSX**. The MDX becomes a progressive enhancement layered on top. Both render the same information; the JSX version adds interactivity.

## Audit

[scripts/mdx_markdown_parity_audit.ts](../../scripts/mdx_markdown_parity_audit.ts) generates [docs/site/generated/mdx_markdown_parity.md](../site/generated/mdx_markdown_parity.md) classifying every MDX page:

- **Covered**: a `status: supporting_source` entry exists in [docs/site/site_doc_manifest.yaml](../site/site_doc_manifest.yaml) pointing the MDX path back to a canonical markdown file.
- **Needs canonical markdown**: the MDX uses JSX but no `supporting_source` entry exists.
- **Plain-markdown MDX (no parity gap)**: the MDX uses no JSX, so the source is already accessible-without-JS.

Run the audit:

```bash
npx tsx scripts/mdx_markdown_parity_audit.ts
```

## Authoring a canonical markdown counterpart

1. Pick an MDX page from the `Needs canonical markdown` table in the audit.
2. Identify each imported component in the MDX. Decide on a static equivalent:
   - **`MdxI18nLink`** → plain markdown link `[label](/path)`.
   - **Data tables** (e.g. `CliReferenceCommandsTable`, `ApiReferenceEndpointsTable`) → markdown tables with one row per entry.
   - **Snippet pickers / harness configurators** → a markdown table with one row per option, listing the snippet/config inline as a fenced code block per row.
   - **Whole-page React components** (e.g. `*LandingPageBody`) → read the React component and translate its prose, lists, and tables into markdown. This is real authoring work, not mechanical conversion.
3. Write the canonical markdown to `docs/<category>/<slug>.md`. Use the same `<slug>` as the MDX page where possible; if the MDX path was kebab-case, the canonical doc uses snake_case per repo file-naming conventions.
4. Add frontmatter: `title`, `summary`, `audience`, optional `category`/`subcategory` overrides.
5. Add a `supporting_source` entry to [docs/site/site_doc_manifest.yaml](../site/site_doc_manifest.yaml):
   ```yaml
   - repo_path: docs/integrations/neotoma_with_continue.md
     status: supporting_source
     canonical_site_path: /neotoma-with-continue
     notes: "Canonical markdown counterpart; MDX wraps with i18n links."
   ```
6. Re-run the audit. The page moves from `Needs canonical markdown` to `Covered`.
7. (Optional follow-up) Update the MDX page to read from the canonical markdown — e.g. via an `<MdxFromMarkdown source="..." />` wrapper — so the two cannot drift. This is not required for parity; manual authoring is fine if maintainers commit to keeping them in sync.

## Automation for simple cases

[scripts/mdx_to_markdown_for_simple_pages.ts](../../scripts/mdx_to_markdown_for_simple_pages.ts) automates conversion of MDX pages whose only JSX usage is `MdxI18nLink` and decorative `<ul>` lists. Six such pages were converted as the seed of this contract:

- `/non-destructive-testing` → [docs/guides/non_destructive_testing.md](../guides/non_destructive_testing.md)
- `/integrations` → [docs/integrations/README.md](../integrations/README.md)
- `/neotoma-with-continue` → [docs/integrations/neotoma_with_continue.md](../integrations/neotoma_with_continue.md)
- `/neotoma-with-letta` → [docs/integrations/neotoma_with_letta.md](../integrations/neotoma_with_letta.md)
- `/neotoma-with-vscode` → [docs/integrations/neotoma_with_vscode.md](../integrations/neotoma_with_vscode.md)
- `/neotoma-with-windsurf` → [docs/integrations/neotoma_with_windsurf.md](../integrations/neotoma_with_windsurf.md)

The script:
- Strips MDX `import` statements.
- Pre-strips JSX attributes that can contain `>` (`className`, `style`, `aria-hidden`) so they don't break the tag matcher.
- Replaces `<MdxI18nLink to="X">label</MdxI18nLink>` with `[label](X)`.
- Replaces decorative JSX `<ul><li>...</li></ul>` lists with plain markdown unordered lists, stripping leading arrow spans.
- Unwraps `<div>` and `<p>` tags, decodes HTML entities, normalizes whitespace.
- Writes frontmatter inferred from the MDX `.meta.json`.
- Appends `supporting_source` entries to `site_doc_manifest.yaml`.

For more complex MDX (data tables, picker UIs, whole-page React components), conversion is manual.

## Remaining gap

Per the latest audit run: **55 MDX pages still need canonical markdown**. Most are pages whose entire body is a single imported React component (`*LandingPageBody`). Authoring those means reading the component source and writing markdown equivalents — substantial per-page work tracked as follow-up FUs, not in scope for this PR.

## Related

- [docs/site/README.md](../site/README.md) — MDX authoring overview.
- [docs/site/site_doc_manifest.yaml](../site/site_doc_manifest.yaml) — central registry of MDX ↔ markdown pairings.
- [docs/site/generated/mdx_markdown_parity.md](../site/generated/mdx_markdown_parity.md) — current audit.
- [docs/developer/docs_index_route.md](docs_index_route.md) — the `/docs` route that consumes the markdown side.
- [docs/developer/site_mdx_documentation.md](site_mdx_documentation.md) — canonical MDX architecture doc.
