# Generic Illustration Generator

This project includes a reusable illustration generation CLI:

`npm run illustrations:generate -- [options]`

It is preset-driven and currently wired to OpenAI Images (`gpt-image-1`).

## Quick Start

1. Put `OPENAI_API_KEY=sk-...` in repo-root `.env` (optional override: `.env.local`). The script loads these files automatically.
2. Run:

```bash
npm run illustrations:generate -- --preset beige_hero --concept "abstract packrat nest"
```

For a **stricter, more editorial** look when output feels generic, use preset `beige_hero_editorial`.

Generated files are written to the preset output directory (for `beige_hero`, `frontend/src/assets/images/hero`).

## Presets

Presets live in:

`scripts/config/illustration_presets.json`

Each preset can define:

- `id`
- `prompt`
- `output_dir`
- `model`
- `size`
- `quality`
- `background`
- `output_format`
- `count`

## Examples

Generate from preset:

```bash
npm run illustrations:generate -- --preset beige_hero
```

Generate from direct prompt:

```bash
npm run illustrations:generate -- --prompt "Transparent background. Minimal beige line-art. Abstract memory layer." --count 4 --out-dir frontend/src/assets/images/hero
```

Dry run (no API call, no files written):

```bash
npm run illustrations:generate -- --preset beige_hero --concept "records merge" --dry-run
```

## Design guidelines

### Visual language

All illustrations share a single visual language derived from the packrat hero (`hero_illus_packrat_holding_record.png`):

- **Palette**: warm beige and tan only — cream `#f4ebe0`, sand `#d9cbb8`, taupe `#a0907a`, deep tan `#6e6254`. No pure black, no other hues, no gradients.
- **Line work**: two stroke weights — hairline for interior structure/detail, slightly heavier for silhouette and emphasis. Clean joins, no sketchy texture, no drop shadows.
- **Composition**: generous negative space (roughly half the frame empty for hero images), one focal subject, subtle asymmetry.
- **Background**: transparent unless a preset specifies opaque (e.g. `hero_matched_opaque`).
- **Forbidden**: photorealism, clipart, emoji style, thick uniform cartoon strokes, text, logos, isometric 3D, tech clichés (clouds, brains, chips).

### Preset selection guide

| Use case | Preset |
|---|---|
| Hero / key visual, abstract diagram | `beige_hero_editorial` |
| Hero overlay, abstract motif | `beige_hero` |
| Guarantee / feature card, conceptual | `beige_guarantee_concept` |
| Guarantee / feature card, diagram | `guarantee_sym_square_flat` |
| Section images (opaque amber bg) | `hero_matched_opaque` |
| Who-this-is-for cards | `who_icp_square_flat` |
| Animal mascot / agent avatar / bot icon | `mascot` |

### Mascot style

Agent avatars and bot icons use the `mascot` preset, which matches the packrat hero's editorial style: recognizable animal silhouette, warm beige palette, two stroke weights, transparent background, subject at 50–65% of canvas. A small natural prop (twig, branch) is encouraged. See `frontend/src/assets/images/mascots/` for generated examples.

The `castor-agent` GitHub bot uses `beige_guarantee_concept_20260515-081858_01.png` (beaver holding a twig) as its avatar.

## Notes

- This script writes a metadata JSON file per run with prompt/model/size info.
- The script is provider-extensible; OpenAI is the first implementation.
