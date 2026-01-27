# UI Pattern: Navigation
*(Sidebar Navigation with Entity Types, Search, and User Menu)*

## Purpose
Navigation pattern for app-wide sidebar navigation with entity type filtering, search integration, and user account management.

## When to Use
- Main app navigation sidebar (AppNavigationSidebar component)
- Documentation navigation sidebar (AppSidebar component)
- Any sidebar-based navigation structure

## Structure

### Sidebar Layout
```yaml
sidebar:
  structure:
    header:
      - Site name/logo
      - Search component (optional)
      - Collapse/expand trigger
    content:
      - Entity type navigation (dynamic)
      - Static menu items (optional)
    footer:
      - Theme toggle
      - User account menu
      - Sign out action
      - Custom footer actions (optional)
```

### Component Structure
```yaml
component_type: navigation
layout:
  type: sidebar
  collapsible: true
  sections:
    - type: header
      content: site_name | search
    - type: content
      items:
        - type: entity_types
          dynamic: true
          show_counts: true
        - type: menu_items
          static: true
    - type: footer
      items:
        - type: theme_toggle
        - type: user_menu
        - type: sign_out
accessibility:
  aria_labels:
    sidebar: "Main navigation"
    entity_type: "Filter by {entity_type}"
    theme_toggle: "Theme preferences"
    user_menu: "User account menu"
```

## Navigation Elements

### 1. Sidebar Header

**Default Header (Site Name):**
- Displays site name (e.g., "Neotoma")
- Logo/icon (optional)
- Collapse/expand trigger button
- Height: 64px (h-16)

**Search Header (Optional):**
- UniversalSearch component when `onSearch` prop provided
- When collapsed: Search icon button (opens sidebar)
- When expanded: Full-width search input
- Keyboard shortcut: "/" to focus search

### 2. Sidebar Content

**Entity Type Navigation:**
- Dynamic list of entity types (only types with entities)
- Each item shows:
  - Entity type label (formatted, e.g., "Invoice" not "invoice")
  - Entity count badge
  - Click navigates to `/entities?type={entity_type}`
- Loading state: Spinner while fetching
- Empty state: No entity types shown if user has no entities
- Active state: Highlighted when `?type={entity_type}` matches current URL

**Static Menu Items (Optional):**
- Array of menu items with path, label, icon
- Displayed in footer (not main content)
- Active state based on pathname match

### 3. Sidebar Footer

**Theme Toggle:**
- Dropdown menu with options:
  - Light (Sun icon)
  - Dark (Moon icon)
  - System (Monitor icon)
- Current selection indicated with Check icon
- Persists preference to localStorage

**User Account Menu:**
- Dropdown menu triggered by user icon/email
- Displays account email
- Options:
  - Settings link
  - Sign out action
- Only shown when authenticated

**Sign Out Action:**
- Separate sign out button (if `onSignOut` provided)
- Or included in user account menu
- Destructive styling (optional)

**Custom Footer Actions:**
- Accepts React node for additional footer content
- Useful for provider-specific actions

## States

| State | Display |
|-------|---------|
| Loading | Spinner in entity types section |
| Empty (No Entities) | No entity types shown, empty content area |
| Collapsed | Icon-only view, tooltips on hover |
| Expanded | Full sidebar with labels |
| Mobile | Overlay sidebar, auto-closes on navigation |

## Active State Detection

**Entity Type Active:**
- Active when URL matches `/entities?type={entity_type}`
- Visual indicator: Highlighted background, bold text
- Uses `isActive` prop on SidebarMenuButton

**Menu Item Active:**
- Active when pathname starts with item path
- Exact match for root path (`/`)
- Prefix match for nested paths

## Mobile Behavior

**Auto-Close:**
- Sidebar automatically closes when:
  - Navigation link is clicked
  - Entity type is selected
  - User clicks outside sidebar (overlay mode)

**Touch Targets:**
- Minimum 44px height for all interactive elements
- Adequate spacing between items

**Overlay Mode:**
- Sidebar overlays content on mobile
- Backdrop dims main content
- Close button in header

## Accessibility

**Keyboard Navigation:**
- Tab through navigation items
- Enter/Space to activate item
- Escape to close sidebar (mobile)
- "/" to focus search (when search enabled)

**ARIA Labels:**
- `aria-label` on sidebar: "Main navigation"
- `aria-label` on entity type buttons: "Filter by {entity_type}"
- `aria-label` on theme toggle: "Theme preferences"
- `aria-label` on user menu: "User account menu"
- `aria-expanded` on collapsible sections

**Screen Reader Support:**
- Semantic `<nav>` element
- Proper heading hierarchy
- Descriptive link text
- State announcements (collapsed/expanded)

## i18n

**Translatable Elements:**
- Site name (if configurable)
- Entity type labels (formatted via `formatEntityType`)
- Menu item labels
- Theme option labels (Light, Dark, System)
- User menu labels (Settings, Sign Out)
- Search placeholder text

**Locale Considerations:**
- Entity type formatting respects locale
- Date formatting in entity counts (if shown)
- Number formatting for entity counts

## Visual Design

### Spacing
- Header height: 64px (h-16)
- Menu item height: 40px (matches design system)
- Footer padding: 16px (md spacing)
- Section spacing: 24px (lg spacing)

### Typography
- Site name: 18px (text-lg), semibold (font-semibold)
- Menu items: 15px (body size), regular weight
- Entity type labels: 15px (body size)
- Count badges: 13px (small size)

### Colors
- Active state: Primary color background with primary foreground
- Hover state: Background tertiary
- Border: Border color (subtle)
- Badge: Primary color with 10% opacity background

### Icons
- Size: 16px (size-4) for menu items
- Size: 20px (size-5) for header logo
- Lucide icons (consistent with design system)
- Icon color matches text color hierarchy

## Implementation Notes

### Component Props
```typescript
interface AppNavigationSidebarProps {
  siteName: string;
  menuItems: MenuItem[];
  accountEmail?: string;
  footerActions?: React.ReactNode;
  onSearch?: ((query: string) => void) | null;
  onSignOut?: () => void;
}
```

### Entity Type Fetching
- Fetches from `/api/entities/query` endpoint
- Filters to only show types where user has entities
- Counts entities per type for badge display
- Requires authentication (bearer token)

### State Management
- Uses `useSidebar` hook for collapse/expand state
- Uses `useLocation` for active state detection
- Uses `useTheme` for theme preference
- Uses `useAuth` for user authentication state

### Collapsible Behavior
- Sidebar can collapse to icon-only view
- State persisted (optional, via localStorage)
- Tooltips show on hover when collapsed
- Smooth transition animation (200ms)

## Related Components

**shadcn/ui Components Used:**
- `Sidebar` - Main container
- `SidebarHeader` - Header section
- `SidebarContent` - Content section
- `SidebarFooter` - Footer section
- `SidebarGroup` - Grouping container
- `SidebarMenu` - Menu container
- `SidebarMenuItem` - Individual menu item
- `SidebarMenuButton` - Clickable menu button
- `SidebarMenuBadge` - Count badge
- `SidebarTrigger` - Collapse/expand button
- `DropdownMenu` - Theme toggle and user menu
- `UniversalSearch` - Search component

## Agent Instructions

### When to Load This Document
Load `docs/ui/patterns/navigation.md` when:
- Designing or implementing navigation sidebars
- Adding new navigation items or sections
- Modifying entity type navigation behavior
- Planning navigation accessibility or i18n features
- Integrating search into navigation

### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md` (UI principles, Truth Layer boundaries)
- `docs/ui/design_system.md` (visual styles, spacing, typography, colors)
- `docs/subsystems/accessibility.md` (A11y requirements)
- `docs/subsystems/i18n.md` (localization behavior)
- `docs/ui/shadcn_components.md` (component inventory)

### Constraints Agents Must Enforce
1. MUST implement loading/empty states for entity type navigation
2. MUST support keyboard navigation and ARIA labels
3. MUST auto-close sidebar on mobile when navigation occurs
4. MUST show only entity types where user has entities
5. MUST maintain active state based on current URL
6. MUST respect theme preference and persist to localStorage
7. MUST handle authentication state (show/hide user menu)

### Forbidden Patterns
- Showing entity types where user has zero entities
- Omitting loading states during entity type fetch
- Not closing sidebar on mobile after navigation
- Using non-semantic navigation markup
- Missing ARIA labels on interactive elements
- Hardcoding entity types instead of fetching dynamically

### Validation Checklist
- [ ] Navigation uses semantic `<nav>` element
- [ ] Loading/empty states implemented for entity types
- [ ] Keyboard navigation and ARIA labels present
- [ ] Active state detection works correctly
- [ ] Mobile auto-close behavior implemented
- [ ] Theme toggle persists preference
- [ ] Entity type labels formatted correctly
- [ ] Text and labels translatable and locale-aware
- [ ] Touch targets meet 44px minimum
- [ ] Collapsible behavior smooth and accessible
