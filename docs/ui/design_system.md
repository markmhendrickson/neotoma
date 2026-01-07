# Neotoma Design System
*(Styles Based on Brand Needs and Tier 1 ICP Aesthetic Preferences)*
## Tier 1 ICP Aesthetic Analysis
### Apps Used by Tier 1 ICPs
**AI-Native Individual Operators:**
- **ChatGPT/Claude:** Clean, minimal interfaces; neutral grays with subtle accents; high information density; monospace for code; dark mode preference
- **Cursor:** Developer-focused; dark themes; monospace typography; minimal chrome; functional over decorative
- **Raycast:** System-native feel; macOS design language; subtle shadows; high contrast; keyboard-first
**High-Context Knowledge Workers:**
- **Research tools (Zotero, Mendeley):** Academic aesthetic; structured layouts; high information density; neutral color palettes; professional typography
- **Legal platforms (Westlaw, LexisNexis):** Conservative design; high contrast; table-heavy layouts; minimal decoration; trust-focused
- **Consulting software:** Data-forward; chart-heavy; professional blue accents; structured grids; information hierarchy
**AI-Native Founders:**
- **GitHub:** Dark themes; monospace code; minimal UI; functional aesthetics
- **Notion:** Clean, spacious; neutral grays; subtle borders; content-first
- **Linear:** Modern, minimal; high contrast; fast animations; developer aesthetic
### Common Aesthetic Patterns
1. **Color:** Neutral grays dominate; blue accents for trust/action; minimal color palette
2. **Typography:** Sans-serif for UI; monospace for data/code; clear hierarchy; readable sizes
3. **Density:** Information-dense layouts; comfortable spacing; no wasted space
4. **Decorative elements:** Minimal; functional borders; subtle shadows; no illustrations
5. **Dark mode:** Strong preference; professional dark themes; high contrast
6. **Motion:** Subtle, fast transitions; no playful animations; functional feedback only
## Recommended Design System
### 1. Color Palette
#### 1.1 Base Colors
**Light Mode:**
```yaml
background:
  primary: "#FFFFFF"      # Pure white for main canvas
  secondary: "#F9FAFB"    # Subtle gray for cards/sections
  tertiary: "#F3F4F6"     # Hover states, subtle backgrounds
foreground:
  primary: "#111827"      # Near-black for primary text (high contrast)
  secondary: "#6B7280"   # Medium gray for secondary text
  tertiary: "#9CA3AF"    # Light gray for tertiary text, placeholders
  muted: "#D1D5DB"        # Borders, dividers
```
**Dark Mode:**
```yaml
background:
  primary: "#0F172A"      # Deep slate (similar to Cursor/GitHub dark)
  secondary: "#1E293B"    # Slightly lighter for cards
  tertiary: "#334155"     # Hover states, subtle backgrounds
foreground:
  primary: "#F1F5F9"      # Near-white for primary text
  secondary: "#94A3B8"    # Medium gray for secondary text
  tertiary: "#64748B"     # Light gray for tertiary text
  muted: "#475569"        # Borders, dividers
```
#### 1.2 Semantic Colors
**Primary (Trust/Action):**
```yaml
light:
  primary: "#0066CC"      # Professional blue (matches existing)
  primary_hover: "#0052A3"
  primary_foreground: "#FFFFFF"
dark:
  primary: "#3B82F6"      # Brighter blue for dark mode visibility
  primary_hover: "#2563EB"
  primary_foreground: "#FFFFFF"
```
**Status Colors:**
```yaml
success: "#10B981"        # Green (matches existing)
error: "#EF4444"          # Red (matches existing)
warning: "#F59E0B"        # Amber (matches existing)
info: "#3B82F6"           # Blue (matches primary)
```
**Status Colors (Dark Mode):**
```yaml
success: "#22C55E"        # Brighter green for dark mode
error: "#F87171"          # Softer red for dark mode
warning: "#FBBF24"       # Brighter amber
info: "#60A5FA"          # Lighter blue
```
#### 1.3 Data Visualization Colors
**Entity Type Colors (Subtle, Distinguishable):**
```yaml
person: "#6366F1"         # Indigo
company: "#8B5CF6"        # Purple
location: "#EC4899"       # Pink
event: "#F59E0B"          # Amber
document: "#10B981"       # Green
```
**Use sparingly:** Only for entity badges, timeline markers, graph nodes. Never for primary UI elements.
#### 1.4 Border and Divider Colors
```yaml
light:
  border: "#E5E7EB"       # Subtle gray borders
  divider: "#D1D5DB"      # Slightly darker for dividers
dark:
  border: "#334155"       # Subtle slate borders
  divider: "#475569"      # Slightly lighter for dividers
```
### 2. Typography
#### 2.1 Font Families
**Primary (UI):**
```yaml
sans_serif: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
```
- **Rationale:** Inter is widely used in professional tools (Linear, Notion, GitHub); excellent readability; neutral aesthetic
**Monospace (Data/Code):**
```yaml
monospace: "'JetBrains Mono', 'Fira Code', 'Roboto Mono', 'Courier New', monospace"
```
- **Rationale:** JetBrains Mono preferred by developers; Fira Code for ligatures; fallbacks for system fonts
#### 2.2 Type Scale
**Headings:**
```yaml
h1:
  font_size: "2rem"       # 32px
  font_weight: "700"
  line_height: "1.2"
  letter_spacing: "-0.02em"
h2:
  font_size: "1.5rem"     # 24px
  font_weight: "600"
  line_height: "1.3"
  letter_spacing: "-0.01em"
h3:
  font_size: "1.25rem"     # 20px
  font_weight: "600"
  line_height: "1.4"
h4:
  font_size: "1rem"       # 16px
  font_weight: "600"
  line_height: "1.5"
```
**Body:**
```yaml
body:
  font_size: "0.9375rem"  # 15px (slightly smaller for density)
  font_weight: "400"
  line_height: "1.6"
body_large:
  font_size: "1rem"       # 16px
  font_weight: "400"
  line_height: "1.6"
small:
  font_size: "0.8125rem"  # 13px
  font_weight: "400"
  line_height: "1.5"
```
**Monospace (Data Display):**
```yaml
mono:
  font_size: "0.875rem"   # 14px
  font_weight: "400"
  line_height: "1.5"
  letter_spacing: "0"
```
#### 2.3 Typography Usage
- **Headings:** Use sparingly; only for major sections
- **Body:** Default for all UI text; comfortable reading size
- **Small:** Metadata, timestamps, labels, secondary information
- **Monospace:** Record IDs, entity IDs, timestamps, code snippets, extracted field values
### 3. Spacing and Layout
#### 3.1 Spacing Scale
```yaml
spacing:
  xs: "0.25rem"    # 4px
  sm: "0.5rem"     # 8px
  md: "1rem"       # 16px
  lg: "1.5rem"     # 24px
  xl: "2rem"       # 32px
  "2xl": "3rem"    # 48px
  "3xl": "4rem"    # 64px
```
**Usage:**
- **xs:** Tight spacing (icon + text, inline elements)
- **sm:** Component internal padding, small gaps
- **md:** Standard spacing (between sections, component padding)
- **lg:** Section spacing, card padding
- **xl:** Major section separation
- **2xl/3xl:** Page-level spacing
#### 3.2 Layout Density
**Default: Comfortable**
```yaml
comfortable:
  row_height: "40px"           # Table rows, list items
  component_padding: "8px 12px" # Buttons, inputs
  section_spacing: "1.5rem"     # Between sections
  card_padding: "1rem"          # Card internal padding
```
**Compact (Optional):**
```yaml
compact:
  row_height: "32px"
  component_padding: "6px 10px"
  section_spacing: "1rem"
  card_padding: "0.75rem"
```
**Rationale:** Comfortable density matches professional tools (Zotero, legal platforms); allows information density without feeling cramped.
#### 3.3 Grid System
```yaml
grid:
  columns: 12
  gutter: "1rem"              # 16px between columns
  container_max_width: "1280px" # Max content width
  breakpoints:
    mobile: "640px"
    tablet: "768px"
    desktop: "1024px"
    wide: "1280px"
```
### 4. Component Styles
#### 4.1 Buttons
**Primary:**
```yaml
primary:
  background: "primary_color"
  color: "white"
  padding: "8px 16px"
  height: "40px"
  border_radius: "6px"
  font_weight: "500"
  font_size: "0.9375rem"
  transition: "all 150ms ease-in-out"
  
  hover:
    background: "primary_hover"
    transform: "translateY(-1px)"  # Subtle lift
    box_shadow: "0 2px 4px rgba(0,0,0,0.1)"
  
  active:
    transform: "translateY(0)"
    box_shadow: "none"
  
  disabled:
    opacity: "0.5"
    cursor: "not-allowed"
```
**Secondary:**
```yaml
secondary:
  background: "transparent"
  color: "primary_color"
  border: "1px solid currentColor"
  padding: "8px 16px"
  height: "40px"
  border_radius: "6px"
  font_weight: "500"
  
  hover:
    background: "primary_color / 0.1"  # 10% opacity
```
**Ghost (Tertiary):**
```yaml
ghost:
  background: "transparent"
  color: "foreground_secondary"
  padding: "6px 12px"
  height: "auto"
  
  hover:
    background: "background_tertiary"
    color: "foreground_primary"
```
#### 4.2 Inputs
```yaml
input:
  height: "40px"
  padding: "8px 12px"
  border: "1px solid border_color"
  border_radius: "6px"
  background: "background_primary"
  color: "foreground_primary"
  font_size: "0.9375rem"
  transition: "border-color 150ms ease-in-out"
  
  focus:
    border_color: "primary_color"
    outline: "2px solid primary_color / 0.2"
    outline_offset: "2px"
  
  disabled:
    background: "background_secondary"
    color: "foreground_tertiary"
    cursor: "not-allowed"
  
  error:
    border_color: "error_color"
```
#### 4.3 Tables
```yaml
table:
  width: "100%"
  border_collapse: "separate"
  border_spacing: "0"
  
  header:
    background: "background_secondary"
    font_weight: "600"
    font_size: "0.8125rem"
    text_transform: "uppercase"
    letter_spacing: "0.05em"
    color: "foreground_secondary"
    padding: "12px 16px"
    border_bottom: "2px solid border_color"
  
  row:
    height: "40px"
    border_bottom: "1px solid border_color"
    
    hover:
      background: "background_tertiary"
  
  cell:
    padding: "12px 16px"
    font_size: "0.9375rem"
```
#### 4.3.1 Table Functionality (Required for Tier 1 ICPs)
**Sorting:**
- Clickable column headers with sort indicators (ArrowUpDown, ArrowUp, ArrowDown icons)
- Multi-column sorting support (optional, for advanced use cases)
- Sort state persistence (optional, via localStorage)
- Visual indicators: Icon shows current sort direction (asc/desc) or unsorted state
- Sort button styling: Ghost variant, small size, no border on hover
**Column Management:**
- Column visibility toggle (show/hide columns via dropdown menu)
- Column reordering (drag-and-drop column headers)
- Column width resizing (drag column borders to resize)
- Column state persistence (visibility, order, widths saved to localStorage)
- Column menu: Dropdown with visibility checkboxes, reset options
**Search and Filtering:**
- Global search input (full-text search across all visible columns)
- Type filter dropdown (filter by record type)
- Search placeholder: "Search records..."
- Filter state: Clear visual indication of active filters
- Clear filters button (when filters active)
**Pagination:**
- Load more button (infinite scroll pattern preferred for high-density)
- Display count: "Showing X of Y records"
- Pagination controls (optional, for very large datasets)
**Row Interactions:**
- Row selection (checkbox column for bulk actions)
- Row click → navigate to detail view
- Row hover: Subtle background change (background_tertiary)
- Row actions: Dropdown menu per row (view, delete, etc.)
- Keyboard navigation: Arrow keys, Enter to select, Space to toggle selection
**Table Controls:**
- Column visibility menu (dropdown with checkboxes)
- Reset columns button (restore default visibility/order/widths)
- Export options (optional, CSV/JSON export)
**Accessibility:**
- ARIA labels for sort buttons
- Keyboard navigation support
- Screen reader announcements for sort changes
- Focus indicators on interactive elements
**Rationale:** Tier 1 ICPs (especially High-Context Knowledge Workers) expect professional table functionality matching legal platforms (Westlaw, LexisNexis) and research tools (Zotero, Mendeley). These tools provide high-density, sortable, filterable table interfaces for managing large document collections.
**Tier 1 ICP Expectations:**
- **High-Context Knowledge Workers:** Work with hundreds of documents across multiple projects. Require sortable, filterable tables to manage information overload. Expect column management (visibility, reordering) and advanced search capabilities.
- **AI-Native Individual Operators:** Expect developer-friendly interfaces with keyboard navigation, efficient data inspection, and customizable layouts.
- **AI-Native Founders:** Expect modern, functional interfaces with fast interactions and professional appearance matching tools like Linear and GitHub.
**Implementation Status:**
- ✅ Sorting (multi-column, ascending/descending with visual indicators)
- ✅ Column visibility (show/hide via dropdown menu)
- ✅ Column reordering (drag-and-drop)
- ✅ Column width resizing
- ✅ Global search (full-text across visible columns)
- ✅ Type filtering (dropdown filter)
- ✅ Row selection (checkbox column)
- ✅ Row actions (dropdown menu per row)
- ✅ State persistence (localStorage for column state)
- ✅ Keyboard navigation (arrow keys, Enter, Space)
#### 4.4 Cards
```yaml
card:
  background: "background_primary"
  border: "1px solid border_color"
  border_radius: "8px"
  padding: "1rem"
  box_shadow: "0 1px 3px rgba(0,0,0,0.1)"  # Subtle shadow
  
  hover:
    box_shadow: "0 4px 6px rgba(0,0,0,0.1)"  # Slightly more on hover
    border_color: "border_color (slightly darker)"
```
#### 4.5 Badges/Tags
```yaml
badge:
  display: "inline-flex"
  align_items: "center"
  padding: "4px 8px"
  border_radius: "4px"
  font_size: "0.8125rem"
  font_weight: "500"
  
  variants:
    default:
      background: "background_tertiary"
      color: "foreground_secondary"
    
    primary:
      background: "primary_color / 0.1"
      color: "primary_color"
    
    success:
      background: "success_color / 0.1"
      color: "success_color"
    
    error:
      background: "error_color / 0.1"
      color: "error_color"
```
### 5. Visual Hierarchy
#### 5.1 Information Density
**Principle:** High information density without clutter.
**Techniques:**
- Clear visual grouping (borders, spacing)
- Consistent alignment (left-align text, right-align numbers)
- Typography hierarchy (size, weight, color)
- Subtle backgrounds for sections
- Minimal decoration
#### 5.2 Content Structure
**Record List:**
- Table layout (high density)
- Sortable columns
- Row hover states
- Clear column headers
**Record Detail:**
- Card-based sections
- Clear section headers (h3)
- Metadata in monospace
- Extracted fields in structured layout
**Timeline:**
- Chronological list
- Date markers (subtle)
- Event type badges
- Source record links
### 6. Dark Mode
#### 6.1 Dark Mode Strategy
**Default:** System preference (respects `prefers-color-scheme`)
**Manual Toggle:** User can override system preference
**Rationale:** Tier 1 ICPs (especially developers, AI-native users) strongly prefer dark mode.
#### 6.2 Dark Mode Adjustments
**Color Adjustments:**
- Brighter foreground colors for readability
- Softer backgrounds (not pure black)
- Adjusted border colors for visibility
- Brighter semantic colors (status colors)
**Contrast:**
- Maintain WCAG AA contrast ratios
- Test all color combinations in dark mode
- Ensure focus indicators are visible
### 7. Motion and Animation
#### 7.1 Animation Principles
**Minimal, Fast, Functional:**
- No decorative animations
- Fast transitions (150-300ms)
- Functional feedback only
- Respect `prefers-reduced-motion`
#### 7.2 Transition Timing
```yaml
transitions:
  fast: "150ms"        # Hover states, button feedback
  normal: "200ms"      # Color changes, opacity
  slow: "300ms"        # Layout changes, page transitions
easing:
  default: "ease-in-out"
  enter: "ease-out"    # Elements appearing
  exit: "ease-in"      # Elements disappearing
```
#### 7.3 Animation Usage
**Allowed:**
- Button hover/active states
- Input focus states
- Modal/dialog enter/exit
- Loading states (skeleton, spinner)
- Toast notifications
**Forbidden:**
- Decorative animations
- Playful transitions
- Excessive motion
- Auto-playing animations
### 8. Accessibility
#### 8.1 Contrast Requirements
**WCAG AA Minimum:**
- Normal text: 4.5:1 contrast ratio
- Large text (18px+): 3:1 contrast ratio
- UI components: 3:1 contrast ratio
**WCAG AAA Target (Where Possible):**
- Normal text: 7:1 contrast ratio
- Large text: 4.5:1 contrast ratio
#### 8.2 Focus Indicators
```yaml
focus:
  outline: "2px solid primary_color"
  outline_offset: "2px"
  border_radius: "4px"  # Match element border radius
```
**Rationale:** Clear, visible focus indicators are essential for keyboard navigation (strong preference in developer tools).
#### 8.3 Keyboard Navigation
- All interactive elements must be keyboard accessible
- Logical tab order
- Skip links for main content
- Keyboard shortcuts documented
### 9. Iconography
#### 9.1 Icon Style
**Recommended:** Lucide Icons or similar
- Minimal, line-based
- Consistent stroke width (1.5-2px)
- Neutral aesthetic
- Functional over decorative
#### 9.2 Icon Usage
- Use icons sparingly (not every label needs an icon)
- Consistent icon size (16px, 20px, 24px)
- Match icon color to text color hierarchy
- Provide ARIA labels for icon-only buttons
### 10. Data Visualization
#### 10.1 Timeline
**Visual Style:**
- Vertical line (subtle gray)
- Event markers (small circles, colored by type)
- Date labels (monospace, small)
- Event cards (subtle background, border)
**Timeline View (FU-303) Requirements:**
- Chronological event list (sorted by event_timestamp)
- Date grouping headers (day/month/year)
- Click event → navigate to source record
- Filter by date range (date picker)
- Filter by event type (badge filter)
- Virtualized scrolling for >100 events (react-window)
- Event type badges use entity type colors
- Source record links (monospace IDs)
#### 10.2 Entity Graph
**Visual Style:**
- Nodes: Circles with entity type color
- Edges: Subtle gray lines
- Labels: Small, readable
- Minimal decoration
**Entity Explorer (FU-601) Requirements:**
- Entity list view (table with entity type, canonical name, record count)
- Entity detail view (shows all linked records, relationships)
- Entity graph visualization (optional, minimal decoration)
- Click entity → see all related records
#### 10.3 Charts (Future)
**Style:**
- Minimal grid lines
- Subtle colors (not bright)
- Clear axis labels
- Data-first (no decoration)
#### 10.4 Dashboard Widgets (FU-305)
**Stats Widgets:**
- Card-based layout
- Large number (h2 size, bold)
- Label (small, muted)
- Icon (optional, subtle)
- Grid: 3-4 columns on desktop, 1-2 on mobile
**Recent Records Widget:**
- Compact list (5 items max)
- Click → navigate to record detail
- "View All" link
**Quick Actions:**
- Button group (primary actions)
- Upload, Search, View Timeline
### 11. Empty States
#### 11.1 Empty State Style
**Minimal Approach:**
- No illustrations (per brand constraints)
- Clear message text
- Action button (primary)
- Helpful secondary text
**Example:**
```
"No records yet"
"Upload your first document to get started"
[Upload Document Button]
```
#### 11.2 Empty State Variants
**No Records:**
- Message: "No records yet"
- CTA: "Upload your first document"
- Secondary: "Drag and drop files or click to browse"
**No Search Results:**
- Message: "No matches found"
- Secondary: "Try different search terms or filters"
- Clear filters button
**No Entities:**
- Message: "Entities will appear after upload"
- Secondary: "Upload documents to see people, companies, and locations"
**No Events:**
- Message: "Events will appear from dates in documents"
- Secondary: "Upload documents with dates to build your timeline"
### 12. Loading States
#### 12.1 Loading Indicators
**Skeleton Screens:**
- Match content layout
- Subtle gray background
- Pulse animation (subtle)
- Fast (avoid flash)
**Spinners:**
- Minimal, circular
- Primary color
- Small size (24px max)
#### 12.2 Processing Indicator (FU-401)
**Step-by-Step Progress:**
- Vertical list of steps
- Each step: Checkmark (✓) when complete, spinner when active, empty when pending
- Step labels: "Extracting text", "Detecting document type", "Extracting fields", etc.
- Overall progress: "Step 3 of 5"
- Live region for screen readers (aria-live="polite")
- Min display time: 1s (avoid flash)
- Timeout: 30s with error state
**Visual Style:**
- Steps: Left-aligned list
- Checkmark: Green (success color), 16px icon
- Spinner: Primary color, 16px
- Pending: Muted foreground, no icon
### 13. Error States
#### 13.1 Error Display
**Style:**
- Error icon (red)
- Clear error message
- Retry button (if applicable)
- Helpful secondary text
**Rationale:** Professional tools show errors clearly without being alarming.
#### 13.2 Error Boundary
**React Error Boundary:**
- Full-page error state
- Error message (technical, helpful)
- Reload button
- Report error link (optional)
#### 13.3 Upload Error States
**File Upload Errors:**
- Inline error below upload zone
- Specific error message ("File too large", "Unsupported format")
- Retry button (same file)
- Clear error on new upload attempt
### 14. Responsive Design
#### 14.1 Breakpoints
```yaml
mobile: "640px"
tablet: "768px"
desktop: "1024px"
wide: "1280px"
```
#### 14.2 Mobile Considerations
**Priority:** Desktop-first (Tier 1 ICPs primarily use desktop)
**Mobile Adaptations:**
- Stack columns on mobile
- Full-width tables (horizontal scroll if needed)
- Touch-friendly targets (44px minimum)
- Simplified navigation
### 15. Implementation Notes
#### 15.1 CSS Variables
Use CSS custom properties for theming:
```css
:root {
  --color-primary: #0066CC;
  --color-background: #FFFFFF;
  /* ... */
}
.dark {
  --color-primary: #3B82F6;
  --color-background: #0F172A;
  /* ... */
}
```
#### 15.2 Component Library
**Recommended:** shadcn/ui or similar
- Tailwind CSS-based
- Accessible by default
- Customizable
- Dark mode support
**Available Components:** See `docs/ui/shadcn_components.md` for complete inventory.
**Key Components:**
- **Select:** Use for dropdown selects (type filters, locale selectors). Do NOT use native `<select>` elements.
- **DropdownMenu:** Use for context menus, column visibility toggles, row actions.
- **Button, Input, Card, Badge, Table:** Core UI components matching design system.
- **Dialog, Sheet:** For modals and side panels.
**Component Selection Guidelines:**
- **Select vs DropdownMenu:** Use Select for single-value form inputs. Use DropdownMenu for context menus and multi-selection.
- **Always prefer shadcn components** over native HTML elements for consistency and accessibility.
#### 15.2.1 Recommended Component Additions
**High Priority (MVP):**
1. **Checkbox** - Replace native checkboxes in table row selection
   - **Use case:** Table row selection, form checkboxes
   - **Rationale:** Consistent styling, better accessibility, matches design system
2. **Switch** - For settings toggles (theme, features)
   - **Use case:** Settings page (theme toggle, feature flags)
   - **Rationale:** Better UX than checkboxes for on/off states
3. **Alert** - For error messages and notifications
   - **Use case:** Error states, important messages, inline notifications
   - **Rationale:** Consistent error display, better than ad-hoc error messages
4. **Progress** - For upload progress, loading states
   - **Use case:** File upload progress, processing indicators
   - **Rationale:** Visual feedback for long-running operations (matches FU-401 processing indicator)
5. **Skeleton** - For loading states (better UX than spinners)
   - **Use case:** Record list loading, detail panel loading
   - **Rationale:** Reduces perceived load time, better UX than spinners
**Medium Priority (Post-MVP):**
1. **Tabs** - For settings pages, multi-section views
   - **Use case:** Settings page (General, Integrations, Billing sections)
   - **Rationale:** Better organization for complex settings (matches FU-306)
2. **Tooltip** - For helpful hints and explanations
   - **Use case:** Icon buttons, form field help text, table column headers
   - **Rationale:** Provides context without cluttering UI
3. **Popover** - For additional information on hover
   - **Use case:** Entity details, record metadata, help content
   - **Rationale:** Progressive disclosure of information
4. **Calendar** - For date range filters in tables
   - **Use case:** Timeline view date filters, search date range picker
   - **Rationale:** Better UX than text inputs for date selection (matches FU-303, FU-600)
**Low Priority (Future):**
1. **Accordion** - For collapsible sections
   - **Use case:** FAQ sections, help documentation, collapsible form sections
   - **Rationale:** Useful for organizing long content
2. **Slider** - For numeric range inputs
   - **Use case:** Advanced filters, settings (if needed)
   - **Rationale:** Better UX for numeric ranges
3. **Command** - For command palette
   - **Use case:** Keyboard-driven navigation, quick actions
   - **Rationale:** Power user feature (matches Tier 1 ICP preferences for keyboard-first tools)
#### 15.2.2 Component Design System Alignment
All shadcn/ui components must:
- **Typography:** Use Inter font for UI text, JetBrains Mono for monospace (where applicable)
- **Colors:** Follow design system color palette (light/dark mode)
- **Spacing:** Match spacing scale (4px, 8px, 16px, etc.)
- **Dark Mode:** Support dark mode with proper contrast
- **Accessibility:** Meet WCAG AA standards (keyboard navigation, screen readers, focus indicators)
- **Border Radius:** Match design system (6px buttons/inputs, 8px cards, 4px badges)
- **Transitions:** Use design system timing (150-300ms, ease-in-out)
**Implementation Priority:**
1. High priority components should be added before MVP launch
2. Medium priority components can be added post-MVP based on user feedback
3. Low priority components are optional enhancements
#### 15.3 Design Tokens
Maintain design tokens in:
- CSS variables (for runtime)
- TypeScript/JSON (for design tools)
- Documentation (this file)
### 16. Brand Alignment
#### 16.1 Design Principles Applied
**Minimal:**
- Clean layouts
- Minimal decoration
- Content-first
- No unnecessary elements
**Technical:**
- Monospace for data
- Structured layouts
- Clear hierarchy
- Functional aesthetics
**Trustworthy:**
- Professional color palette
- Consistent patterns
- Clear feedback
- Reliable interactions
**Deterministic:**
- Predictable layouts
- Consistent spacing
- Standard components
## Agent Instructions
### When to Load This Document
Load `docs/ui/design_system.md` when:
- Designing or implementing new UI components
- Updating existing components to match brand/aesthetic needs
- Planning UI changes for MVP and Tier 1 ICPs
### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md` (Truth Layer principles and UI philosophy)
- `docs/ui/dsl_spec.md` (UI DSL definitions)
- `docs/subsystems/accessibility.md` (accessibility requirements)
- `docs/subsystems/i18n.md` (internationalization requirements)
### Constraints Agents Must Enforce
1. MUST adhere to brand and aesthetic guidelines defined here (colors, typography, spacing)
2. MUST respect accessibility and i18n constraints (contrast, keyboard nav, translatability)
3. MUST implement UI as an inspection window, not an agent (no autonomous behavior)
4. MUST avoid non-deterministic or surprising UI behavior (predictable interactions only)
### Forbidden Patterns
- Introducing marketing language, hype, or playful tone into core UI
- Ignoring accessibility requirements (keyboard, ARIA, contrast)
- Implementing agent-like behavior (auto-decisions, auto-execution)
- Using inconsistent colors, typography, or spacing outside design tokens
### Validation Checklist
- [ ] UI changes conform to design tokens and component guidelines
- [ ] Accessibility checks (keyboard, ARIA, contrast) pass
- [ ] Localization checks (translatability, formatting) pass
- [ ] UI behavior matches Neotoma's Truth Layer philosophy (inspection window only)
- No randomness
### 17. ICP Preference Alignment
#### 17.1 AI-Native Individual Operators
**Preferences Met:**
- Dark mode support
- Minimal, functional design
- High information density
- Developer-friendly (monospace, keyboard navigation)
#### 17.2 High-Context Knowledge Workers
**Preferences Met:**
- Professional aesthetic
- High information density
- Structured layouts (tables, cards)
- Trust-focused design
#### 17.3 AI-Native Founders
**Preferences Met:**
- Modern, minimal design
- Fast, functional interactions
- Developer-friendly
- Professional appearance
### 18. Onboarding Components
#### 18.1 Welcome Screen (FU-400)
**Layout:**
- Centered content (max-width: 600px)
- H1: "Neotoma" (brand name)
- Subtitle: "Your structured AI memory"
- Value proposition (bullet list, minimal)
- Primary CTA: "Upload Your First Document" (large button)
- Skip link: "I've used Neotoma before" (ghost button, small)
**Typography:**
- H1: 2rem, bold
- Subtitle: 1rem, muted
- Bullet list: 0.9375rem body text
- CTA: Primary button, large size
**Accessibility:**
- Autofocus on primary CTA
- Semantic heading structure
- Skip link for keyboard navigation
#### 18.2 Extraction Results (FU-402)
**Layout:**
- Card-based sections
- Extracted Fields: Key-value pairs (label: value)
- Entities: Badge list with entity type colors
- Events: Timeline preview (3-5 events)
- CTAs: "View Timeline", "Upload Another", "Ask AI"
**Visual Hierarchy:**
- Section headers (h3)
- Field labels: Small, muted
- Field values: Body text, monospace for IDs
- Entity badges: Entity type colors
- CTA buttons: Primary for main action, secondary for others
### 19. File Upload Components
#### 19.1 Upload Zone (FU-304)
**States:**
**Idle:**
- Dashed border (border-muted)
- Neutral background (background-secondary)
- Message: "Drag and drop a file or click to browse"
- File type hints: "Supported: PDF, JPG, PNG (max 50MB)"
**Dragging Over:**
- Solid border (primary color)
- Highlighted background (primary/10)
- Message: "Drop to upload"
- Visual feedback (scale: 1.02)
**Uploading:**
- Progress bar (primary color)
- File name displayed
- Percentage: "Uploading... 45%"
- Disable other actions
**Error:**
- Red border (error color)
- Error message (role="alert")
- Retry button (outline variant)
#### 19.2 Bulk Upload (FU-304)
**Upload Queue:**
- List of files being uploaded
- Per-file progress bars
- File name, size, status
- Cancel button per file
- Overall progress indicator
**Queue Management:**
- Max concurrent uploads: 3-5
- Failed uploads: Retry button, error message
- Completed uploads: Checkmark, remove from queue
**Visual Style:**
- Queue list: Card-based, compact
- Progress bars: Primary color, 4px height
- Status badges: Success (green), Error (red), Pending (muted)
### 20. Authentication Components
#### 20.1 Signup/Signin Forms (FU-700)
**Form Layout:**
- Centered card (max-width: 400px)
- Title: "Sign Up" or "Sign In"
- Email input
- Password input
- Submit button (primary, full-width)
- OAuth buttons (Google, GitHub) — outline variant, full-width
- Link to alternate form ("Already have an account?" / "Don't have an account?")
**OAuth Buttons:**
- Icon + text ("Continue with Google")
- Outline variant
- Full-width
- Spacing: 8px between buttons
**Password Reset:**
- Email input only
- Submit button
- Back to signin link
**Error States:**
- Inline error below form
- Specific error message
- No auto-dismiss
### 21. Billing Components
#### 21.1 Subscription Management (FU-702)
**Plan Selection:**
- Card-based plan options
- Plan name, price, features (bullet list)
- "Current Plan" badge for active plan
- "Select Plan" button (primary for upgrade, outline for current)
**Subscription Details:**
- Current plan display
- Billing cycle (monthly/annual)
- Next billing date
- Cancel subscription link (destructive variant)
**Invoice History:**
- Table layout
- Columns: Date, Amount, Status, Download
- Status badges: Paid (green), Pending (amber), Failed (red)
- Download button (ghost variant)
**Usage Dashboard:**
- Stats widgets (records, API calls, storage)
- Usage charts (minimal, data-first)
- Billing period selector
### 22. Settings Components
#### 22.1 Settings Page (FU-306)
**Layout:**
- Sidebar navigation (settings sections)
- Main content area (form sections)
- Sections: Preferences, Integrations, Account, Billing
**Form Controls:**
- Locale selector: Dropdown (Select component)
- Theme toggle: Toggle switch (light/dark)
- Connected integrations: List with disconnect buttons
- Save button: Primary, sticky footer
**Integration List:**
- Provider name, icon
- Status badge (Connected, Disconnected, Error)
- Last sync timestamp (small, muted)
- Disconnect button (ghost, destructive on hover)
### 23. Search Components
#### 23.1 Advanced Search UI (FU-600)
**Search Input:**
- Auto-complete dropdown
- Search suggestions (recent searches, common queries)
- Keyboard shortcut: "/" to focus
**Filter Panel:**
- Collapsible section
- Type filter: Multi-select dropdown
- Date range: Date picker (start/end)
- Property filters: Key-value inputs
- Clear filters button
**Search Mode Toggle:**
- Radio group: "Keyword", "Semantic", "Both"
- Default: "Both"
**Result Highlighting:**
- Highlight matched terms (yellow background, subtle)
- Match count badge
### 24. Provider Connectors UI
#### 24.1 Provider Catalog (FU-501)
**Provider Cards:**
- Provider name, icon, description
- "Connect" button (primary)
- Status: "Available", "Connected", "Error"
- Connected providers: "Disconnect" button
**OAuth Flow:**
- Modal or redirect
- Loading state during OAuth
- Success callback → show connected status
- Error handling → show error message
**Sync Status:**
- Last sync timestamp
- Sync status badge (Success, Error, Pending)
- Manual sync button (ghost variant)
### 25. Future Considerations
#### 25.1 Potential Enhancements
- Custom theme support (user-defined colors)
- Density preferences (compact/comfortable/spacious)
- Font size preferences
- Customizable entity type colors
#### 25.2 Design System Evolution
- Start with these recommendations
- Gather user feedback
- Iterate based on usage patterns
- Maintain brand consistency
## Summary
This design system prioritizes:
1. **Professional Aesthetic:** Neutral colors, structured layouts, high information density
2. **Technical Focus:** Monospace for data, functional design, developer-friendly
3. **Trust:** Consistent patterns, clear feedback, reliable interactions
4. **ICP Alignment:** Matches preferences from ChatGPT, Cursor, GitHub, research tools, legal platforms
The system balances information density with readability, maintains brand consistency, and aligns with Tier 1 ICP aesthetic preferences while supporting Neotoma's positioning as a minimal, technical, trustworthy truth layer.
**See Also:**
- [`docs/ui/design_constraints_template.yaml`](./design_constraints_template.yaml) - Technical constraints
- [`docs/ui/UI_SPEC.md`](./UI_SPEC.md) - UI specification
- [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) - Brand principles
