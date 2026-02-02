# Accessibility

## Contrast Requirements

**WCAG AA Minimum:**

- Normal text: 4.5:1 contrast ratio
- Large text (18px+): 3:1 contrast ratio
- UI components: 3:1 contrast ratio

**WCAG AAA Target (Where Possible):**

- Normal text: 7:1 contrast ratio
- Large text: 4.5:1 contrast ratio

## Focus Indicators

```yaml
focus:
  outline: "2px solid primary_color"
  outline_offset: "2px"
  border_radius: "4px" # Match element border radius
```

**Rationale:** Clear, visible focus indicators are essential for keyboard navigation (strong preference in developer tools).

## Keyboard Navigation

- All interactive elements must be keyboard accessible
- Logical tab order
- Skip links for main content
- Keyboard shortcuts documented

## Related Documents

- [`../design_system.md`](../design_system.md) - Design system index
- [`../subsystems/accessibility.md`](../subsystems/accessibility.md) - Complete accessibility requirements
- [`dark_mode.md`](./dark_mode.md) - Dark mode contrast considerations
