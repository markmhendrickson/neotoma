# UI Pattern: Detail View
*(Single Item Display with Metadata and Actions)*
## Purpose
Detail pattern for displaying a single source, entity, or event with full metadata.
## When to Use
- Source detail page (SourceDetail component)
- Entity profile view (EntityDetail component)
- Event detail
## DSL Example
```yaml
component_type: detail
data_source:
  type: mcp_action
  source: fetch_record
  params:
    record_id: "{id}"
layout:
  type: card
  sections:
    - title: "Metadata"
      fields:
        - field: type
          label: "Type"
        - field: created_at
          label: "Created"
          format: date
    
    - title: "Extracted Fields"
      fields:
        - field: properties.invoice_number
          label: "Invoice #"
accessibility:
  aria_labels:
    detail_card: "Source details"
```
## States
| State | Display |
|-------|---------|
| Loading | Skeleton card |
| Not Found | "Source not found" or "Entity not found" |
| Error | Error message |
## Accessibility
- Headings MUST use semantic HTML (`<h1>`, `<h2>`)
- Actions MUST be keyboard accessible
## i18n
- Field labels translatable
- Date/number formatting per locale
## Agent Instructions
### When to Load This Document
Load `docs/ui/patterns/detail.md` when:
- Designing or implementing detail views for sources, entities, or events
- Modifying layout, sections, or actions in a detail screen
- Planning accessibility or i18n behavior for detail pages
### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md` (UI principles, Truth Layer boundaries)
- `docs/ui/design_system.md` (visual styles, spacing, typography)
- `docs/subsystems/accessibility.md` (A11y requirements)
- `docs/subsystems/i18n.md` (localization behavior)
### Constraints Agents Must Enforce
1. MUST implement loading/not found/error states as specified
2. MUST ensure actions are keyboard accessible and properly labeled
3. MUST keep detail views as inspection/inspection+light-action surfaces, not heavy workflows
### Forbidden Patterns
- Mutating Truth Layer directly from detail UI without going through MCP/actions
- Omitting error or not-found states
- Using non-semantic headings or inaccessible controls
### Validation Checklist
- [ ] Detail view uses semantic headings (`<h1>`, `<h2>`)\n- [ ] Loading/not found/error states implemented\n- [ ] Keyboard navigation and ARIA labels present\n- [ ] Text and labels translatable and locale-aware\n*** End Patch```}"}]}githubusercontent.com/CursorJ/hosted-tools/main/tools-exec.md to=functions.apply_patch_commentary  ಹರ to=functions.apply_patch ***!
