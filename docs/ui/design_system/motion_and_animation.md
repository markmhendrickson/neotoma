# Motion and Animation

## Animation Principles

**Minimal, Fast, Functional:**

- No decorative animations
- Fast transitions (150-300ms)
- Functional feedback only
- Respect `prefers-reduced-motion`

## Transition Timing

```yaml
transitions:
  fast: "150ms" # Hover states, button feedback
  normal: "200ms" # Color changes, opacity
  slow: "300ms" # Layout changes, page transitions
easing:
  default: "ease-in-out"
  enter: "ease-out" # Elements appearing
  exit: "ease-in" # Elements disappearing
```

## Animation Usage

**Allowed:**

- Button hover/active states
- Input focus states
- Modal/dialog enter/exit
- Loading states (skeleton, spinner)
- Toast notifications

**Forbidden:**

- Decorative animations
- Playful transitions
- Excessive motion
- Auto-playing animations

## Related Documents

- [`../design_system.md`](../design_system.md) - Design system index
- [`loading_states.md`](./loading_states.md) - Loading state animations
