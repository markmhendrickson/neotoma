# Pricing tiers landing page on neotoma.io

**Branch:** `claude/add-pricing-tiers-DSJI0`
**Status:** Draft
**Date:** 2026-05-21

## Goals

- Surface the four-tier model (Sandbox / Self-Hosted / Hosted / Managed) at a single `/pricing` URL on neotoma.io.
- Use the page as a funnel that captures intent for tiers that are not fully shipped (Hosted, Managed).
- Make analytics segmentation by tier possible later without code edits via tier-tagged CTAs.

## Problems

- No single page on the site frames Neotoma as a tiered product. Visitors landing on `/` cannot tell what they get for free vs. what is commercial vs. what requires conversation.
- Hosted demand is currently invisible. There is no place to express "I want this when it's ready," so no signal to prioritize the work.
- Managed/enterprise leads have no obvious entry point. They currently route through the same install/sandbox funnel as solo developers.

## Solutions

A new `/pricing` page with four tier cards in a responsive grid. Each card shows: tier name, one-line description, status badge, 3–5 feature bullets, and a primary CTA. Descriptions only — no numeric prices.

### Tiers and CTAs

| Tier | Status | Primary CTA | Destination |
|---|---|---|---|
| Sandbox | Available | Try the sandbox | `/sandbox` |
| Self-Hosted | Available | Install | `/install` |
| Hosted | Early access | Join waitlist | TBD (see open questions) |
| Managed | Contact | Talk to Mark | TBD (see open questions) |

Each CTA carries `data-tier="<tier-id>"` so a future analytics provider can segment clicks by tier without editing the page.

Sidebar nav: rename the existing "Hosted" category to **"Pricing"**, with `/pricing` as the first item and `/hosted` and `/sandbox` nested underneath.

## Key problems solved

- Visitors can now understand the tier structure at a glance and self-select the right path.
- Hosted demand becomes measurable via CTA clicks and waitlist sign-ups before the tier ships.
- Managed/enterprise leads have a dedicated entry point separate from the self-serve funnel.

## Key solutions implemented

- `PricingPage.tsx` — four-card grid using existing shadcn Card and Button primitives, visual language matches `SandboxLandingPage.tsx` and `HostedLandingPage.tsx`.
- Route `/pricing` registered in `MainApp.tsx`.
- Sidebar nav renamed and `/pricing` added as first item in category.
- SEO metadata added for `/pricing`.
- `data-tier` attributes on all CTAs for future analytics without code changes.

## Files to touch

| File | Change |
|---|---|
| `frontend/src/components/subpages/PricingPage.tsx` | New. Four-tier grid component. |
| `frontend/src/components/MainApp.tsx` | Register `{ path: "/pricing", element: <PricingPage /> }`. |
| `frontend/src/site/site_data.ts` | Rename `DOC_NAV_CATEGORIES` entry `title: "Hosted"` → `"Pricing"`. Prepend `{ label: "Pricing", href: "/pricing", icon: "Tag" }` to its `items` array. |
| `frontend/src/site/site_data_localized.ts` | Add `"/pricing": dn.pricing` mapping (English-first, others fall through). |
| `frontend/src/site/seo_metadata.ts` | Add `/pricing` entry: title "Neotoma pricing — Sandbox, Self-Hosted, Hosted, Managed". |
| `frontend/src/site/mdx_site_registry.test.ts` | Add `/pricing` to expected-paths assertion if registry tests guard it. |

## Open questions

1. **Where do "Join waitlist" and "Talk to Mark" CTAs route?** Default proposal: `/meet` (existing scheduling page). Alternatives: `mailto:markmhendrickson@gmail.com` with tier-tagged subject line, or a new `/waitlist` page with a form backend (Tally/Formspree/Netlify).
2. **Nav icon for Pricing entry.** Options: `Tag`, `Layers`, `BadgeDollarSign`. Default: `Tag`.
3. **Tier-card feature bullets.** Need 3–5 bullets per tier. Sandbox and Self-Hosted can pull from existing `/sandbox` and `/hosted` copy. Managed is most speculative — needs drafting.

## Automated tests

- Extend `frontend/src/site/mdx_site_registry.test.ts` to assert `/pricing` is registered.
- Add `/pricing` to any `MainApp.tsx` route-coverage test if one exists.
- No new unit tests for the page itself (static JSX).

## QA needs

- Manual: visit `/pricing` on desktop and mobile widths. Confirm four cards render, status badges are visible, all CTAs navigate correctly.
- Manual: sidebar shows "Pricing" section with `/pricing` first, `/hosted` and `/sandbox` underneath. No orphan "Hosted" category remains.
- Manual: deep-link `/pricing` directly (not via SPA navigation). Confirm static page generates and SEO title is correct.
- Manual: `/hosted` and `/sandbox` still render and remain linkable (regression check).
- Automated: `npm run type-check` and `npm run lint` pass clean.

## Documentation update needs

- `README.md` — no change needed.
- `site_pages/` — these are generated artifacts. The static-export step must produce `site_pages/pricing/index.html` before merge. Confirm the build script covers new routes.
- No foundation or architecture doc impact.

## Out of scope

- Picking an analytics provider (Plausible/PostHog/Umami) and wiring the snippet.
- Building a real waitlist form backend.
- Localized translations beyond English.
- Numeric pricing of any kind.
