---
title: SEO and Analytics Verification Runbook
summary: Quick checklist for verifying SEO metadata and Umami instrumentation after deployment.
---

# SEO and Analytics Verification Runbook

Quick checklist for verifying SEO metadata and Umami instrumentation after deployment.

## Pre-Deploy (CI / Local)

1. **Unit tests pass:** `npx vitest run tests/unit/seo_metadata.test.ts` — validates every indexable route has metadata, sitemap completeness, and structured data.
2. **Build outputs:** `npm run build:site:pages` then verify:
   - `site_pages/sitemap.xml` contains all expected `<loc>` entries (30+ routes).
   - `site_pages/robots.txt` allows all and references the sitemap URL.
   - `site_pages/index.html` has OG/Twitter meta tags in the `<head>`.
   - Each route has a pre-rendered `site_pages/{slug}/index.html` with route-specific meta tags (title, description, canonical, OG, Twitter, JSON-LD).
   - `site_pages/404.html` exists as SPA fallback for GitHub Pages.
   - Subpage asset paths use `../assets/` (relative, one level up).
3. **Playwright E2E:** `npm run test:e2e` — includes SEO meta tag presence checks for homepage and key subpages.

## Post-Deploy

### SEO

1. **Google Search Console:** Submit updated sitemap at `https://neotoma.io/sitemap.xml`. Confirm all URLs are indexed or pending.
2. **Rich Results Test:** Paste `https://neotoma.io/` into [Rich Results Test](https://search.google.com/test/rich-results) — verify WebSite structured data and BreadcrumbList on subpages.
3. **Open Graph debugger:** Test social card rendering:
   - Facebook: [Sharing Debugger](https://developers.facebook.com/tools/debug/)
   - Twitter/X: [Card Validator](https://cards-dev.twitter.com/validator)
4. **Canonical consistency:** Spot-check 3-4 subpages — View Source should show `<link rel="canonical" href="https://neotoma.io/...">` matching the current URL.

### Analytics

1. **Umami:** Set env vars only (no in-app defaults). For **`vite build` / deployed sites:** `VITE_UMAMI_URL` and `VITE_UMAMI_WEBSITE_ID`. For **local `vite` dev:** `VITE_UMAMI_WEBSITE_ID_DEV` plus `VITE_UMAMI_URL` (shared) or `VITE_UMAMI_URL_DEV`. Use `neotoma site configure` or edit `.env` / `.env.development.local`, rebuild, then in Umami confirm:
   - Page views update on each SPA route (same paths as the in-app router).
   - Custom events: `cta_click`, `outbound_click`, `docs_nav_click`, `product_nav_click`, and funnel events include the expected custom properties.
2. **Self-hosted Umami:** See `deploy/umami/docker-compose.yml` for Postgres + Umami. After first login, add a website for your production origin, copy the website ID into `VITE_UMAMI_WEBSITE_ID`, and set `VITE_UMAMI_URL` to the public URL of the Umami app.
3. **Dev vs prod:** Two Umami websites in the dashboard; wire them with `VITE_UMAMI_WEBSITE_ID_DEV` (dev) vs `VITE_UMAMI_WEBSITE_ID` (prod). GitHub Actions: set secrets `VITE_UMAMI_URL` and `VITE_UMAMI_WEBSITE_ID` for the main Pages build; for the dev Pages workflow the build still receives `VITE_UMAMI_WEBSITE_ID` but map your **dev** site UUID from a secret such as `VITE_UMAMI_WEBSITE_ID_DEV` (see workflow). See `.env.development.example` and `.env.production.example`.

## Route Registry Maintenance

When adding a new public route:

1. Add an entry to `ROUTE_METADATA` in `frontend/src/site/seo_metadata.ts` with title, description, robots, and breadcrumb.
2. The sitemap, JSON-LD, and static pre-rendered HTML are all generated automatically from the registry at build time.
3. Run `npx vitest run tests/unit/seo_metadata.test.ts` and add the route to the `INDEXABLE_ROUTES` array in the test to keep coverage consistent.
4. Run `npm run build:site:pages` and verify `site_pages/{slug}/index.html` exists with the correct meta tags.

## Files

| File | Purpose |
|------|---------|
| `frontend/src/site/seo_metadata.ts` | Route metadata registry, sitemap/robots builders |
| `frontend/src/components/SeoHead.tsx` | Helmet-based per-route `<head>` tags |
| `frontend/src/components/DetailPage.tsx` | Wrapper that derives route path for SeoHead |
| `frontend/src/utils/analytics.ts` | Umami init, pageviews, and typed event helpers |
| `deploy/umami/docker-compose.yml` | Optional self-hosted Umami + PostgreSQL |
| `scripts/build_github_pages_site.tsx` | Build script that generates per-route HTML, sitemap.xml, robots.txt, and 404.html |
| `tests/unit/seo_metadata.test.ts` | Unit tests for SEO completeness |
| `playwright/tests/site-page.spec.ts` | E2E tests including meta tag verification |
