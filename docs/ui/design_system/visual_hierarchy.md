# Visual Hierarchy

## Information Density

**Principle:** High information density without clutter.

**Techniques:**

- Clear visual grouping (borders, spacing)
- Consistent alignment (left-align text, right-align numbers)
- Typography hierarchy (size, weight, color)
- Subtle backgrounds for sections
- Minimal decoration

## Content Structure

**Source List (SourceTable component):**

- Table layout (high density)
- Sortable columns
- Row hover states
- Clear column headers
- Displays sources with file name, MIME type, created date

**Entity List (EntityList component):**

- Table layout (high density)
- Entity type badges
- Canonical name display
- Observation count

**Source Detail (SourceDetail component):**

- Card-based sections
- Clear section headers (h3)
- Metadata in monospace
- Tabs for: Source info, Interpretations, Observations, Entities

**Entity Detail (EntityDetail component):**

- Card-based sections
- Clear section headers (h3)
- Tabs for: Entity Snapshot, Schema, Sources, Interpretations, Timeline, Observations, Relationships
- Snapshot fields with provenance tracking

**Observation List (ObservationList component):**

- Table layout showing observations
- Entity type display
- Source and interpretation references
- Observation fields display

**Timeline:**

- Chronological list
- Date markers (subtle)
- Event type badges
- Source links (navigates to SourceDetail)

## Related Documents

- [`../design_system.md`](../design_system.md) - Design system index
- [`component_styles.md`](./component_styles.md) - Component styling details
- [`data_visualization.md`](./data_visualization.md) - Timeline and graph visualization
