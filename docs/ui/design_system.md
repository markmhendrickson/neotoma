# Neotoma Design System

_(Styles Based on Brand Needs and Tier 1 ICP Aesthetic Preferences)_

## Overview

This design system provides comprehensive guidelines for Neotoma's user interface, ensuring consistency, accessibility, and alignment with Tier 1 ICP aesthetic preferences.

## Design System Sections

### Foundation

- **[Tier 1 ICP Aesthetic Analysis](./design_system/icp_aesthetic_analysis.md)** - Analysis of apps used by Tier 1 ICPs and common aesthetic patterns
- **[Color Palette](./design_system/color_palette.md)** - Base colors, semantic colors, data visualization colors, borders
- **[Typography](./design_system/typography.md)** - Font families, type scale, usage guidelines
- **[Style Guide](./design_system/style_guide.md)** - UI copy rules (labels, buttons, messages, placeholders, tooltips, errors, empty states)
- **[Spacing and Layout](./design_system/spacing_and_layout.md)** - Spacing scale, layout density, grid system
- **[Visual Hierarchy](./design_system/visual_hierarchy.md)** - Information density, content structure

### Core Design Elements

- **[Component Styles](./design_system/component_styles.md)** - Buttons, inputs, tables, cards, badges
- **[Dark Mode](./design_system/dark_mode.md)** - Dark mode strategy and color adjustments
- **[Motion and Animation](./design_system/motion_and_animation.md)** - Animation principles, transition timing, usage guidelines
- **[Accessibility](./design_system/accessibility.md)** - Contrast requirements, focus indicators, keyboard navigation
- **[Iconography](./design_system/iconography.md)** - Icon style and usage guidelines
- **[Data Visualization](./design_system/data_visualization.md)** - Timeline, entity graph, charts, dashboard widgets

### UI States

- **[Empty States](./design_system/empty_states.md)** - Empty state style and variants
- **[Loading States](./design_system/loading_states.md)** - Loading indicators, processing indicators
- **[Error States](./design_system/error_states.md)** - Error display, error boundary, upload errors

### Layout and Responsiveness

- **[Responsive Design](./design_system/responsive_design.md)** - Breakpoints, mobile considerations

### Implementation

- **[Implementation Notes](./design_system/implementation_notes.md)** - CSS variables, component library (shadcn/ui), design tokens

### Component Specifications

- **[Onboarding Components](./design_system/onboarding_components.md)** - Welcome screen, extraction results
- **[File Upload Components](./design_system/file_upload_components.md)** - Upload zone, bulk upload
- **[Authentication Components](./design_system/authentication_components.md)** - Signup/signin forms
- **[Billing Components](./design_system/billing_components.md)** - Subscription management
- **[Settings Components](./design_system/settings_components.md)** - Settings page
- **[Search Components](./design_system/search_components.md)** - Advanced search UI
- **[Navigation Components](./design_system/navigation_components.md)** - Sidebar navigation

### Alignment and Strategy

- **[Brand Alignment](./design_system/brand_alignment.md)** - Design principles applied (minimal, technical, trustworthy, deterministic)
- **[ICP Preference Alignment](./design_system/icp_preference_alignment.md)** - How design system meets Tier 1 ICP preferences

### Future

- **[Future Considerations](./design_system/future_considerations.md)** - Potential enhancements, design system evolution

## Summary

This design system prioritizes:

1. **Professional Aesthetic:** Neutral colors, structured layouts, high information density
2. **Technical Focus:** Monospace for data, functional design, developer-friendly
3. **Trust:** Consistent patterns, clear feedback, reliable interactions
4. **ICP Alignment:** Matches preferences from ChatGPT, Cursor, GitHub, research tools, legal platforms

The system balances information density with readability, maintains brand consistency, and aligns with Tier 1 ICP aesthetic preferences while supporting Neotoma's positioning as a minimal, technical, trustworthy truth layer.

## Agent Instructions

### When to Load This Document

Load `docs/ui/design_system.md` when:

- Designing or implementing new UI components
- Updating existing components to match brand/aesthetic needs
- Planning UI changes for MVP and Tier 1 ICPs
- Writing or reviewing UI copy (labels, buttons, messages, empty states, errors); see [Style Guide](./design_system/style_guide.md)

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` (Truth Layer principles and UI philosophy)
- `docs/ui/dsl_spec.md` (UI DSL definitions)
- `docs/ui/patterns/navigation.md` (navigation sidebar patterns, when working on navigation)
- `docs/ui/design_system_sync_rules.mdc` (synchronization rules with StyleGuide component, when modifying design system or StyleGuide)
- `docs/subsystems/accessibility.md` (accessibility requirements)
- `docs/subsystems/i18n.md` (internationalization requirements)
- `docs/ui/design_system/style_guide.md` (when writing or reviewing UI copy)

### Constraints Agents Must Enforce

1. MUST adhere to brand and aesthetic guidelines defined here (colors, typography, spacing)
2. MUST respect accessibility and i18n constraints (contrast, keyboard nav, translatability)
3. MUST implement UI as an inspection window, not an agent (no autonomous behavior)
4. MUST avoid non-deterministic or surprising UI behavior (predictable interactions only)
5. MUST keep design system and StyleGuide component synchronized (see `docs/ui/design_system_sync_rules.mdc`)

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
- [ ] Design system and StyleGuide component are synchronized (if either was modified)
- No randomness

## See Also

- [`docs/ui/design_constraints_template.yaml`](./design_constraints_template.yaml) - Technical constraints
- [`docs/ui/UI_SPEC.md`](./UI_SPEC.md) - UI specification
- [`docs/ui/patterns/navigation.md`](./patterns/navigation.md) - Navigation sidebar pattern
- [`docs/ui/design_system_sync_rules.mdc`](./design_system_sync_rules.mdc) - Synchronization rules with StyleGuide component
- [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) - Brand principles
