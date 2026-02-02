# Color Palette

## Base Colors

**Light Mode:**

```yaml
background:
  primary: "#FFFFFF" # Pure white for main canvas
  secondary: "#F9FAFB" # Subtle gray for cards/sections
  tertiary: "#F3F4F6" # Hover states, subtle backgrounds
foreground:
  primary: "#111827" # Near-black for primary text (high contrast)
  secondary: "#6B7280" # Medium gray for secondary text
  tertiary: "#9CA3AF" # Light gray for tertiary text, placeholders
  muted: "#D1D5DB" # Borders, dividers
```

**Dark Mode:**

```yaml
background:
  primary: "#0F172A" # Deep slate (similar to Cursor/GitHub dark) for main canvas
  secondary: "#1E293B" # Slightly lighter for cards/sections
  tertiary: "#334155" # Hover states, subtle backgrounds
foreground:
  primary: "#F1F5F9" # Near-white for primary text
  secondary: "#94A3B8" # Medium gray for secondary text
  tertiary: "#64748B" # Light gray for tertiary text
  muted: "#475569" # Borders, dividers
```

## Semantic Colors

**Primary (Trust/Action):**

```yaml
light:
  primary: "#0066CC" # Professional blue (matches existing)
  primary_hover: "#0052A3"
  primary_foreground: "#FFFFFF"
dark:
  primary: "#3B82F6" # Brighter blue for dark mode visibility
  primary_hover: "#2563EB"
  primary_foreground: "#FFFFFF"
```

**Status Colors:**

```yaml
success: "#10B981" # Green (matches existing)
error: "#EF4444" # Red (matches existing)
warning: "#F59E0B" # Amber (matches existing)
info: "#3B82F6" # Blue (matches primary)
```

**Status Colors (Dark Mode):**

```yaml
success: "#22C55E" # Brighter green for dark mode
error: "#F87171" # Softer red for dark mode
warning: "#FBBF24" # Brighter amber
info: "#60A5FA" # Lighter blue
```

## Data Visualization Colors

**Entity Type Colors (Subtle, Distinguishable):**

```yaml
person: "#6366F1" # Indigo
company: "#8B5CF6" # Purple
location: "#EC4899" # Pink
event: "#F59E0B" # Amber
document: "#10B981" # Green
```

**Use sparingly:** Only for entity badges, timeline markers, graph nodes. Never for primary UI elements.

## Border and Divider Colors

```yaml
light:
  border: "#E5E7EB" # Subtle gray borders
  divider: "#D1D5DB" # Slightly darker for dividers
dark:
  border: "#334155" # Subtle slate borders
  divider: "#475569" # Slightly lighter for dividers
```

## Related Documents

- [`../design_system.md`](../design_system.md) - Design system index
- [`dark_mode.md`](./dark_mode.md) - Dark mode color adjustments
- [`data_visualization.md`](./data_visualization.md) - Data visualization color usage
