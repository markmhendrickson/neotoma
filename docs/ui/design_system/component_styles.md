# Component Styles

## Buttons

**Primary:**

```yaml
primary:
  background: "primary_color"
  color: "white"
  padding: "8px 16px"
  height: "40px"
  border_radius: "6px"
  font_weight: "500"
  font_size: "0.9375rem"
  transition: "all 150ms ease-in-out"

  hover:
    background: "primary_hover"
    transform: "translateY(-1px)" # Subtle lift
    box_shadow: "0 2px 4px rgba(0,0,0,0.1)"

  active:
    transform: "translateY(0)"
    box_shadow: "none"

  disabled:
    opacity: "0.5"
    cursor: "not-allowed"
```

**Secondary:**

```yaml
secondary:
  background: "transparent"
  color: "primary_color"
  border: "1px solid currentColor"
  padding: "8px 16px"
  height: "40px"
  border_radius: "6px"
  font_weight: "500"

  hover:
    background: "primary_color / 0.1" # 10% opacity
```

**Ghost (Tertiary):**

```yaml
ghost:
  background: "transparent"
  color: "foreground_secondary"
  padding: "6px 12px"
  height: "auto"

  hover:
    background: "background_tertiary"
    color: "foreground_primary"
```

## Inputs

```yaml
input:
  height: "40px"
  padding: "8px 12px"
  border: "1px solid border_color"
  border_radius: "6px"
  background: "background_primary"
  color: "foreground_primary"
  font_size: "0.9375rem"
  transition: "border-color 150ms ease-in-out"

  focus:
    border_color: "primary_color"
    outline: "2px solid primary_color / 0.2"
    outline_offset: "2px"

  disabled:
    background: "background_secondary"
    color: "foreground_tertiary"
    cursor: "not-allowed"

  error:
    border_color: "error_color"
```

## Tables

```yaml
table:
  width: "100%"
  border_collapse: "separate"
  border_spacing: "0"

  header:
    background: "background_secondary"
    font_weight: "600"
    font_size: "0.8125rem"
    text_transform: "uppercase"
    letter_spacing: "0.05em"
    color: "foreground_secondary"
    padding: "12px 16px"
    border_bottom: "2px solid border_color"

  row:
    height: "40px"
    border_bottom: "1px solid border_color"

    hover:
      background: "background_tertiary"

  cell:
    padding: "12px 16px"
    font_size: "0.9375rem"
```

### Table Functionality (Required for Tier 1 ICPs)

**Sorting:**

- Clickable column headers with sort indicators (ArrowUpDown, ArrowUp, ArrowDown icons)
- Multi-column sorting support (optional, for advanced use cases)
- Sort state persistence (optional, via localStorage)
- Visual indicators: Icon shows current sort direction (asc/desc) or unsorted state
- Sort button styling: Ghost variant, small size, no border on hover

**Column Management:**

- Column visibility toggle (show/hide columns via dropdown menu)
- Column reordering (drag-and-drop column headers)
- Column width resizing (drag column borders to resize)
- Column state persistence (visibility, order, widths saved to localStorage)
- Column menu: Dropdown with visibility checkboxes, reset options

**Search and Filtering:**

- Global search input (full-text search across all visible columns)
- Type filter dropdown (filter by entity type)
- Search placeholder: "Search sources..." or "Search entities..." (context-dependent)
- Filter state: Clear visual indication of active filters
- Clear filters button (when filters active)

**Pagination:**

- Load more button (infinite scroll pattern preferred for high-density)
- Display count: "Showing X of Y sources" or "Showing X of Y entities" (context-dependent)
- Pagination controls (optional, for very large datasets)

**Row Interactions:**

- Row selection (checkbox column for bulk actions)
- Row click → navigate to detail view
- Row hover: Subtle background change (background_tertiary)
- Row actions: Dropdown menu per row (view, delete, etc.)
- Keyboard navigation: Arrow keys, Enter to select, Space to toggle selection

**Table Controls:**

- Column visibility menu (dropdown with checkboxes)
- Reset columns button (restore default visibility/order/widths)
- Export options (optional, CSV/JSON export)

**Accessibility:**

- ARIA labels for sort buttons
- Keyboard navigation support
- Screen reader announcements for sort changes
- Focus indicators on interactive elements

**Rationale:** Tier 1 ICPs (especially High-Context Knowledge Workers) expect professional table functionality matching legal platforms (Westlaw, LexisNexis) and research tools (Zotero, Mendeley). These tools provide high-density, sortable, filterable table interfaces for managing large document collections.

**Tier 1 ICP Expectations:**

- **High-Context Knowledge Workers:** Work with hundreds of documents across multiple projects. Require sortable, filterable tables to manage information overload. Expect column management (visibility, reordering) and advanced search capabilities.
- **AI-Native Individual Operators:** Expect developer-friendly interfaces with keyboard navigation, efficient data inspection, and customizable layouts.
- **AI-Native Founders:** Expect modern, functional interfaces with fast interactions and professional appearance matching tools like Linear and GitHub.

**Implementation Status:**

- ✅ Sorting (multi-column, ascending/descending with visual indicators)
- ✅ Column visibility (show/hide via dropdown menu)
- ✅ Column reordering (drag-and-drop)
- ✅ Column width resizing
- ✅ Global search (full-text across visible columns)
- ✅ Type filtering (dropdown filter)
- ✅ Row selection (checkbox column)
- ✅ Row actions (dropdown menu per row)
- ✅ State persistence (localStorage for column state)
- ✅ Keyboard navigation (arrow keys, Enter, Space)

## Cards

```yaml
card:
  background: "background_primary"
  border: "1px solid border_color"
  border_radius: "8px"
  padding: "1rem"
  box_shadow: "0 1px 3px rgba(0,0,0,0.1)" # Subtle shadow

  hover:
    box_shadow: "0 4px 6px rgba(0,0,0,0.1)" # Slightly more on hover
    border_color: "border_color (slightly darker)"
```

## Badges/Tags

```yaml
badge:
  display: "inline-flex"
  align_items: "center"
  padding: "4px 8px"
  border_radius: "4px"
  font_size: "0.8125rem"
  font_weight: "500"

  variants:
    default:
      background: "background_tertiary"
      color: "foreground_secondary"

    primary:
      background: "primary_color / 0.1"
      color: "primary_color"

    success:
      background: "success_color / 0.1"
      color: "success_color"

    error:
      background: "error_color / 0.1"
      color: "error_color"
```

## Related Documents

- [`../design_system.md`](../design_system.md) - Design system index
- [`../shadcn_components.md`](../shadcn_components.md) - shadcn/ui component inventory
- [`visual_hierarchy.md`](./visual_hierarchy.md) - Component usage in content structure
