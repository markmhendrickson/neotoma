# UI Pattern: Dashboard
*(Overview with Metrics and Widgets)*

---

## Purpose

Dashboard pattern for displaying aggregate metrics and summaries.

---

## When to Use

- Home/overview page
- Stats summary
- Recent activity feed

---

## DSL Example

```yaml
component_type: dashboard
layout:
  type: grid
  widgets:
    - type: metric
      title: "Total Records"
      data_source:
        type: mcp_action
        source: get_record_count
    
    - type: list
      title: "Recent Records"
      data_source:
        type: mcp_action
        source: list_records
        params:
          limit: 5
```

---

## States

- Loading: Skeleton widgets
- Empty: "No data yet"

---

## Accessibility

- Each widget MUST have heading
- Widgets MUST be keyboard navigable

---

## i18n

- Widget titles translatable
- Metrics formatted per locale

---

## Agent Instructions

### When to Load This Document

Load `docs/ui/patterns/dashboard.md` when:
- Designing or implementing dashboard/overview screens
- Modifying metric widgets or recent activity lists
- Planning accessibility and i18n for dashboards

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` (UI as inspection window, not agent)
- `docs/ui/design_system.md` (visual hierarchy, spacing)
- `docs/subsystems/accessibility.md` (A11y requirements)
- `docs/subsystems/i18n.md` (localization)

### Constraints Agents Must Enforce

1. MUST treat dashboards as read-heavy overview surfaces (no heavy mutation workflows)
2. MUST provide loading/empty states for widgets
3. MUST ensure each widget has a heading and is keyboard navigable

### Forbidden Patterns

- Embedding agent-like automation flows directly in dashboards
- Omitting empty/error states for widgets
- Building inaccessible widgets without headings or focus management

### Validation Checklist

- [ ] Widgets have clear headings and keyboard focus behavior\n- [ ] Loading/empty/error states implemented\n- [ ] Text and numbers localized\n- [ ] Dashboard respects Truth Layer boundaries (inspection, not mutation)\n*** End Patch```}"}]}} to=functions.apply_patchственной  মিনিট to=functions.apply_patch_COMMENTARY  利盛 to=functions.apply_patch ***!