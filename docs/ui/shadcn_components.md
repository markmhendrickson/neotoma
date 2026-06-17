# shadcn/ui Components Inventory
This document lists all available shadcn/ui components in the Neotoma application and their usage status.
## Available Components
### ✅ Installed and Available
#### Core UI Components
1. **Button** (`@/components/ui/button`)
   - **Status:** ✅ Active
   - **Usage:** Primary action buttons, secondary actions, ghost buttons, icon buttons
   - **Variants:** default, destructive, outline, secondary, ghost, link
   - **Sizes:** default, sm, lg, icon
   - **Used in:** SourceTable, EntityList, StyleGuide, ChatPanel, all major components
2. **Input** (`@/components/ui/input`)
   - **Status:** ✅ Active
   - **Usage:** Text inputs, search fields, form inputs
   - **Features:** Focus states, disabled states, error states
   - **Used in:** SourceTable (search), EntityList (search), StyleGuide, ChatPanel, forms
3. **Label** (`@/components/ui/label`)
   - **Status:** ✅ Active
   - **Usage:** Form labels, input labels
   - **Used in:** Forms, StyleGuide, settings components
4. **Card** (`@/components/ui/card`)
   - **Status:** ✅ Active
   - **Usage:** Content containers, dashboard widgets, information cards
   - **Sub-components:** CardHeader, CardTitle, CardDescription, CardContent, CardFooter
   - **Used in:** StyleGuide, dashboard components, onboarding
5. **Badge** (`@/components/ui/badge`)
   - **Status:** ✅ Active
   - **Usage:** Status indicators, entity type labels, tags
   - **Variants:** default, secondary, destructive, outline
   - **Used in:** SourceTable, EntityList (entity type badges), StyleGuide, entity displays
6. **Table** (`@/components/ui/table`)
   - **Status:** ✅ Active
   - **Usage:** High-density data tables, source lists, entity lists, observation lists
   - **Sub-components:** TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter, TableCaption
   - **Used in:** SourceTable, EntityList, ObservationList, StyleGuide
7. **Separator** (`@/components/ui/separator`)
   - **Status:** ✅ Active
   - **Usage:** Visual dividers, section separators
   - **Used in:** StyleGuide, forms, content sections
8. **Select** (`@/components/ui/select`)
   - **Status:** ✅ Active
   - **Usage:** Dropdown selects, type filters, locale selectors
   - **Sub-components:** SelectTrigger, SelectValue, SelectContent, SelectItem, SelectLabel, SelectSeparator
   - **Used in:** SourceTable (type filter), EntityList (type filter), StyleGuide (locale selector), should be used throughout app instead of native select
9. **Dropdown Menu** (`@/components/ui/dropdown-menu`)
   - **Status:** ✅ Active
   - **Usage:** Context menus, column visibility toggles, row actions
   - **Sub-components:** DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator
   - **Used in:** SourceTable (column visibility, row actions), EntityList, StyleGuide
10. **Dialog** (`@/components/ui/dialog`)
    - **Status:** ✅ Active
    - **Usage:** Modal dialogs, confirmations, forms
    - **Sub-components:** DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
    - **Used in:** KeyManagementDialog (key import/export/regenerate)
11. **Sheet** (`@/components/ui/sheet`)
    - **Status:** ✅ Active
    - **Usage:** Slide-out panels, sidebars, detail views
    - **Sub-components:** SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription
    - **Used in:** Mobile navigation sidebar, detail panels
12. **Textarea** (`@/components/ui/textarea`)
    - **Status:** ✅ Active
    - **Usage:** Multi-line text input, chat message input
    - **Used in:** ChatPanel (message input with auto-resize)
13. **Toast** (`@/components/ui/toast`)
    - **Status:** ✅ Active
    - **Usage:** Notifications, success/error messages, user feedback
    - **Sub-components:** Toaster, useToast hook
    - **Used in:** App.tsx (file upload notifications), KeyManagementDialog (key operations), SourceDetail (file operations), EntityDetail
14. **Scroll Area** (`@/components/ui/scroll-area`)
    - **Status:** ✅ Installed (not actively used)
    - **Usage:** Custom scrollable containers with styled scrollbars
    - **Sub-components:** ScrollAreaViewport, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaCorner
    - **Used in:** Not currently used in application (component available for future use)
15. **Input Group** (`@/components/ui/input-group`)
    - **Status:** ✅ Installed (not actively used)
    - **Usage:** Input with prefix/suffix elements (icons, buttons)
    - **Sub-components:** InputGroupRoot, InputGroupPrefix, InputGroupSuffix
    - **Used in:** Not currently used in application (component available for future use)
16. **Tabs** (`@/components/ui/tabs`)
    - **Status:** ✅ Active
    - **Usage:** Tabbed interfaces for organizing content into sections
    - **Sub-components:** Tabs, TabsList, TabsTrigger, TabsContent
    - **Used in:** EntityDetail (Snapshot, Schema, Sources, Interpretations, Timeline, Observations, Relationships tabs), SourceDetail (Source, Interpretations, Observations, Entities tabs)
17. **Progress** (`@/components/ui/progress`)
    - **Status:** ✅ Installed (not actively used)
    - **Usage:** Progress indicators for loading states, file uploads, processing
    - **Features:** Animated progress bar with percentage
    - **Used in:** Not currently used in application (recommended for FileUploadView, ingestion processing states)
18. **Tooltip** (`@/components/ui/tooltip`)
    - **Status:** ✅ Installed (not actively used)
    - **Usage:** Hover tooltips for helpful hints, icon button explanations
    - **Sub-components:** Tooltip, TooltipTrigger, TooltipContent, TooltipProvider
    - **Used in:** Not currently used in application (recommended for form fields, icon buttons, table headers)
19. **Skeleton** (`@/components/ui/skeleton`)
    - **Status:** ✅ Installed (not actively used)
    - **Usage:** Loading state placeholders for content
    - **Features:** Animated pulse effect, customizable dimensions
    - **Used in:** Not currently used in application (recommended for SourceTable, EntityList, detail view loading states)
20. **Switch** (`@/components/ui/switch`)
    - **Status:** ✅ Installed (not actively used)
    - **Usage:** Toggle switches for boolean preferences, feature flags
    - **Features:** Accessible keyboard navigation, smooth animations
    - **Used in:** Not currently used in application (recommended for Settings view theme toggle, integration enable/disable)
21. **Collapsible** (`@/components/ui/collapsible`)
    - **Status:** ✅ Installed (not actively used)
    - **Usage:** Expandable/collapsible sections for advanced options
    - **Sub-components:** Collapsible, CollapsibleTrigger, CollapsibleContent
    - **Used in:** Not currently used in application (recommended for SourceDetail advanced sections, EntityDetail provenance, filter panels)

#### Inspector-Native Composites

22. **DataTable** (`@/components/ui/data-table`)
    - **Status:** ✅ Active (Inspector only)
    - **Usage:** Canonical TanStack-backed table shell for Inspector index/list pages.
    - **Features:** Shared table chrome, row selection, column visibility, custom cell rendering.
    - **Link style:** Row links are neutral foreground by default and shift to primary/underline on hover or focus. Avoid always-blue `text-primary` links in repetitive index-table cells.
    - **Used in:** Entity, search, source, observation, relationship, schema, issue, peer, and subscription index pages.
23. **CopyableCodeBlock** (`@/components/ui/copyable_code_block`)
    - **Status:** ✅ Active (Inspector only)
    - **Usage:** Canonical copy-to-clipboard surface for any snippet a user can paste or run (CLI, config, JSON, agent activation prompts).
    - **Props:** `code` (required), `variant` (`code` | `prompt`, default `code`), `copyAriaLabel`, `className`, `preClassName`, `footer`
    - **Used in:** `ActivateCard` on the home page, `DesignCodeReferencePanel` (`/design?tab=code`)
    - **Rule:** Do not introduce bespoke `<pre>` + clipboard `<Button>` pairs in feature code. Evolve `CopyableCodeBlock` (e.g. add a `variant` prop) if a new visual treatment is needed. See `docs/ui/inspector_shadcn_rules.mdc` for the design-system reconciliation contract.
24. **SegmentedControl** (`@/components/shared/segmented_control`)
    - **Status:** ✅ Active (Inspector only)
    - **Usage:** Canonical segmented filter/control shell built on shadcn `ToggleGroup` for single- or multi-value filters.
    - **Used in:** Activity type filters, Conversations activity range filters, Graph layout selection, and `/design` segmented-control examples.
    - **Rule:** Use for segmented filters and compact mode controls. Use `Tabs` only when switching between distinct content panels.
25. **FiltersCard** (`@/components/shared/filters_card`)
    - **Status:** ✅ Active (Inspector only)
    - **Usage:** Titled `Card` shell used at the top of index pages to group filter controls. Header on a muted strip with title, optional description, optional right-aligned `headerEnd` (badges / shortcut menus); `children` slot for the controls; optional `footer` slot (typically `<ActiveFilterBadges divider />`).
    - **Used in:** Activity (`recent_activity.tsx`), Issues (`issues.tsx`), Sources (`sources.tsx`), and `/design?tab=patterns` index-page primitive specimens.
    - **Rule:** Use for the primary filter region on any index/list page. Compose with `SegmentedControl`, `MobileFilterPopover`, and `ActiveFilterBadges`.
26. **ListSurface** (`@/components/shared/list_surface`)
    - **Status:** ✅ Active (Inspector only)
    - **Usage:** Content `Card` that wraps a list/feed/table body together with its loading skeleton (`loading` + optional `loadingNode`), error alert (`error` + `errorTitle`), empty state (`isEmpty` + `emptyMessage`), and pagination footer (`footer`). Header carries title, a dynamic `description` (active filter summary), and an optional right-aligned `headerEnd`.
    - **Used in:** Activity, Issues, Sources, and `/design?tab=patterns` index-page primitive specimens.
    - **Rule:** Use as the canonical surface for index-page bodies. Move loading/error/empty placements inside the surface so all states render with the same chrome.
27. **ActiveFilterBadges** (`@/components/shared/active_filter_badges`)
    - **Status:** ✅ Active (Inspector only)
    - **Usage:** Helper row that renders outline `Badge` chips summarising active filters. Accepts either a single `values` list (unlabeled, like Activity) or labeled `groups` (Issues, Sources). Pass `divider` to render the top border + padding inside a `FiltersCard` footer.
    - **Used in:** Activity, Issues, Sources, and `/design?tab=patterns` index-page primitive specimens.
    - **Rule:** Use to surface "what is currently filtered" beneath filter controls. Renders nothing when no filters are active.
28. **MobileFilterPopover** (`@/components/shared/mobile_filter_popover`)
    - **Status:** ✅ Active (Inspector only)
    - **Usage:** Narrow-viewport alternative to a `SegmentedControl` for multi-select or single-select filters. Outline trigger button with optional counter badge; popover body is a checkbox list with optional helper descriptions and an optional select-all action.
    - **Used in:** Activity (`hidden md:flex` / `md:hidden` pair), Issues, and `/design?tab=patterns` index-page primitive specimens.
    - **Rule:** Place behind a responsive container so the desktop `SegmentedControl` and the mobile popover share state on the same filter axis.

#### Status / Chart Color Tokens

The Inspector palette declares a small status and chart token family in `inspector/src/index.css`. Tailwind exposes each family as a first-class utility (`text-success`, `bg-warning/10`, `border-destructive/30`, `fill-[hsl(var(--chart-1))]`, …) via the extended `colors` map in `inspector/tailwind.config.mjs`.

**Status tokens** (each has a `:root` light value and a `.dark` override hand-tuned for ≥3:1 contrast against the dark slate canvas):

- **`--destructive` / `--destructive-foreground`** — `text-destructive`, `bg-destructive`. Errors, failed health checks, destructive confirmation surfaces.
- **`--success` / `--success-foreground`** — `text-success`, `bg-success`. Healthy status, success toasts, "copied" feedback, boolean `true`.
- **`--warning` / `--warning-foreground`** — `text-warning`, `bg-warning`. Caution states, raw-fragment markers, throttle/risk indicators.

Use the matching `Badge` variant when the surface is a pill (`variant="secondary"`, `variant="outline"`, `variant="destructive"`); use the bare token utilities for inline icon tints, dot indicators, or short prose status copy.

**Chart tokens** — shadcn-canonical categorical palette, used sequentially per series:

- **`--chart-1`** — Primary blue. Default for the first series in a chart.
- **`--chart-2`** — Green. Second series.
- **`--chart-3`** — Amber. Third series.
- **`--chart-4`** — Plum. Fourth series.
- **`--chart-5`** — Coral. Fifth series.

Reference as `fill="hsl(var(--chart-1))"` / `stroke="hsl(var(--chart-1))"` inside Recharts components (axes, grids, and tooltips continue to use `--border`, `--muted-foreground`, and `--popover`). Light values target a ~4.5:1 contrast vs. the warm cream surface; dark overrides brighten each hue so series fills stay legible against the deep-slate dark surface.

When a feature genuinely needs a status / chart hue the token registry does not cover, raise the gap rather than reintroducing raw Tailwind palette classes; the token registry should grow before any component leaks a hex value.

## Component Usage Guidelines
### When to Use Select vs DropdownMenu
**Use Select (`@/components/ui/select`):**
- Single value selection from a list
- Form inputs (locale, type filter, etc.)
- When you need a controlled value with placeholder
- When the selection is the primary action
**Use DropdownMenu (`@/components/ui/dropdown-menu`):**
- Context menus (row actions, column visibility)
- Multiple selections (checkboxes)
- Radio button groups
- Actions that don't require a selected value display
- When you need more complex menu structures
### Migration from Native HTML Elements
**Replace native `<select>` with shadcn Select:**
```tsx
// ❌ Don't use
<select className="...">
  <option>Value</option>
</select>
// ✅ Use instead
<Select>
  <SelectTrigger>
    <SelectValue placeholder="Select..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="value">Value</SelectItem>
  </SelectContent>
</Select>
```
## Components Not Yet Installed (Potential Additions)
The following shadcn/ui components are available but not yet installed. Consider adding them if needed:
1. **Checkbox** - For checkbox inputs (currently using native checkboxes in SourceTable)
2. **Alert** - For alert messages and banners
3. **Popover** - For popover content and date picker integration
4. **Calendar** - For date pickers and date range filters
5. **Accordion** - For collapsible content sections
6. **Slider** - For range inputs
7. **Radio Group** - For radio button groups
8. **Avatar** - For user avatars
9. **Command** - For command palette
10. **Context Menu** - For right-click context menus
11. **Hover Card** - For hover cards
12. **Menubar** - For menu bars
13. **Navigation Menu** - For navigation menus
14. **Pagination** - For pagination controls
15. **Resizable** - For resizable panels
16. **Toggle** - For toggle buttons
17. **Toggle Group** - For toggle button groups
## Integration Recommendations
### High Priority Components (Already Installed - Ready to Use)
1. **Progress** - Integrate into FileUploadView for upload progress, ingestion processing states
2. **Skeleton** - Use in SourceTable, EntityList, ObservationList loading states instead of spinners
3. **Switch** - Use in Settings view for theme toggle, integration enable/disable
4. **Tooltip** - Add to form fields, icon buttons, table headers for helpful hints
5. **Collapsible** - Use in SourceDetail and EntityDetail for expandable sections (raw text, provenance, raw fragments)

### High Priority Components (Not Installed - Should Add)
1. **Checkbox** - Replace native checkboxes in SourceTable and EntityList row selection
2. **Alert** - Add for error messages, notifications, system status banners
### Medium Priority Components (Not Installed - Consider Adding)
1. **Popover** - For additional information on hover/click, date picker integration, contextual help
2. **Calendar** - For date range filters in SourceTable and EntityList, timeline date selection
### Low Priority Components (Not Installed - Future Consideration)
1. **Accordion** - For FAQ sections, collapsible help content
2. **Slider** - For numeric range inputs (amount filters, zoom controls)
3. **Radio Group** - For single-select options (view mode, preferences)
4. **Command** - For command palette (if implementing keyboard-first navigation)
5. **Avatar** - For user avatars (if implementing user profiles)
## Design System Alignment
All shadcn/ui components should:
- Use Inter font for UI text
- Use JetBrains Mono for monospace (where applicable)
- Follow design system color palette
- Match spacing scale (4px, 8px, 16px, etc.)
- Support dark mode
- Meet WCAG AA accessibility standards
## References
- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [Radix UI Primitives](https://www.radix-ui.com/)
- `docs/ui/design_system.md` - Design system specifications
