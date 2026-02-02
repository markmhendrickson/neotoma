# Navigation Components

## Sidebar Navigation

**Structure:**

- Header: Site name/logo, search (optional), collapse trigger
- Content: Entity type navigation (dynamic), static menu items
- Footer: Theme toggle, user account menu, sign out, custom actions

**Entity Type Navigation:**

- Dynamic list showing only entity types with entities
- Each item: Entity type label (formatted), count badge
- Click navigates to `/entities?type={entity_type}`
- Active state: Highlighted when URL matches `?type={entity_type}`
- Loading state: Spinner while fetching
- Empty state: No types shown if user has no entities

**Visual Style:**

- Header height: 64px (h-16)
- Menu item height: 40px (matches design system)
- Active state: Primary color background with primary foreground
- Hover state: Background tertiary
- Badge: Primary color with 10% opacity background
- Icons: 16px (size-4) for menu items, 20px (size-5) for header

**Mobile Behavior:**

- Overlay sidebar with backdrop
- Auto-closes on navigation link click
- Touch targets: Minimum 44px height
- Collapse/expand trigger in header

**Theme Toggle:**

- Dropdown menu: Light (Sun), Dark (Moon), System (Monitor)
- Current selection indicated with Check icon
- Persists preference to localStorage

**User Account Menu:**

- Dropdown triggered by user icon/email
- Displays account email
- Options: Settings link, Sign out action
- Only shown when authenticated

**Accessibility:**

- Semantic `<nav>` element
- ARIA labels on all interactive elements
- Keyboard navigation: Tab, Enter/Space, Escape
- "/" keyboard shortcut to focus search
- Screen reader announcements for state changes

**See:** [`../patterns/navigation.md`](../patterns/navigation.md) for complete navigation pattern documentation.

## Related Documents

- [`../design_system.md`](../design_system.md) - Design system index
- [`../patterns/navigation.md`](../patterns/navigation.md) - Complete navigation pattern documentation
- [`component_styles.md`](./component_styles.md) - Menu and badge styles
