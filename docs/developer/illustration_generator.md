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

## Notes

- This script writes a metadata JSON file per run with prompt/model/size info.
- The script is provider-extensible; OpenAI is the first implementation.
