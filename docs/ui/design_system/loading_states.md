# Loading States

## Loading Indicators

**Skeleton Screens:**

- Match content layout
- Subtle gray background
- Pulse animation (subtle)
- Fast (avoid flash)

**Spinners:**

- Minimal, circular
- Primary color
- Small size (24px max)

## Processing Indicator (FU-401)

**Step-by-Step Progress:**

- Vertical list of steps
- Each step: Checkmark (✓) when complete, spinner when active, empty when pending
- Step labels: "Extracting text", "Detecting document type", "Extracting fields", etc.
- Overall progress: "Step 3 of 5"
- Live region for screen readers (aria-live="polite")
- Min display time: 1s (avoid flash)
- Timeout: 30s with error state

**Visual Style:**

- Steps: Left-aligned list
- Checkmark: Green (success color), 16px icon
- Spinner: Primary color, 16px
- Pending: Muted foreground, no icon

## Related Documents

- [`../design_system.md`](../design_system.md) - Design system index
- [`motion_and_animation.md`](./motion_and_animation.md) - Animation timing for loading states
