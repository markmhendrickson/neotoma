---
name: draft_illustration
description: Blog Post Visual Style (Cross-Repo)
---

<!-- Source: .cursor/skills/draft-illustration/SKILL.md -->


# Blog Post Visual Style (Cross-Repo)

Use this skill whenever you create or generate **hero images**, **OG/social preview images**, or any **post artwork** so that assets have the same visual style across repositories. The style is mandatory for blog/post imagery; repo-specific paths and scripts are documented per project.

## Visual style (mandatory)

All hero and post imagery MUST follow this style. Apply it when prompting image generation (e.g. GenerateImage, DALL·E, Midjourney) or when briefing a designer.

**Visual rules:**

| Rule | Requirement |
|------|--------------|
| **Background** | Solid black only. No gradients, no white sections, no mixed backgrounds. |
| **Foreground** | White line-art. Subtle edge shading for dimensionality is encouraged; large filled areas and color gradients are not. |
| **Line work** | Polished, refined white outlines with consistent stroke weight. Lines should feel engraved or blueprint-quality — smooth curves, clean joints, slight dimensional depth on edges. Not sketchy or rough. |
| **Color** | Monochromatic black and white only. No gray tones or other colors outside of subtle edge shading for depth. |
| **Composition** | Scene-based or centered. Objects may sit on surfaces with perspective (e.g. an angled desk, a platform). Generous negative (black) space around the subject. |
| **Aesthetic** | Polished, dimensional, iconic. Technical engraving or refined blueprint feel. Not flat/clip-art, not photorealistic. Symbolic objects should feel like they have weight and presence. |
| **Typography** | None. No text, labels, or captions within the image. |

**Focal brand:** When the post is about a specific product or brand (e.g. Notion, Claude, OpenAI), focus the hero on that brand using recognizable shapes or motifs in the same white line-art style. No logos or wordmarks; the image should read as "this post is about X" at a glance.

## Prompt template for image generation

When generating a new hero or post image, use a prompt that enforces the style. Example structure:

```
[Subject or theme]. Pure black background. White line-art with polished, refined outlines and subtle edge shading for dimensionality. Engraving or blueprint quality — smooth curves, clean joints, slight depth on edges. Objects may sit on a surface with perspective. Iconic, symbolic, not photorealistic. No text or labels. Generous negative (black) space around the subject.
```

Replace `[Subject or theme]` with the post topic (e.g. "Agent memory and a source of truth", "Three robot faces in wax-seal stamps on a desk", "Calendar grid connected to a mesh network").

**Style references:** `know-which-of-your-agents-wrote-what-hero.png` (wax seals with dimensional depth on angled desk), `the-argument-cagan-already-won-hero.png` (geometric Atlas figure with polished wireframe).

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

## Reference

Canonical style reference: **Hero Image Style Guide** in the markmhendrickson website posts README (`execution/website/markmhendrickson/react-app/src/content/posts/README.md`). This skill is the foundation-level summary so the same style can be applied in any repo without reading that file.
