# Spacing and Layout

## Spacing Scale

```yaml
spacing:
  xs: "0.25rem" # 4px
  sm: "0.5rem" # 8px
  md: "1rem" # 16px
  lg: "1.5rem" # 24px
  xl: "2rem" # 32px
  "2xl": "3rem" # 48px
  "3xl": "4rem" # 64px
```

**Usage:**

- **xs:** Tight spacing (icon + text, inline elements)
- **sm:** Component internal padding, small gaps
- **md:** Standard spacing (between sections, component padding)
- **lg:** Section spacing, card padding
- **xl:** Major section separation
- **2xl/3xl:** Page-level spacing

## Layout Density

**Default: Comfortable**

```yaml
comfortable:
  row_height: "40px" # Table rows, list items
  component_padding: "8px 12px" # Buttons, inputs
  section_spacing: "1.5rem" # Between sections
  card_padding: "1rem" # Card internal padding
```

**Compact (Optional):**

```yaml
compact:
  row_height: "32px"
  component_padding: "6px 10px"
  section_spacing: "1rem"
  card_padding: "0.75rem"
```

**Rationale:** Comfortable density matches professional tools (Zotero, legal platforms); allows information density without feeling cramped.

## Grid System

```yaml
grid:
  columns: 12
  gutter: "1rem" # 16px between columns
  container_max_width: "1280px" # Max content width
  breakpoints:
    mobile: "640px"
    tablet: "768px"
    desktop: "1024px"
    wide: "1280px"
```

## Related Documents

- [`../design_system.md`](../design_system.md) - Design system index
- [`responsive_design.md`](./responsive_design.md) - Responsive breakpoints and mobile considerations
- [`component_styles.md`](./component_styles.md) - Component spacing usage
