---
name: draft-illustration
description: Apply consistent visual style for blog post hero and social images across repos. Use when creating or generating hero images, OG images, or post artwork so all assets share the same look.
triggers:
  - draft illustration
  - blog post image
  - hero image
  - post visual style
  - hero style
  - OG image
  - create post image
  - same visual style
  - draft-illustration
  - /draft-illustration
---

# Blog Post Visual Style (Cross-Repo)

Use this skill whenever you create or generate **hero images**, **OG/social preview images**, or any **post artwork** so that assets have the same visual style across repositories. The style is mandatory for blog/post imagery; repo-specific paths and scripts are documented per project.

## Visual style (mandatory)

All hero and post imagery MUST follow this style. Apply it when prompting image generation (e.g. GenerateImage, DALL-E, Midjourney) or when briefing a designer.

### Style profile: Engraved noir line-art

The target look is not flat iconography. It is high-contrast engraved editorial illustration.

**Visual rules:**

| Rule | Requirement |
|------|--------------|
| **Background** | Default: solid black. Alternative: fully transparent (PNG alpha). Choose based on placement context — use transparent for in-page cards or overlays on themed backgrounds; use black for standalone hero/OG images. No gradients, no white backgrounds, no mixed backgrounds. |
| **Foreground** | White line-art exclusively. No color fills and no colored accents. |
| **Line work** | Variable line weight. Dense contouring, cross-hatching, and/or stippling are expected. |
| **Texture** | Rich micro-detail is required (etching/scratchboard feel), not clean flat vector outlines. |
| **Color** | Monochromatic black and white only. No gray color fields, no other colors. |
| **Composition** | Centered or lower-third compositions are both valid; subject should occupy meaningful frame area. |
| **Aesthetic** | Engraved, dramatic, editorial, iconic. Avoid minimalist app-icon look. |
| **Typography** | None. No text, labels, or captions within the image. |

**Focal brand:** When the post is about a specific product or brand (e.g. Notion, Claude, OpenAI), focus the hero on that brand using recognizable shapes or motifs in the same engraved white line-art style. No logos or wordmarks; the image should read as "this post is about X" at a glance.

## Prompt template for image generation

When generating a new hero or post image, use a prompt that enforces the style. Example structure:

**Black background (default — hero/OG images):**

```
[Subject or theme]. Pure black background. White line-art only. Engraving/scratchboard style with dense contour lines, cross-hatching, and stippling. High-detail editorial illustration, dramatic contrast, variable line weight. No color, no text, no labels.
```

**Transparent background (in-page cards, overlays):**

```
[Subject or theme]. Transparent PNG background (no background color, no black, no white — fully transparent). White and dark gray line-art only. Engraving/scratchboard style with dense contour lines, cross-hatching, and stippling. High-detail editorial illustration, dramatic contrast, variable line weight. No color fills, no text, no labels. No flat vector icon style.
```

Replace `[Subject or theme]` with the post topic (e.g. "Agent memory and a source of truth", "Claude Memory tool as a lockbox and key", "Bitcoin wallet and MCP").

### Negative constraints (always include)

Add these constraints to image prompts to avoid model drift:

- no flat vector icon style
- no minimalist logo-like symbols
- no smooth gradient shading
- no cartoon/comic color treatment
- no text or labels
- no gray background (unless transparent variant, which uses no background at all)

## Asset variants (when a repo supports them)

Some repos (e.g. markmhendrickson website) expect multiple composed assets from the same style. Create **separate compositions** for each aspect ratio; do not just crop one image.

| Asset | Aspect | Typical use |
|-------|--------|-------------|
| Hero | Flexible (keep-proportions) | Full-width on post page |
| Square thumbnail | 1:1 | Listings, cards, prev/next |
| OG / social | 1200×630 landscape | Twitter, LinkedIn, etc. |

All three must share the same visual style (black background, white line-art, no typography). Prefer a script or export step to generate OG from a composed 1200×630 source when the repo provides one.

## Repo-specific paths and scripts

Each repository may define where to store assets and which scripts to run. Check that repo's docs (e.g. `README.md`, `content/posts/README.md`, or foundation adapter config) for:

- **Image directory** — e.g. `public/images/posts/`, `static/images/posts/`
- **Naming** — e.g. `{slug}-hero.png`, `{slug}-hero-square.png`, `{slug}-hero-og.png`, `og/{slug}-1200x630.jpg`
- **Layout hint** — e.g. `{slug}-hero-style.txt` with `keep-proportions` for uncropped display
- **Scripts** — e.g. `generate-hero-square-from-hero.mjs`, `npm run generate:og:post -- <slug>`, `regenerate-hero-assets-centered.mjs`
- **Cache** — e.g. `python3 execution/scripts/generate_posts_cache.py` after adding or changing assets

If the repo has no docs, apply only the **Visual style (mandatory)** and use sensible paths (e.g. `images/posts/`, slug-based filenames).

## Checklist when creating post images

1. **Generate or obtain** the hero (and optional square/OG) using the mandatory visual style and prompt template above.
2. **Save** assets in the repo's configured directory with the repo's naming convention.
3. **Add layout hint** when the repo uses it (e.g. `keep-proportions` in `-hero-style.txt`).
4. **Run repo scripts** for derived assets (square crop, OG export) and cache regeneration when documented.
5. **Do not** add text, logos, or colors that break the black-background / white-line-art rule.
6. **Quality gate:** confirm the output reads as engraved illustration (not flat icon) and shows at least two texture signals (e.g. contour layering + hatching, or hatching + stippling).

## Reference

Canonical style reference: **Hero Image Style Guide** in the markmhendrickson website posts README (`execution/website/markmhendrickson/react-app/src/content/posts/README.md`). This skill is the foundation-level summary so the same style can be applied in any repo without reading that file.

Additional visual anchors used for matching in this repo:

- `assets/image-f0a6cff2-b229-47a1-a4ea-001a7a0387d9.png` (brain dissolution, etched texture)
- `assets/image-2dfa6693-10ee-47d4-baf7-c0dc16ef8208.png` (rats blueprint scene, engraved line density)
