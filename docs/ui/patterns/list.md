# UI Pattern: List View
*(Tables, Grids, and Filterable Lists)*
## Purpose
List pattern for displaying collections of records, entities, or events.
## When to Use
- Displaying multiple records
- Browsing timeline events
- Entity list views
- Search results
## DSL Example
```yaml
component_type: list
layout:
  type: table
  columns:
    - field: type
      label: "Type"
      sortable: true
    - field: created_at
      label: "Created"
      sortable: true
interactions:
  - trigger: click
    target: row
    action: navigate
    params:
      to: "/records/{id}"
accessibility:
  aria_labels:
    table: "List of records"
  keyboard_shortcuts:
    - key: "/"
      action: focus_search
```
## States
| State | Display |
|-------|---------|
| Loading | Skeleton rows |
| Empty | "No records found" + upload button |
| Error | Error message + retry button |
## Accessibility
- Table MUST have `role="table"` or use `<table>`
- Rows MUST be keyboard navigable (Tab)
- Sort buttons MUST have ARIA labels
## i18n
- Column headers translatable
- Dates formatted per locale
- Empty/error messages translatable
## Agent Instructions
### When to Load This Document
Load `docs/ui/patterns/list.md` when:
- Designing or implementing list/table views (records, entities, events)
- Modifying list interactions (sorting, filtering, selection)
- Planning list-related accessibility or i18n behavior
### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md` (UI as inspection window, not agent)
- `docs/ui/design_system.md` (visual styles, spacing, typography)
- `docs/subsystems/accessibility.md` (A11y requirements)
- `docs/subsystems/i18n.md` (localization behavior)
### Constraints Agents Must Enforce
1. MUST implement loading/empty/error states as specified in the States section
2. MUST support keyboard navigation and ARIA labels for sort and selection
3. MUST keep list views as inspection surfaces, not action-heavy workflows
### Forbidden Patterns
- Building list views that mutate Truth Layer directly from UI
- Omitting loading/empty/error states
- Using non-semantic markup for tabular data
### Validation Checklist
- [ ] List uses appropriate semantic structure (`<table>` or ARIA roles)
- [ ] Loading, empty, and error states implemented
- [ ] Keyboard navigation and ARIA labels present
- [ ] Text and labels translatable and locale-aware
