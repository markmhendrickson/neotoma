# Dark Mode

## Dark Mode Strategy

**Default:** System preference (respects `prefers-color-scheme`)

**Manual Toggle:** User can override system preference

**Rationale:** Tier 1 ICPs (especially developers, AI-native users) strongly prefer dark mode.

## Dark Mode Adjustments

**Color Adjustments:**

- Brighter foreground colors for readability
- Softer backgrounds (not pure black)
- Adjusted border colors for visibility
- Brighter semantic colors (status colors)

**Contrast:**

- Maintain WCAG AA contrast ratios
- Test all color combinations in dark mode
- Ensure focus indicators are visible

## Related Documents

- [`../design_system.md`](../design_system.md) - Design system index
- [`color_palette.md`](./color_palette.md) - Dark mode color values
- [`accessibility.md`](./accessibility.md) - Contrast requirements
