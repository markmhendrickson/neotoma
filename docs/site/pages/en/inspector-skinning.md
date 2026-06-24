---
path: /inspector-skinning
locale: en
page_title: Inspector skinning
shell: detail
translation_status: canonical
nav_group: reference
nav_order: 20
---

The Neotoma Inspector ships with a default palette, but operators and embedders can replace the colour palette and brand text (sidebar title, document title, home-link aria-label) at server start via JSON config files — no fork or rebuild required.

## Environment variables and precedence

Two environment variables drive skin resolution. When both are set, `NEOTOMA_INSPECTOR_SKIN_CONFIG` wins:

1. **`NEOTOMA_INSPECTOR_SKIN_CONFIG=/abs/path/to/custom.json`** — load an arbitrary skin JSON from disk. Useful for one-off embedder customisations without creating a named preset. The path must be absolute.
2. **`NEOTOMA_INSPECTOR_SKIN=<name>`** — load a bundled preset from `dist/inspector/skins/<name>.json` (built from `inspector/public/skins/` at compile time). Use this for named, versioned presets shipped with the package.

When neither variable is set, or the configured file is missing or invalid, the Inspector renders the default Neotoma palette unchanged. Invalid skin files do not crash the server — the sanitizer silently falls back to no skin.

## Bundled presets

The repository ships one bundled preset:

- **`sample`** — a deliberately garish magenta/cyan palette intended to verify that skinning took effect. Not for production use.

To add a preset, drop a valid skin JSON file under `inspector/public/skins/<name>.json` in the Neotoma source tree. The build pipeline copies it to `dist/inspector/skins/<name>.json`. After that, `NEOTOMA_INSPECTOR_SKIN=<name>` resolves it at runtime.

## Skin JSON shape

```jsonc
{
  "name": "my-brand",            // required: stable slug, used for data-inspector-skin attribute
  "label": "My Brand Skin",      // optional: human-readable label

  "brand": {
    "sidebar_title": "My Brand",        // replaces the sidebar wordmark
    "header_title": "My Brand — Data",  // sets document.title on first paint
    "home_aria_label": "My Brand home"  // replaces the home-link aria-label
  },

  "light": {                     // CSS variable overrides for light mode
    "background": "220 30% 98%",
    "foreground": "220 20% 10%",
    "primary":    "210 90% 45%",
    "sidebar":    "210 60% 92%"
    // ... see full token list below
  },

  "dark": {                      // optional: dark-mode overrides; missing tokens inherit defaults
    "background": "220 25% 8%",
    "foreground": "220 100% 95%"
  }
}
```

All four top-level keys are optional except `name`. Omitted palette tokens inherit the Inspector's default values. Brand fields that are missing or empty are ignored.

## Colour token reference

Each palette token maps to a CSS custom property (e.g. `primary` → `--primary`). The `light` and `dark` objects accept the same set of tokens:

- `background` — page and panel background
- `foreground` — default text colour
- `card` — card surface
- `card-foreground` — text on cards
- `popover` — popover/dropdown surface
- `popover-foreground` — text in popovers
- `primary` — primary action colour (buttons, links)
- `primary-foreground` — text on primary surfaces
- `secondary` — secondary action colour
- `secondary-foreground` — text on secondary surfaces
- `muted` — muted/subtle surface
- `muted-foreground` — muted text
- `accent` — accent highlight colour
- `accent-foreground` — text on accent surfaces
- `destructive` — destructive/danger colour
- `destructive-foreground` — text on destructive surfaces
- `border` — default border colour
- `input` — input field border
- `ring` — focus ring colour
- `sidebar` — sidebar background
- `sidebar-foreground` — sidebar text
- `sidebar-accent` — sidebar accent/hover
- `sidebar-accent-foreground` — text on sidebar accent
- `sidebar-border` — sidebar border

## Sanitization constraints

The frontend sanitizer in `inspector/src/lib/inspector_skin.ts` validates every token value before applying it. A value is accepted only when it matches the shadcn/Tailwind HSL triplet format:

```
"<hue> <saturation>% <lightness>%"
```

Optionally followed by a slash and an alpha component:

```
"210 90% 45% / 0.8"
```

**Allowed examples:**

- `"220 30% 98%"` — hue, saturation%, lightness%
- `"0 0% 100%"` — white
- `"210 90% 45% / 0.5"` — with alpha

**Rejected examples:**

- `"#3b82f6"` — hex colour (not HSL triplet)
- `"rgb(59, 130, 246)"` — rgb() notation
- `"hsl(210, 90%, 45%)"` — hsl() function syntax (the CSS variable system wraps values, so function syntax is not needed)
- Any value containing colons, semicolons, curly braces, or other CSS punctuation that could escape the `var()` context

Brand string fields (`sidebar_title`, `header_title`, `home_aria_label`) are truncated to 80 characters. Whitespace is trimmed. Empty strings after trimming are ignored.

Unknown token keys in `light` / `dark` are silently skipped. A skin that fails `name` validation (missing, empty, non-string) is rejected entirely and the Inspector falls back to its default palette.

## Runtime injection

The server-side loader reads the configured skin file at startup, sanitizes it, and injects it into the SPA HTML shell as:

```html
<script>window.__NEOTOMA_INSPECTOR_SKIN__ = { "name": "…", … };</script>
```

`initialize_inspector_skin_on_load()` in `inspector/src/lib/inspector_skin.ts` runs before the React tree mounts, writing a `<style id="neotoma-inspector-skin">` tag with the validated CSS variables and setting `data-inspector-skin="<name>"` on `<html>`. This ensures the first paint matches the configured palette — no flash of the default theme.

## Local smoke commands

Apply a bundled preset and start the dev server:

```bash
NEOTOMA_INSPECTOR_SKIN=sample npm run dev
```

Apply a custom JSON file from disk:

```bash
NEOTOMA_INSPECTOR_SKIN_CONFIG=/abs/path/to/custom.json npm run dev
```

Verify the skin took effect by opening the Inspector in a browser and checking:

1. The `<html>` element has a `data-inspector-skin="<name>"` attribute.
2. The `<head>` contains a `<style id="neotoma-inspector-skin">` tag with your token overrides.
3. The sidebar wordmark and document title match the `brand` fields you configured (if set).

A quick one-liner using the bundled `sample` preset:

```bash
NEOTOMA_INSPECTOR_SKIN=sample npm run dev &
# Open http://localhost:5175/ — should render a magenta/cyan palette.
# Confirm: document.querySelector('html').dataset.inspectorSkin === 'sample'
```

See the [changelog](/changelog) for v0.16.0 release notes covering Inspector skinning (PR #1585), and the [Inspector reference](/inspector) for the full Inspector operator guide.
