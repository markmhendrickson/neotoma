# Neotoma Color Palette

## Scope
Defines the canonical Neotoma color palette for marketing pages and product UI. Covers brand hues, semantic colors, and token mapping. Does not define spacing, typography, or component-specific overrides.

## Purpose
Set one palette for brand consistency across the site and app. Keep current visual direction centered on violet and emerald.

## Palette

### Brand Colors
- Brand violet: `#7C3AED`
- Brand violet hover: `#6D28D9`
- Brand violet subtle: `#EDE9FE`
- Brand emerald: `#10B981`
- Brand emerald hover: `#059669`
- Brand emerald subtle: `#D1FAE5`

### Neutral Colors (Light)
- Canvas: `#FCFCFF`
- Surface: `#F4F2FF`
- Surface elevated: `#EDE9FE`
- Text primary: `#1F1A33`
- Text secondary: `#4C4566`
- Text tertiary: `#7B7399`
- Border: `#DDD6FE`

### Neutral Colors (Dark)
- Canvas: `#0F0B1A`
- Surface: `#1A1230`
- Surface elevated: `#2A1E4A`
- Text primary: `#F4F1FF`
- Text secondary: `#C9BEF3`
- Text tertiary: `#9E8FD3`
- Border: `#3A2A63`

### Semantic Colors
- Success: `#10B981` (dark: `#34D399`)
- Warning: `#D97706` (dark: `#FBBF24`)
- Error: `#DC2626` (dark: `#F87171`)
- Info: `#6366F1` (dark: `#A78BFA`)

## Token Mapping
Use this mapping for CSS variable updates in `frontend/src/index.css`.

- `--primary`: brand violet
- `--primary-foreground`: white in light and dark
- `--accent`: brand violet subtle
- `--accent-foreground`: text primary
- `--success`: brand emerald hover in light, emerald 400 in dark
- `--background`: canvas
- `--card`: surface
- `--muted`: surface elevated
- `--foreground`: text primary
- `--muted-foreground`: text secondary
- `--border`: border
- `--ring`: brand violet

## Entity Palette
- Person: `#6366F1`
- Company: `#8B5CF6`
- Location: `#14B8A6`
- Event: `#F59E0B`
- Document: `#10B981`

## Usage Rules
- Use violet for primary actions, active states, and focus treatments
- Use emerald for success, healthy status, and positive confirmations
- Keep gradients within violet-indigo-emerald range for brand surfaces
- Maintain WCAG AA contrast for text and interactive elements
