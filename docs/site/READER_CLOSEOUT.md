# Public reader documentation closeout

This inventory describes the repository Markdown selected by `frontend/src/site/docs_viewer_manifest.ts` for the static site viewer. It does not assert that every repository document has been rewritten or that a local draft is published. The release comparison is published tag `v0.25.0` at `8ca1f0a31cb2e40619292e9974177d06d62626ab`; the current-code comparison was `origin/main` at `477978471c5933e26fa07a0d28633382ec4bedb2` on 2026-10-24. A built site uses its own commit for source links; a local preview serves draft Markdown locally and pins links to other repository files to the known published reference configured in the renderer.

## Reader routes in this pass

| Route             | Reader source                             | Scope                                                                                                 |
| ----------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/cli/`           | `docs/topics/interfaces/cli.md`           | First commands and read-back; full command contract stays in `docs/developer/cli_reference.md`.       |
| `/rest-api/`      | `docs/topics/interfaces/rest-api.md`      | Target, auth, common operations; full HTTP detail stays in `docs/api/rest_api.md` and `openapi.yaml`. |
| `/vocabulary/`    | `docs/topics/architecture/vocabulary.md`  | Main objects and their boundaries; definitions stay in `docs/vocabulary/canonical_terms.md`.          |
| `/read-search/`   | `docs/topics/interfaces/read-search.md`   | ID, identifier, typed query, and known-positive checks.                                               |
| `/store-correct/` | `docs/topics/interfaces/store-correct.md` | Declared fields, write effect, correction history, version distinction.                               |
| `/history/`       | `docs/topics/architecture/history.md`     | Current value, competing observations, merge policy, source boundary.                                 |
| `/export-backup/` | `docs/topics/trust/export-backup.md`      | Current-field export versus recovery backup and verification.                                         |

Existing topic collections, 14 connection guides, shared install chooser, and viewer source-to-route behavior remain in place. The three long source contracts above remain in the repository and are linked as details rather than rendered in full. Relative links to non-viewer repository files are checked against the build's reference path set; links to included Markdown become local viewer routes.

## Earlier hardcoded site pages

These files are not a second source for the viewer routes. The route retirement map and viewer manifest determine the public path. This pass reviewed the following older page bodies and assigned a disposition instead of importing claims from them:

| Earlier body                                                                 | Disposition                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/site/pages/en/cli.mdx`                                                 | Do not revive: its broad parity claim and example commands need individual version checks. Use the focused CLI reader and canonical command reference.                                |
| `docs/site/pages/en/api.mdx`                                                 | Do not revive: its generated endpoint table is a contract index, not a task guide. Use the REST reader, canonical HTTP reference, and OpenAPI.                                        |
| `docs/site/pages/en/mcp.mdx`                                                 | Retain as historical MDX source only; the current MCP topic and host-specific connection guides describe the selected paths and verification.                                         |
| `docs/site/pages/en/schema-management.mdx`                                   | Do not revive: it makes broad schema-inference and validation claims that need a separate current-code audit. Keep schema explanations in the focused topic and technical references. |
| `docs/site/pages/en/troubleshooting.mdx`                                     | Do not revive as a blanket recipe: its reset, ingestion, and transport advice needs per-version verification. Existing reader guides cover specific checks.                           |
| `docs/site/pages/en/memory-guarantees.mdx`, `docs/site/pages/en/schemas.mdx` | Hybrid component shells; do not duplicate their code-authored bodies in reader Markdown without a separate migration decision.                                                        |
| `docs/site/pages/en/privacy.mdx`, `docs/site/pages/en/terms.mdx`             | Legal site content; keep under its legal review and source synchronization process, outside the docs viewer.                                                                          |

Other development, operations, release-history, and foundation documents are repository references. This closeout changes the finite public reader set, not the semantic status of every file under `docs/`.

## Release and verification boundary

The published release and current source differ on some correction and ingestion behavior. Reader pages mention these differences explicitly where they affect a workflow and direct the reader to the running instance's contract. A site build, lint, and export validation establish route and link behavior locally; they do not prove that the draft has been pushed, reviewed, deployed, or served from the production URL. Keep those states separate in release notes and handoff reports.
