# Design System Update Summary

**Date:** 2026-01-23  
**Task:** Review shadcn components and update design system to align with canonical terminology

## Changes Completed

### 1. Terminology Updates

**Files Updated:**
- `docs/ui/design_system.md`
- `docs/ui/shadcn_components.md`
- `docs/ui/prototype_guide.md`
- `docs/ui/patterns/detail.md`
- `docs/ui/dsl_spec.md`
- `frontend/src/components/StyleGuide.tsx`

**Terminology Replacements:**
- "Record IDs" → "Source IDs", "Entity IDs", "Observation IDs" (context-dependent)
- "Record list" → "Source list", "Entity list"
- "Record detail" → "Source detail", "Entity detail"
- "Record type" → "Entity type"
- "No records yet" → "No sources yet", "No entities yet"
- "Recent records" → "Recent sources", "Recent entities"
- "Record count" → "Source count", "Entity count", "Observation count"
- "rec_abc123" → "src_abc123" (in examples)
- "FinancialRecord" → "invoice" (canonical entity type)
- "IdentityDocument" → "document" (canonical entity type)
- "TravelDocument" → "travel" (canonical entity type)

**Total Updates:** 40+ references replaced across 6 files

### 2. shadcn Component Documentation

**Documented Previously Undocumented Components:**
- **Tabs** - Now documented as ✅ Active (used in EntityDetail and SourceDetail)
- **Progress** - Documented as installed but not used (recommended for FileUploadView)
- **Tooltip** - Documented as installed but not used (recommended for form fields, icon buttons)
- **Skeleton** - Documented as installed but not used (recommended for loading states)
- **Switch** - Documented as installed but not used (recommended for Settings view)
- **Collapsible** - Documented as installed but not used (recommended for detail sections)

**Updated Component References:**
- Button: SourceTable, EntityList (was RecordsTable)
- Input: SourceTable (search), EntityList (search) (was RecordsTable)
- Badge: SourceTable, EntityList (was RecordsTable)
- Table: SourceTable, EntityList, ObservationList (was RecordsTable)
- Select: SourceTable (type filter), EntityList (type filter)
- Dropdown Menu: SourceTable (column visibility), EntityList
- Sheet: Mobile navigation sidebar (was RecordsTable)
- Toast: SourceDetail, EntityDetail (was RecordDetailsPanel)

### 3. StyleGuide.tsx Enhancements

**New Component Examples Added:**
1. **Tabs** - Full example with EntityDetail use case (Snapshot, Observations, Relationships, Timeline tabs)
2. **Progress** - File upload progress examples with multiple progress bars
3. **Skeleton** - Loading state examples for tables and cards
4. **Switch** - Settings toggles examples (Dark Mode, Email Notifications, Auto-Enhancement)
5. **Tooltip** - Form field tooltips, icon button tooltips, help text examples
6. **Collapsible** - Expandable sections for Advanced Options and Provenance Details

**Updated Examples:**
- Table examples now use `src_` prefixes instead of `rec_`
- Entity type badges use canonical types (invoice, document, travel)
- Search placeholders updated to "Search sources..." and "Search entities..."
- Empty states updated to "No sources yet"
- Loading states updated to "Loading sources"
- Dashboard widgets updated to "Total Sources" instead of "Total Records"

### 4. Design System Architecture Alignment

**Updated Content Structure Section:**
- **Source List (SourceTable component)** - Table layout, sortable columns, displays sources
- **Entity List (EntityList component)** - Table layout, entity type badges, canonical name
- **Source Detail (SourceDetail component)** - Tabs for Source info, Interpretations, Observations, Entities
- **Entity Detail (EntityDetail component)** - Tabs for Snapshot, Schema, Sources, Interpretations, Timeline, Observations, Relationships
- **Observation List (ObservationList component)** - Table showing observations with entity type and source references

**Updated UI Patterns:**
- Timeline View: "Click event → navigate to source detail" (was "source record")
- Entity Explorer: "observation count" (was "record count"), "shows entity snapshot, observations, relationships" (was "linked records")
- Dashboard Widgets: "Recent Sources Widget" (was "Recent Records Widget")
- Empty States: "No sources yet" (was "No records yet")
- Loading States: "Source list loading", "Entity list loading" (was "Record list loading")

### 5. Four-Layer Truth Model Integration

All examples now reflect the four-layer truth model:
1. **Source** - Raw data (files, structured JSON, URLs)
2. **Interpretation** - Versioned AI extraction attempt
3. **Observation** - Granular facts extracted from source
4. **Entity Snapshot** - Deterministic reducer output (current truth)

**Component References Updated:**
- SourceTable displays sources
- SourceDetail shows source → interpretations → observations → entities flow
- EntityDetail shows entity snapshot → observations → provenance → relationships
- ObservationList shows observations with source and interpretation links

## Validation

**TypeScript Compilation:** ✅ Passed  
**Linter Errors:** ✅ Fixed (quote consistency errors resolved)  
**Terminology Compliance:** ✅ All references align with `docs/vocabulary/canonical_terms.md`  
**Component Documentation:** ✅ All 21 installed components documented  
**StyleGuide Examples:** ✅ All underutilized components now have examples  

## Components Status Summary

### Active Components (15)
Button, Input, Label, Card, Badge, Table, Separator, Select, Dropdown Menu, Dialog, Sheet, Textarea, Toast, Tabs (newly documented)

### Installed but Not Used (6)
Scroll Area, Input Group, Progress, Tooltip, Skeleton, Switch, Collapsible

### Recommended Additions (2 High Priority)
1. Checkbox - Replace native checkboxes in SourceTable, EntityList
2. Alert - Error states, notifications, banners

### Future Considerations (Medium/Low Priority)
Popover, Calendar, Accordion, Slider, Radio Group, Avatar, Command, Context Menu, Hover Card, Menubar, Navigation Menu, Pagination, Resizable, Toggle, Toggle Group

## Next Steps

1. **Integrate Progress component** - Add to FileUploadView for upload progress tracking
2. **Integrate Skeleton component** - Replace loading spinners in SourceTable, EntityList, detail views
3. **Integrate Switch component** - Add to Settings view for theme toggle and feature flags
4. **Integrate Tooltip component** - Add to form fields and icon-only buttons
5. **Integrate Collapsible component** - Add to SourceDetail and EntityDetail for expandable sections
6. **Install Checkbox component** - Replace native checkboxes in table row selection
7. **Install Alert component** - Add for error states and notifications

## Canonical Terminology Compliance

All documentation now uses canonical terminology from `docs/vocabulary/canonical_terms.md`:
- ✅ Source (not record, not document)
- ✅ Entity (not object, not item)
- ✅ Observation (not fact, not datum)
- ✅ Entity Snapshot (not current state, not merged data)
- ✅ Entity Type (not record type, not schema type)
- ✅ Interpretation (not interpretation run, not analysis)
- ✅ Entity Schema (not schema, not capability, not record type)

## Design System Integration Guidelines

All component integrations must follow:
- **Color alignment** - Use design system CSS variables
- **Typography alignment** - Inter for UI, JetBrains Mono for code/data
- **Spacing alignment** - 4px grid system
- **Dark mode support** - All components support dark theme
- **Accessibility** - WCAG AA compliance, keyboard navigation, focus indicators
