# Design System Preview Component

Interactive preview of all design system components and styles from `docs/ui/design_system.md`.

## Accessing the Design System Preview

### Method 1: Direct URL Path

Navigate to `/design-system`:

```
http://localhost:5173/design-system
```

### Method 2: Keyboard Shortcut

Press `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac) to toggle between the main app and design system preview.

### Method 3: Programmatic Navigation

Navigate programmatically by updating the pathname:

```typescript
window.history.pushState({}, "", "/design-system");
```

## Features

The design system preview displays:

- **Colors**: Base colors (light/dark mode), semantic colors, entity type colors
- **Typography**: All heading levels, body text, monospace text
- **Spacing**: Complete spacing scale with visual examples
- **Buttons**: All variants (primary, secondary, outline, ghost, destructive) and sizes
- **Inputs**: Default, disabled, error states, monospace inputs
- **Tables**: High-density table layout example
- **Cards**: Card components with headers, content, and footers
- **Badges**: All badge variants including entity type badges
- **States**: Empty, loading, and error states
- **Data Visualization**: Timeline and entity graph examples

## Dark Mode

The design system preview includes a dark mode toggle button in the header. Click the sun/moon icon to switch between light and dark themes.

## Closing

Click the X button in the header or use the keyboard shortcut (`Ctrl+Shift+S` / `Cmd+Shift+S`) to navigate back to the main app. You can also use the browser's back button.
