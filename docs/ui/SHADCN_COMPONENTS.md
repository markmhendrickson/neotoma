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
   - **Used in:** RecordsTable, StyleGuide, ChatPanel, all major components

2. **Input** (`@/components/ui/input`)

   - **Status:** ✅ Active
   - **Usage:** Text inputs, search fields, form inputs
   - **Features:** Focus states, disabled states, error states
   - **Used in:** RecordsTable (search), StyleGuide, ChatPanel, forms

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
   - **Used in:** RecordsTable (type badges), StyleGuide, entity displays

6. **Table** (`@/components/ui/table`)

   - **Status:** ✅ Active
   - **Usage:** High-density data tables, record lists
   - **Sub-components:** TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter, TableCaption
   - **Used in:** RecordsTable (primary usage), StyleGuide

7. **Separator** (`@/components/ui/separator`)

   - **Status:** ✅ Active
   - **Usage:** Visual dividers, section separators
   - **Used in:** StyleGuide, forms, content sections

8. **Select** (`@/components/ui/select`)

   - **Status:** ✅ Active
   - **Usage:** Dropdown selects, type filters, locale selectors
   - **Sub-components:** SelectTrigger, SelectValue, SelectContent, SelectItem, SelectLabel, SelectSeparator
   - **Used in:** StyleGuide (type filter, locale selector), should be used throughout app instead of native select

9. **Dropdown Menu** (`@/components/ui/dropdown-menu`)

   - **Status:** ✅ Active
   - **Usage:** Context menus, column visibility toggles, row actions
   - **Sub-components:** DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator
   - **Used in:** RecordsTable (column visibility, row actions), StyleGuide

10. **Dialog** (`@/components/ui/dialog`)

    - **Status:** ✅ Active
    - **Usage:** Modal dialogs, confirmations, forms
    - **Sub-components:** DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
    - **Used in:** KeyManagementDialog (key import/export/regenerate)

11. **Sheet** (`@/components/ui/sheet`)

    - **Status:** ✅ Active
    - **Usage:** Slide-out panels, sidebars, detail views
    - **Sub-components:** SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription
    - **Used in:** RecordsTable (record details), RecordDetailsPanel

12. **Textarea** (`@/components/ui/textarea`)

    - **Status:** ✅ Active
    - **Usage:** Multi-line text input, chat message input
    - **Used in:** ChatPanel (message input with auto-resize)

13. **Toast** (`@/components/ui/toast`)

    - **Status:** ✅ Active
    - **Usage:** Notifications, success/error messages, user feedback
    - **Sub-components:** Toaster, useToast hook
    - **Used in:** App.tsx (file upload notifications), KeyManagementDialog (key operations), RecordDetailsPanel (file operations)

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

1. **Popover** - For tooltips and popover content
2. **Tooltip** - For hover tooltips
3. **Alert** - For alert messages and banners
4. **Accordion** - For collapsible content sections
5. **Tabs** - For tabbed interfaces
6. **Slider** - For range inputs
7. **Switch** - For toggle switches
8. **Checkbox** - For checkbox inputs (currently using native)
9. **Radio Group** - For radio button groups
10. **Progress** - For progress indicators
11. **Skeleton** - For loading states
12. **Avatar** - For user avatars
13. **Calendar** - For date pickers
14. **Command** - For command palette
15. **Context Menu** - For right-click context menus
16. **Hover Card** - For hover cards
17. **Menubar** - For menu bars
18. **Navigation Menu** - For navigation menus
19. **Pagination** - For pagination controls
20. **Popover** - For popover content
21. **Progress** - For progress bars
22. **Radio Group** - For radio buttons
23. **Resizable** - For resizable panels
24. **Switch** - For toggle switches
25. **Tabs** - For tabbed interfaces
26. **Toggle** - For toggle buttons
27. **Toggle Group** - For toggle button groups

## Recommendations

### High Priority Additions

1. **Checkbox** - Replace native checkboxes in table row selection
2. **Switch** - For settings toggles (theme, features)
3. **Alert** - For error messages and notifications
4. **Progress** - For upload progress, loading states
5. **Skeleton** - For loading states (better UX than spinners)

### Medium Priority Additions

1. **Tabs** - For settings pages, multi-section views
2. **Tooltip** - For helpful hints and explanations
3. **Popover** - For additional information on hover
4. **Calendar** - For date range filters in tables

### Low Priority Additions

1. **Accordion** - For collapsible sections
2. **Slider** - For numeric range inputs
3. **Command** - For command palette (if implementing)

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
