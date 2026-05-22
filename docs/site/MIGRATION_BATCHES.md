# MDX site migration batches

Batch plan for moving TSX page bodies into `docs/site/pages/**/*.mdx` while keeping shells, charts, and dynamic data in React.

**Canonical architecture and authoring rules:** `docs/developer/site_mdx_documentation.md`.

## Batch 0 (done)

- MDX pipeline (`@mdx-js/rollup`, `MDXProvider`)
- Registry + `MdxSitePage`
- Pilot: `/changelog` (en + es) and `/foundation/problem-statement` (en)
- Inventory + docs audit + `validate:mdx-site`

## Batch 1 — Reference / install

- **Done (MDX):** `/troubleshooting`, `/schema-management`, `/mcp`, `/cli`, `/api` (hybrid: `doc_reference_tables.tsx` for `site_data` tables + snippets; prose in MDX)
- **Done (MDX hybrid):** `/install`, `/install/manual`, `/install/docker` — bodies in `frontend/src/components/install/*_page_body.tsx`, MDX imports those components; `/install` uses `MdxSitePage` `detailTitle` from `subpage.install.title` for localized shell title.

## Batch 2 — Integrations

- **Done (MDX hybrid):** Codex / Claude / OpenClaw / ChatGPT **connect** subs (`/neotoma-with-*-connect-*`) — bodies in `frontend/src/components/integration_connect/*_page_body.tsx`, MDX shells under `docs/site/pages/en/neotoma-with-*-connect-*.mdx`.
- **Done (MDX hybrid):** `/neotoma-with-chatgpt` — body `frontend/src/components/neotoma_with/neotoma_with_chatgpt_page_body.tsx`.
- **Done (MDX hybrid):** main `/neotoma-with-*` landings — bodies in `frontend/src/components/neotoma_with/neotoma_with_*_page_body.tsx` for IronClaw, Codex, OpenCode, Cursor, Claude, Claude Code, Claude Agent SDK, OpenClaw; thin route components use `MdxSitePage`.

## Batch 3 — Guarantees / primitives / schemas

- **Done (MDX hybrid):** `/memory-guarantees` — body `frontend/src/components/memory_guarantees/memory_guarantees_page_body.tsx`; `MemoryGuaranteesTable` uses `MdxI18nLink` for in-table anchors; shell passes `detailTitle` from `pack.seo.memoryGuarantees` like install.
- **Done (MDX):** guarantee **detail** routes — prose in `docs/site/pages/en/{deterministic-state-evolution,versioned-history,replayable-timeline,auditable-change-log,schema-constraints,silent-mutation-risk,conflicting-facts-risk,false-closure-risk,reproducible-state-reconstruction,human-inspectability,zero-setup-onboarding,semantic-similarity-search,direct-human-editability}.mdx`; internal links use `MdxI18nLink`; `/zero-setup-onboarding` install CTA uses `MdxTrackedInstallLink`. Removed `frontend/src/components/guarantee_details/*_page_body.tsx`.
- **Done (MDX hybrid):** `/primitives` and `/primitives/*` primitive guides — bodies in `frontend/src/components/primitives/primitive_record_site.tsx` (`PrimitivesIndexPageBody`, `PrimitiveRecordTypePageBody`); MDX shells under `docs/site/pages/en/primitives*.mdx` and `docs/site/pages/en/primitives/*.mdx`. **Data layer:** guide payloads live in `frontend/src/components/primitives/primitive_record_guides.ts` (exported `PRIMITIVE_RECORD_TYPE_GUIDES*`, `REPO_*`); `primitive_record_site.tsx` imports, re-exports, and renders only.
- **Done (MDX hybrid):** `/schemas` and `/schemas/*` concept guides — bodies in `frontend/src/components/schemas/schema_concept_site.tsx` (`SchemasIndexPageBody`, `SchemaConceptPageBody`); MDX shells under `docs/site/pages/en/schemas*.mdx` and `docs/site/pages/en/schemas/*.mdx`. **Data layer:** guide payloads live in `frontend/src/components/schemas/schema_concept_guides.ts` (exported `SCHEMA_CONCEPT_GUIDES*`, `REPO_*`); `schema_concept_site.tsx` imports, re-exports, and renders only.

## Batch 4 — Marketing / ICP / verticals

- **Done (MDX hybrid):** ICP mode landings `/operating`, `/building-pipelines`, `/debugging-infrastructure` — bodies use `IcpDetailPage` with `mdxShell`; route components are thin `MdxSitePage` shells; MDX under `docs/site/pages/en/{operating,building-pipelines,debugging-infrastructure}.mdx`. Internal links in `IcpDetailPage` use `MdxI18nLink`.
- **Done (MDX hybrid):** comparison landings `/neotoma-vs-mem0`, `/neotoma-vs-zep`, `/neotoma-vs-rag`, `/neotoma-vs-platform-memory`, `/neotoma-vs-files`, `/neotoma-vs-database` — bodies use `ComparisonPage` with `mdxShell` (`*PageBody` exports); route components are thin `MdxSitePage` shells; MDX under `docs/site/pages/en/neotoma-vs-*.mdx`. Footer links use `MdxI18nLink`.
- **Done (MDX hybrid):** `/build-vs-buy` — body `BuildVsBuyPageBody` in `BuildVsBuyPage.tsx` (internal links use `MdxI18nLink`); route is thin `MdxSitePage`; MDX `docs/site/pages/en/build-vs-buy.mdx`. Shell `detailTitle` matches former in-page H1.
- **Done (MDX hybrid):** vertical / hosted landings — `UseCaseLandingShell` accepts `mdxShell` (SEO from parent); CRM & Compliance custom scroll bodies drop inline `SeoHead`; Sandbox & Hosted unwrap `DetailPage` into `*PageBody`. Routes use `MdxSitePage` with `shell="bare"` for full-bleed pages and default shell for doc-style sandbox/hosted. English MDX under `docs/site/pages/en/{healthcare,government,...,crm,compliance,sandbox,hosted}.mdx`.
- **Done (MDX hybrid):** canonical home variant `/` — thin MDX under `docs/site/pages/en/home.mdx` imports `SitePage` with `omitSeoHead` so `MdxSitePage` `shell="bare"` owns `<SeoHead routePath={…} />`; `MainApp` routes and `getRootElement()` use `MdxSitePage` for `/` when not a product-at-root basename. Earlier `/home-2` (`SitePageHome2`) and `/home/x7k9m2vp` (`SitePageAlt`) preview variants were removed 2026-05-08; their content is consolidated into the canonical `SitePage`.
- **Done (locale shells):** Spanish (`es`) **thin** MDX siblings (import + single component, same MDX as `en`) for hybrid routes so `/es/...` resolves without the English fallback banner; `translation_status: machine_draft` and `translation_of` set to the canonical path. Pages with substantive **English prose inside MDX** (for example guarantee detail pages, `changelog`, `foundation/problem-statement`, reference docs) remain **`en` only** until human translation lands in `docs/site/pages/es/`.

## Batch 5 — Legal / FAQ

- **Done (MDX hybrid):** `/privacy`, `/terms`, `/faq` — **Privacy / terms:** prose in `docs/site/pages/en/{privacy,terms}.mdx` (keep in sync with `docs/legal/site_*.md`; regenerate or edit MDX when legal text changes). **FAQ:** localized intros in `docs/site/pages/{en,es}/faq.mdx` + `FaqQuestions` in `FaqPage.tsx` for locale-aware Q&A, tracked install link via `FaqInstallGuideLink` in the MDX provider. Route shells use `MdxSitePage` + `detailTitle` from `subpage.*.title`. Internal in-page links use `MdxI18nLink` / legal link class where needed. Manifest maps legal sources as supporting for `/privacy` and `/terms`.

Each batch should:

1. Land English MDX + `.meta.json` first.
2. Add or refresh non-English siblings where required.
3. Run `npm run validate:mdx-site` and `npm run validate:routes`.
4. Remove inlined prose from the old TSX page once parity is verified.
