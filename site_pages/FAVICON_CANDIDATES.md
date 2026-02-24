# Favicon candidates

Five favicon concepts for the Neotoma site, inspired by:

- **Logo assets:** `docs/private/logo_draft_materials/neotoma.svg` (flowing black ribbons), draft concept SVGs
- **Existing app favicon:** Blue rounded square with "N" in `public/index.html`
- **Site section divider:** Diamond (◆) in `#333`
- **Design system:** `docs/ui/design_system/color_palette.md` (primary `#0066CC`, foreground `#111827`)

| File | Concept | Use when |
|------|--------|----------|
| `favicon-1-diamond.svg` | Diamond (◆), `#333` | Matches current site divider; minimal, neutral. |
| `favicon-2-n-box.svg` | "N" in rounded blue square | Strong brand "N", aligns with app favicon style. |
| `favicon-3-waves.svg` | Two horizontal wave lines | Echoes logo ribbon flow; abstract. |
| `favicon-4-n-minimal.svg` | Bold "N" only, no shape | Typographic mark; works on light backgrounds. |
| `favicon-5-bars.svg` | Three stacked rounded bars | Suggests "layers" / truth layer; simple. |

**Current default:** The build script writes `favicon.svg` (same as `favicon-1-diamond.svg`). To switch:

1. Copy the chosen candidate over `favicon.svg`, e.g.  
   `cp favicon-2-n-box.svg favicon.svg`
2. Or change `FAVICON_SVG` in `scripts/build_github_pages_site.tsx` to the contents of the chosen candidate and re-run the build.
