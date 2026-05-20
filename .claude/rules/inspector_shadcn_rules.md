---
description: Enforce shadcn/ui primitives in Inspector UI work; prefer existing inspector components over native HTML controls.
globs:
  - inspector/**
alwaysApply: false
---

<!-- Source: docs/ui/inspector_shadcn_rules.mdc -->


# Inspector shadcn UI Rules

## Purpose

Keep the Inspector app visually and behaviorally consistent with the Neotoma design system by using shadcn/ui-style primitives from `inspector/src/components/ui/` instead of ad hoc native HTML controls and one-off Tailwind patterns.

Inspector is an inspection surface, not a marketing or agentic UI. Prefer consistency, accessibility, and design tokens over decorative variation.

## Canonical references

- `docs/ui/shadcn_components.md` — component inventory and Select vs DropdownMenu guidance
- `docs/ui/design_system/implementation_notes.md` — prefer shadcn over native HTML, tokens, dark mode, WCAG AA
- `docs/ui/inspector_shadcn_audit.md` — route-level adoption backlog (if present)

## Installed primitives (`inspector/src/components/ui/`)

Prefer these when they fit the interaction. Do not add new primitives in feature work without a short justification.

**Core (use first):** `Button`, `Input`, `Label`, `Textarea`, `Select`, `Card`, `Badge`, `Separator`, `Dialog`, `Sheet`, `Alert`, `Skeleton`, `Tooltip`, `ScrollArea`, `Tabs`, `Switch`, `DropdownMenu`

**Composites (preserve mirror contract):** `DataTable`, `Pagination`, `ConfirmDialog` — keep in sync with `frontend/src/components/ui/` when editing; see comments in those files.

**Available but often unused in pages:** `Checkbox`, `Popover`, `Toggle`, `ToggleGroup` — use them before inventing custom segmented controls or native checkboxes.

**Not present in Inspector yet (add only with plan):** shadcn `Table` markup inside `DataTable`, `AlertDialog` (prefer `ConfirmDialog` until added), `Command` for search/command palettes.

## MUST

### Control selection

- **MUST** use `Select` from `@/components/ui/select` for single-value dropdowns. **MUST NOT** use native `<select>` (including `agent_filter.tsx` and similar filters).
- **MUST** use `DropdownMenu` for context menus, column visibility, and action menus — not `Select`.
- **MUST** use `Button` with appropriate `variant` and `size` instead of raw `<button>` with hand-rolled border/background classes.
- **MUST** use `Checkbox` + `Label` for boolean row selection and multi-select lists — not native `<input type="checkbox">`.
- **MUST** use `Textarea` for multi-line text entry — not unstyled native `<textarea>` except where a documented exception applies.
- **MUST** use `ToggleGroup` / `ToggleGroupItem` for segmented filters (e.g. open/closed/all, formatted/raw) — not custom `role="group"` button clusters unless accessibility requirements cannot be met with shadcn.
- **MUST** use `Badge` for status, labels, and compact chips — not ad hoc `rounded-full` span pills with hard-coded palette classes.
- **MUST** use `Alert` or shared `QueryErrorAlert` for errors — not bare `<p className="text-destructive">` alone.
- **MUST** use `ConfirmDialog` (or `AlertDialog` once added) for destructive confirmations — **MUST NOT** use `window.confirm`.

### Layout and tokens

- **MUST** use design tokens from `inspector/src/index.css` (`--background`, `--foreground`, `--primary`, `--border`, `--muted`, `--destructive`, sidebar/popover tokens, etc.). **MUST NOT** hard-code one-off hex colors for product chrome (graph node styling may use theme-aware variables when touched).
- **MUST** preserve semantic `<Link>` from `react-router-dom` for navigation; do not replace links with `Button` unless the control is an action, not navigation.

### Data display

- **MUST** use shared `DataTable` for tabular data — do not add parallel raw `<table>` layouts in pages.
- **MUST** use `Card` / `CardHeader` / `CardContent` for grouped content blocks when replacing hand-built bordered `div` list cards (e.g. sources list, issue rows) unless a feed-specific layout is intentionally feed-only.

## SHOULD

- **SHOULD** use `Sheet` for slide-over detail (markdown preview, large JSON) where a side panel pattern already exists.
- **SHOULD** use `Skeleton` / shared loading helpers from `components/shared/query_status.tsx` for loading states.
- **SHOULD** migrate highest-traffic inconsistency surfaces first: `pages/issues.tsx`, `pages/issue_detail.tsx`, `components/shared/agent_filter.tsx`, then segmented controls in `entity_detail.tsx` and `components/shared/inspector_theme_toggle.tsx`.

## MUST NOT

- **MUST NOT** introduce new UI primitives under `inspector/src/components/ui/` without updating `docs/ui/shadcn_components.md` and noting why.
- **MUST NOT** duplicate full shadcn component source into pages — import from `@/components/ui/*` and `@/lib/utils` (`cn`).
- **MUST NOT** edit files under `.claude/rules/` or `.claude/skills/` — edit this file and run `npm run setup:cursor` (or `./scriptsscripts/setup_claude_instructions.sh.sh`).

## Validation

Before marking Inspector UI work complete:

- [ ] No new native `<select>` for product controls in touched files
- [ ] No new raw `<button>` for primary actions in touched files (except inside shadcn `Button` composition patterns)
- [ ] Errors and confirmations use shared alert/confirm patterns
- [ ] `npm run lint` and `npm run build` succeed in `inspector/`
- [ ] Smoke-test changed routes (especially Issues, Settings, entity detail) in light and dark mode
