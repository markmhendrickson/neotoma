# Neotoma UI DSL Specification
*(UI Component Schema and Interaction Model)*
## DSL Schema
```typescript
interface UISpec {
  component_type: 'list' | 'detail' | 'dashboard' | 'wizard' | 'settings';
  title: string;
  data_source: DataSource;
  layout: Layout;
  interactions: Interaction[];
  accessibility: AccessibilitySpec;
  i18n: I18nSpec;
}
interface DataSource {
  type: 'mcp_action' | 'api_endpoint';
  source: string;                      // e.g., 'list_records' or '/api/records'
  params?: Record<string, any>;
}
interface Layout {
  type: 'grid' | 'table' | 'card' | 'form';
  columns?: ColumnDef[];
  fields?: FieldDef[];
}
interface Interaction {
  trigger: 'click' | 'keypress' | 'submit';
  target: string;                      // Element ID or selector
  action: 'navigate' | 'open_modal' | 'submit_form';
  params?: Record<string, any>;
}
interface AccessibilitySpec {
  keyboard_shortcuts: KeyboardShortcut[];
  aria_labels: Record<string, string>;
  focus_management: string;
}
interface I18nSpec {
  translatable_keys: string[];
  locale_formats: LocaleFormat[];
}
```
## Example: Record List View
```yaml
component_type: list
title: "Records"
data_source:
  type: mcp_action
  source: list_records
  params:
    limit: 20
    offset: 0
layout:
  type: table
  columns:
    - field: type
      label: "Type"
      sortable: true
    - field: created_at
      label: "Created"
      sortable: true
      format: date
interactions:
  - trigger: click
    target: "row"
    action: navigate
    params:
      to: "/records/{id}"
accessibility:
  keyboard_shortcuts:
    - key: "/"
      action: focus_search
      label: "Focus search"
  aria_labels:
    table: "List of records"
    row: "Record {type} created {created_at}"
  focus_management: "Focus first row on load"
i18n:
  translatable_keys:
    - "records.title"
    - "records.columns.type"
    - "records.columns.created"
  locale_formats:
    - field: created_at
      type: date
      format: short
```
## UI Patterns
See `docs/ui/patterns/*.md` for specific patterns (list, detail, dashboard, wizard, settings).
## Agent Instructions
Load when defining UI specs, generating components, or understanding UI structure.
Required co-loaded:
- `docs/NEOTOMA_MANIFEST.md` (UI as inspection window, minimal over magical)
- `docs/subsystems/accessibility.md`
- `docs/subsystems/i18n.md`
Constraints:
- UI MUST be inspection-only (no agents in UI)
- All components MUST be keyboard accessible
- All text MUST be translatable
- All dates/numbers MUST use locale formatting
