# Implementation Notes

## CSS Variables

Use CSS custom properties for theming:

```css
:root {
  --color-primary: #0066cc;
  --color-background: #ffffff;
  /* ... */
}
.dark {
  --color-primary: #3b82f6;
  --color-background: #0f172a;
  /* ... */
}
```

## Component Library

**Recommended:** shadcn/ui or similar

- Tailwind CSS-based
- Accessible by default
- Customizable
- Dark mode support

**Available Components:** See `docs/ui/shadcn_components.md` for complete inventory.

**Key Components:**

- **Select:** Use for dropdown selects (type filters, locale selectors). Do NOT use native `<select>` elements.
- **DropdownMenu:** Use for context menus, column visibility toggles, row actions.
- **Button, Input, Card, Badge, Table:** Core UI components matching design system.
- **Dialog, Sheet:** For modals and side panels.

**Component Selection Guidelines:**

- **Select vs DropdownMenu:** Use Select for single-value form inputs. Use DropdownMenu for context menus and multi-selection.
- **Always prefer shadcn components** over native HTML elements for consistency and accessibility.

### Recommended Component Additions

**High Priority (MVP):**

1. **Checkbox** - Replace native checkboxes in table row selection
   - **Use case:** Table row selection, form checkboxes
   - **Rationale:** Consistent styling, better accessibility, matches design system
2. **Switch** - For settings toggles (theme, features)
   - **Use case:** Settings page (theme toggle, feature flags)
   - **Rationale:** Better UX than checkboxes for on/off states
3. **Alert** - For error messages and notifications
   - **Use case:** Error states, important messages, inline notifications
   - **Rationale:** Consistent error display, better than ad-hoc error messages
4. **Progress** - For upload progress, loading states
   - **Use case:** File upload progress, processing indicators
   - **Rationale:** Visual feedback for long-running operations (matches FU-401 processing indicator)
5. **Skeleton** - For loading states (better UX than spinners)
   - **Use case:** Source list loading, entity list loading, detail panel loading
   - **Rationale:** Reduces perceived load time, better UX than spinners

**Medium Priority (Post-MVP):**

6. **Tabs** - For settings pages, multi-section views
   - **Use case:** Settings page (General, Integrations, Billing sections)
   - **Rationale:** Better organization for complex settings (matches FU-306)
7. **Tooltip** - For helpful hints and explanations
   - **Use case:** Icon buttons, form field help text, table column headers
   - **Rationale:** Provides context without cluttering UI
8. **Popover** - For additional information on hover
   - **Use case:** Entity details, observation metadata, help content
   - **Rationale:** Progressive disclosure of information
9. **Calendar** - For date range filters in tables
   - **Use case:** Timeline view date filters, search date range picker
   - **Rationale:** Better UX than text inputs for date selection (matches FU-303, FU-600)

**Low Priority (Future):**

10. **Accordion** - For collapsible sections
    - **Use case:** FAQ sections, help documentation, collapsible form sections
    - **Rationale:** Useful for organizing long content
11. **Slider** - For numeric range inputs
    - **Use case:** Advanced filters, settings (if needed)
    - **Rationale:** Better UX for numeric ranges
12. **Command** - For command palette
    - **Use case:** Keyboard-driven navigation, quick actions
    - **Rationale:** Power user feature (matches Tier 1 ICP preferences for keyboard-first tools)

### Component Design System Alignment

All shadcn/ui components must:

- **Typography:** Use Inter font for UI text, JetBrains Mono for monospace (where applicable)
- **Colors:** Follow design system color palette (light/dark mode)
- **Spacing:** Match spacing scale (4px, 8px, 16px, etc.)
- **Dark Mode:** Support dark mode with proper contrast
- **Accessibility:** Meet WCAG AA standards (keyboard navigation, screen readers, focus indicators)
- **Border Radius:** Match design system (6px buttons/inputs, 8px cards, 4px badges)
- **Transitions:** Use design system timing (150-300ms, ease-in-out)

**Implementation Priority:**

1. High priority components should be added before MVP launch
2. Medium priority components can be added post-MVP based on user feedback
3. Low priority components are optional enhancements

## Design Tokens

Maintain design tokens in:

- CSS variables (for runtime)
- TypeScript/JSON (for design tools)
- Documentation (this file)

## Related Documents

- [`../design_system.md`](../design_system.md) - Design system index
- [`../shadcn_components.md`](../shadcn_components.md) - Complete shadcn/ui component inventory
