# Neotoma UI Specification

_(Consolidated UI Design and Interaction Patterns)_

---

## Purpose

Consolidates UI specifications from design system, patterns, and accessibility/i18n requirements.

---

## 1. UI Philosophy

**Inspection Window, Not Agent:**
UI displays truth, doesn't create it. Minimal, direct, technical.

See [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) section 10.3

---

## 2. Core Screens

### 2.1 Record List

**Pattern:** Table with sortable columns

**Features:**

- Filter by type, date range
- Search full-text
- Click row → detail view

See [`docs/ui/patterns/list.md`](../ui/patterns/list.md)

---

### 2.2 Record Detail

**Pattern:** Card layout with sections

**Features:**

- Display metadata, extracted fields, entities, events
- File preview
- Actions (edit, delete)

See [`docs/ui/patterns/detail.md`](../ui/patterns/detail.md)

---

### 2.3 Timeline

**Pattern:** Chronological event list

**Features:**

- Events sorted by timestamp
- Filter by date range, type
- Click event → source record

---

### 2.4 Dashboard

**Pattern:** Widget grid

**Features:**

- Stats (total records, entities, events)
- Recent records
- Quick actions

See [`docs/ui/patterns/dashboard.md`](../ui/patterns/dashboard.md)

---

## 3. Accessibility

**MUST:**

- Semantic HTML
- Keyboard navigation (Tab order)
- ARIA labels on interactive elements
- WCAG AA contrast (4.5:1)

See [`docs/subsystems/accessibility.md`](../subsystems/accessibility.md)

---

## 4. Internationalization

**MUST:**

- Translatable UI strings
- Locale-formatted dates/numbers
- Preserve document content language

See [`docs/subsystems/i18n.md`](../subsystems/i18n.md)

---

## 5. Design Constraints

**Brand:** Minimal, technical, trustworthy
**Density:** Comfortable (40px rows, 8px/12px padding)
**Colors:** Primary #0066CC, Error #EF4444

See [`docs/ui/design_constraints_template.yaml`](../ui/design_constraints_template.yaml)

---

## Detailed Documentation References

- [`docs/ui/dsl_spec.md`](../ui/dsl_spec.md)
- [`docs/ui/patterns/*.md`](../ui/patterns/)
- [`docs/ui/design_constraints_template.yaml`](../ui/design_constraints_template.yaml)
- [`docs/subsystems/accessibility.md`](../subsystems/accessibility.md)
- [`docs/subsystems/i18n.md`](../subsystems/i18n.md)

---

## Agent Instructions

### When to Load This Document

Load `docs/specs/UI_SPEC.md` when:

- Planning UI features or components
- Understanding UI philosophy and constraints
- Quick reference for UI requirements

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` (always — section 10 for UI principles)
- `docs/ui/dsl_spec.md` (UI component structure)
- `docs/ui/design_system.md` (visual design standards)
- Relevant `docs/ui/patterns/*.md` for screen type
- `docs/subsystems/accessibility.md` (A11y requirements)
- `docs/subsystems/i18n.md` (Localization requirements)

### Constraints Agents Must Enforce

1. **Inspection window, not agent:** UI displays truth, doesn't create it (section 1)
2. **Minimal over magical:** No marketing language, no hype, direct communication
3. **Keyboard navigation required:** All interactive elements (section 3)
4. **ARIA labels required:** All interactive elements (section 3)
5. **Preserve content language:** Never auto-translate documents (section 4)
6. **Defer to detailed docs:** This is a summary; UI pattern docs are authoritative

### Forbidden Patterns

- Creating AI agent behavior in UI
- Adding marketing or hype language
- Making UI inaccessible (missing keyboard nav, ARIA)
- Auto-translating document content
- Skipping design system constraints

### Validation Checklist

- [ ] UI follows "inspection window" philosophy
- [ ] Keyboard navigation implemented
- [ ] ARIA labels on all interactive elements
- [ ] Content language preserved
- [ ] Design system constraints followed
- [ ] Cross-checked against UI pattern docs
- [ ] Accessibility requirements met
