# Data Visualization

## Timeline

**Visual Style:**

- Vertical line (subtle gray)
- Event markers (small circles, colored by type)
- Date labels (monospace, small)
- Event cards (subtle background, border)

**Timeline View (FU-303) Requirements:**

- Chronological event list (sorted by event_timestamp)
- Date grouping headers (day/month/year)
- Click event → navigate to source detail
- Filter by date range (date picker)
- Filter by event type (badge filter)
- Virtualized scrolling for >100 events (react-window)
- Event type badges use entity type colors
- Source links (monospace IDs, navigate to SourceDetail)

## Entity Graph

**Visual Style:**

- Nodes: Circles with entity type color
- Edges: Subtle gray lines
- Labels: Small, readable
- Minimal decoration

**Entity Explorer (FU-601) Requirements:**

- Entity list view (table with entity type, canonical name, observation count)
- Entity detail view (shows entity snapshot, observations, relationships, provenance)
- Entity graph visualization (optional, minimal decoration)
- Click entity → see entity detail with observations and relationships

## Charts (Future)

**Style:**

- Minimal grid lines
- Subtle colors (not bright)
- Clear axis labels
- Data-first (no decoration)

## Dashboard Widgets (FU-305)

**Stats Widgets:**

- Card-based layout
- Large number (h2 size, bold)
- Label (small, muted)
- Icon (optional, subtle)
- Grid: 3-4 columns on desktop, 1-2 on mobile

**Recent Sources Widget:**

- Compact list (5 items max)
- Click → navigate to source detail
- "View All" link

**Quick Actions:**

- Button group (primary actions)
- Upload, Search, View Timeline

## Related Documents

- [`../design_system.md`](../design_system.md) - Design system index
- [`color_palette.md`](./color_palette.md) - Entity type colors for visualization
