---
title: Inspector shadcn audit
category: developer_reference
subcategory: inspector
---

# Inspector shadcn audit

## Route Groups

- **Chrome:** `inspector/src/components/layout/app_layout.tsx`, `header.tsx`, `sidebar.tsx`, `sidebar_user_footer.tsx`, `sandbox_banner.tsx`, `page_shell.tsx`
- **Primary browsing:** `dashboard.tsx`, `search.tsx`, `entities.tsx`, `sources.tsx`, `observations.tsx`, `relationships.tsx`, `timeline.tsx`, `interpretations.tsx`
- **Detail inspection:** `entity_detail.tsx`, `source_detail.tsx`, `relationship_detail.tsx`, `schema_detail.tsx`, `timeline_event_detail.tsx`, `conversation_detail.tsx`, `turn_detail.tsx`
- **Agent and access:** `agents.tsx`, `agent_detail.tsx`, `agent_grants.tsx`, `agent_grant_detail.tsx`, `access_policies.tsx`
- **Operations:** `issues.tsx`, `issue_detail.tsx`, `subscriptions.tsx`, `peers.tsx`, `peer_detail.tsx`, `compliance.tsx`, `settings.tsx`, `sandbox.tsx`
- **Shared inspection components:** `agent_filter.tsx`, `json_viewer.tsx`, `type_badge.tsx`, `field_value.tsx`, `snapshot_field_list.tsx`, `markdown_body_sheet.tsx`, recent feed components, relationship and timeline panels

## Live reference

- **`/design`** in the Inspector app (`inspector/src/pages/design.tsx`) — tabbed showcase of tokens, typography, primitives, forms, overlays, data composites, and inspection patterns (including observation vs world-time timelines). Use when validating UI work or onboarding to Inspector chrome.

## Current shadcn Coverage

Inspector already has a strong shadcn-style base under `inspector/src/components/ui`:

- **Core primitives in use:** `Button`, `Input`, `Label`, `Card`, `Badge`, `Dialog`, `Select`, `Switch`, `Tooltip`, `Skeleton`, `Alert`, `ScrollArea`, `Sheet`, `Tabs`, `Textarea`, `DropdownMenu`
- **Data composites in use:** `DataTable`, `Pagination`, `ConfirmDialog`
- **Available but underused:** `Checkbox`, `Popover`, `Toggle`, `ToggleGroup`
- **Missing for planned adoption:** `Table`, `AlertDialog`

Keep the mirrored frontend contract on `data-table.tsx`, `pagination.tsx`, and `confirm-dialog.tsx` unless that coupling is intentionally removed.

## Findings

| Surface | Current pattern | shadcn target | Priority |
| --- | --- | --- | --- |
| `components/shared/agent_filter.tsx` | Native `<select>` and `<optgroup>` | `Select` or a grouped Select-equivalent | High |
| `pages/issues.tsx` | Raw filter buttons | `ToggleGroup` with `ToggleGroupItem` | High |
| `pages/issues.tsx` | Native checkboxes | `Checkbox` with `Label` | High |
| `pages/issues.tsx` | Raw action buttons | `Button` variants and sizes | High |
| `pages/issues.tsx` | Hand-built status and label pills | `Badge` | High |
| `pages/issues.tsx` | Bare destructive error text | `QueryErrorAlert` or `Alert` | High |
| `pages/issues.tsx` | `window.confirm` for remove flows | `ConfirmDialog` now; `AlertDialog` later | High |
| `pages/issue_detail.tsx` | Raw copy/action/send buttons | `Button` | High |
| `pages/issue_detail.tsx` | Raw reply `<textarea>` | `Textarea` | High |
| `pages/issue_detail.tsx` | Hand-built status and label pills | `Badge` | High |
| `pages/issue_detail.tsx` | Raw segmented formatted/raw toggle | `ToggleGroup` | High |
| `pages/issue_detail.tsx` | `window.confirm` for removal | `ConfirmDialog` now; `AlertDialog` later | High |
| `components/shared/inspector_theme_toggle.tsx` | Custom radiogroup buttons | `ToggleGroup` while preserving radiogroup semantics | Medium |
| `pages/entity_detail.tsx` | Raw formatted/raw toggle | `ToggleGroup` | Medium |
| `pages/entity_detail.tsx` | Native textareas for field edits | `Textarea` | Medium |
| `components/shared/markdown_body_sheet.tsx` | Raw formatted/raw toggle | `ToggleGroup` | Medium |
| `components/shared/json_viewer.tsx` | Tiny raw expander buttons | `Button` `variant="ghost"` `size="sm"` | Medium |
| `components/shared/type_badge.tsx` | Custom span pill | `Badge` wrapper retaining entity-type colors | Medium |
| `components/layout/sidebar.tsx` | Hand-built search suggestion popover | `Popover` or `Command` later | Medium |
| `components/layout/sidebar.tsx` | More section label (static) | — | Done |
| `pages/sources.tsx` | Hand-built source cards and chips | `Card`, `Badge`, reusable result-list item | Low |
| `pages/graph_explorer.tsx` | Inline hardcoded node colors | CSS variable-backed node styles | Low |
| `pages/peers.tsx`, `peer_detail.tsx`, `subscriptions.tsx` | `window.confirm` on destructive actions | `ConfirmDialog` now; `AlertDialog` later | Low |

## Batches

### Batch 1: Low-risk consistency pass

Use only primitives already present in `inspector/src/components/ui`.

- Replace `AgentFilterControl` native select with `Select`
- Normalize `issues.tsx` with `ToggleGroup`, `Checkbox`, `Button`, `Badge`, `Alert`, and `ConfirmDialog`
- Normalize `issue_detail.tsx` with `Button`, `Textarea`, `Badge`, `ToggleGroup`, `Alert`, and `ConfirmDialog`
- Convert formatted/raw toggles in `entity_detail.tsx` and `markdown_body_sheet.tsx` to `ToggleGroup`

### Batch 2: Shared inspection primitives

Create small wrappers only where they remove repeated markup.

- Add a reusable issue/status badge helper if Issue pages need status-specific variants
- Convert `TypeBadge` to wrap `Badge` while preserving `getEntityTypeColor`
- Convert `JsonViewer` expander buttons to `Button` ghost controls
- Introduce a `FilterBar` or `ResultCard` only if two or more pages can immediately use it

### Batch 3: New primitives and heavier surfaces

Install or add missing shadcn primitives only after Batch 1 proves the pattern.

- Add `Table` primitives and update `DataTable`; mirror to `frontend/src/components/ui/data-table.tsx` if the sync contract still applies
- Add `AlertDialog` and replace remaining `window.confirm` calls across issues, peers, and subscriptions
- Evaluate `Command` for sidebar/global search after preserving current routing, keyboard, and focus behavior
- Move graph node styles to CSS variables; keep React Flow canvas custom

## Verification

For documentation-only audit updates:

- Read the changed markdown for broken paths and duplicated guidance

For Batch 1 UI changes:

- Run `npm run lint` in `inspector`
- Run `npm run build` in `inspector`
- Smoke test `/issues`, `/issues/:number`, `/entities/:id`, and `/settings`
- Verify keyboard focus and screen reader labels on issue filters, checkboxes, action buttons, and formatted/raw toggles

For Batch 2 and Batch 3:

- Run `npm run lint` and `npm run build` in `inspector`
- If `DataTable` changes, also inspect `frontend/src/components/ui/data-table.tsx` for required mirror updates
- Smoke test table-heavy pages: `/entities`, `/observations`, `/sources`, `/relationships`, `/schemas`, `/agents`
- Smoke test destructive confirmations without completing destructive actions unless using fixture data

## Adoption Rules

- Preserve Inspector as an inspection surface, not an agentic experience
- Prefer existing local primitives before adding new shadcn files
- Keep dark mode and `inspector/src/index.css` design tokens intact
- Avoid replacing semantic `Link` elements with buttons unless the interaction is truly an action
- Preserve keyboard behavior and ARIA semantics when replacing custom controls
