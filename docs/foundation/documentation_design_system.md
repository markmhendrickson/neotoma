# Documentation Design System

_(Design Principles and Patterns for Documentation Websites)_

---

## Purpose

This document defines generalized design system principles and patterns for documentation websites. It establishes design philosophy, abstract design tokens, navigation patterns, and layout principles that can be applied across different implementation contexts.

This document does NOT specify:
- Repository-specific implementation details
- Specific component libraries or frameworks
- Concrete CSS variables or configuration files
- Build tooling or integration specifics

---

## Scope

This document covers:
- Design principles for documentation websites
- Abstract design token systems (color, typography, spacing, layout)
- Navigation and information architecture patterns
- Layout and responsive behavior principles
- Accessibility requirements and patterns
- Content presentation patterns

This document does NOT cover:
- Specific component implementations (see implementation docs)
- Framework-specific patterns (React, Vue, etc.)
- Build configuration or tooling
- Deployment strategies

---

## 1. Component Standardization Principle

**Standardized Components Over Custom Implementation:**

Documentation websites SHOULD prioritize standardized, well-maintained component libraries over custom implementations when available. This principle ensures:

- **Reduced maintenance burden**: Standardized components are maintained by the library maintainers
- **Consistency**: Components from established libraries follow consistent patterns and APIs
- **Accessibility**: Well-maintained component libraries include accessibility features out of the box
- **Documentation and support**: Standardized components have documentation and community support
- **Future-proofing**: Component libraries evolve with web standards and best practices

When evaluating component options:

1. **First**: Check for standardized components in established component libraries (e.g., shadcn/ui, Radix UI, Headless UI)
2. **Second**: Evaluate if the standardized component meets requirements (functionality, accessibility, styling flexibility)
3. **Third**: Only create custom components when standardized options are unavailable or insufficient

**Examples of standardized components to prefer:**
- Sidebar navigation components
- Dialog/Modal components
- Dropdown menus
- Form inputs and controls
- Data tables
- Navigation menus

This principle applies to both design system specification (identifying which standardized components to use) and implementation (actually using the standardized components rather than building custom equivalents).

---

## 2. Design Principles

Documentation websites MUST embody these core principles:

### 1.1 Minimal

- **Content-first**: Content takes precedence over decoration
- **Clean layouts**: Minimal visual noise, functional borders only
- **Essential elements only**: No unnecessary UI components
- **Reduced cognitive load**: Simple, clear information hierarchy

### 1.2 Technical

- **Monospace for code/data**: Clear distinction between prose and technical content
- **Structured layouts**: Grid-based, predictable organization
- **Functional aesthetics**: Form follows function
- **Developer-friendly**: Optimized for technical audiences

### 1.3 Trustworthy

- **Professional color palette**: Neutral tones, restrained accents
- **Consistent patterns**: Predictable UI behavior
- **Clear feedback**: Obvious interaction states
- **Reliable interactions**: No surprising or unexpected behavior

### 1.4 Deterministic

- **Predictable layouts**: Consistent structure across pages
- **Standard patterns**: Familiar documentation conventions
- **Consistent spacing**: Rhythmic, grid-based layout system
- **Reproducible experiences**: Same content, same presentation

---

## 3. Abstract Design Tokens

Design tokens define the abstract system of values that create visual consistency.

### 2.1 Color Palette Principles

**Base Colors:**
- **Background**: Pure white (light) or deep slate (dark) for main canvas
- **Foreground**: Near-black (light) or near-white (dark) for primary text
- **Secondary**: Medium gray for supporting text
- **Tertiary**: Light gray for less important information
- **Muted**: Subtle gray for borders and dividers

**Semantic Colors:**
- **Primary (Action/Trust)**: Professional blue for actions, links, primary UI
- **Success**: Green for positive states
- **Error**: Red for error states
- **Warning**: Amber for warning states
- **Info**: Blue (aligned with primary) for informational states

**Principles:**
- High contrast between foreground and background
- Neutral grays dominate the palette
- Minimal use of color for visual hierarchy
- Semantic colors reserved for status and actions only
- No decorative colors

### 2.2 Typography Principles

**Font Families:**
- **UI Text**: Sans-serif system font stack (Inter-style or system default)
- **Code/Data**: Monospace font stack (JetBrains Mono-style or system monospace)

**Type Scale:**
- **Headings**: Clear hierarchy (H1 > H2 > H3 > H4)
- **Body**: Optimized for reading (15-16px base size)
- **Small**: For captions, metadata (13-14px)
- **Mono**: For code blocks, data display (13-14px)

**Principles:**
- Clear typographic hierarchy
- Readable body text sizes
- Distinct monospace for technical content
- Appropriate line heights for density and readability
- Negative letter spacing for headings

### 2.3 Spacing System

**Base Unit**: 4px grid system

**Scale:**
- xs: 4px (tight)
- sm: 8px (compact)
- md: 16px (comfortable)
- lg: 24px (spacious)
- xl: 32px (section breaks)
- 2xl: 48px (major divisions)

**Principles:**
- Consistent rhythm throughout layout
- Proportional spacing relationships
- Adequate breathing room for content
- Dense layouts without feeling cramped

### 2.4 Border and Radius

**Border Width:**
- Default: 1px for most borders
- Heavy: 2px for emphasis

**Border Radius:**
- Minimal: 2px for subtle rounding
- Default: 4px for cards and containers
- Never use large radius values

**Principles:**
- Subtle, functional borders
- Minimal decorative rounding
- Consistent across components

---

## 4. Navigation Patterns

### 3.1 Sidebar Navigation

**Structure:**
- Primary navigation in fixed or collapsible sidebar
- Hierarchical organization (sections → pages → subsections)
- Clear active state indication
- Collapsible sections for complex hierarchies

**Behavior:**
- Persistent on desktop (always visible or toggle-able)
- Collapsed/slide-out on mobile (Sheet pattern)
- Scroll indicator for long navigation lists
- Keyboard navigable

**Content:**
- Section grouping (Overview, API, Guides, etc.)
- Clear, descriptive labels
- Optional badges for status/version
- Search integration

### 3.2 Page Navigation

**Table of Contents:**
- On-page TOC for long documents
- Auto-generated from headings
- Scroll-spy active state
- Jump-to-section links

**Breadcrumbs:**
- Hierarchical path display
- Links to parent sections
- Current page indication

**Cross-References:**
- Related pages/sections
- "See also" links
- Contextual navigation

### 3.3 Search

**Placement:**
- Prominent search input (header or sidebar)
- Keyboard shortcut (/ or Cmd+K)
- Focus on activation

**Behavior:**
- Real-time or instant search
- Result ranking by relevance
- Result highlighting
- Keyboard navigation of results

---

## 5. Layout Principles

### 4.1 Responsive Behavior

**Desktop (> 1024px):**
- Sidebar: Persistent, fixed position
- Content: Centered, max-width for readability
- TOC: Optional right sidebar for long documents

**Tablet (768px - 1024px):**
- Sidebar: Collapsible or overlay
- Content: Full width with padding
- TOC: Inline or collapsible

**Mobile (< 768px):**
- Sidebar: Slide-out drawer
- Content: Full width, mobile-optimized
- TOC: Collapsible dropdown or inline

### 4.2 Content Layout

**Main Content Area:**
- Max-width: 65-75 characters (optimal reading width)
- Adequate margins (48-64px)
- Clear hierarchy (headings, paragraphs, lists)

**Code Blocks:**
- Syntax highlighting
- Copy-to-clipboard functionality
- Horizontal scroll for long lines
- Line numbers for reference (optional)

**Tables:**
- Horizontal scroll on small screens
- Clear headers
- Alternating row colors (subtle)
- Dense but readable

### 4.3 Information Architecture

**Page Structure:**
1. **Header**: Site title, search, version selector
2. **Sidebar**: Primary navigation
3. **Main Content**: Documentation content
4. **TOC** (optional): On-page navigation
5. **Footer**: Legal links, version info

**Content Hierarchy:**
1. H1: Page title (one per page)
2. H2: Major sections
3. H3: Subsections
4. H4: Minor subsections
5. Body text, lists, code blocks, tables

---

## 6. Accessibility Principles

### 5.1 Keyboard Navigation

- All interactive elements MUST be keyboard accessible
- Logical tab order
- Visible focus indicators
- Skip-to-content links
- Keyboard shortcuts documented

### 5.2 Screen Readers

- Semantic HTML structure
- ARIA labels where needed
- Alt text for images
- Heading hierarchy maintained
- Link text descriptive

### 5.3 Visual Accessibility

- WCAG AA contrast ratios minimum (4.5:1 for body text, 3:1 for large text)
- Resizable text (up to 200%)
- No information conveyed by color alone
- Focus indicators visible
- Sufficient target sizes (44x44px minimum)

### 5.4 Motion and Animation

- Respect prefers-reduced-motion
- Subtle transitions only
- No auto-playing content
- Pause/stop controls for motion

---

## 7. Content Presentation Patterns

### 6.1 Markdown Rendering

**Standard Elements:**
- Headings (H1-H6)
- Paragraphs
- Lists (ordered, unordered, nested)
- Code blocks (fenced, with language)
- Inline code
- Links
- Images
- Blockquotes
- Tables
- Horizontal rules

**Enhanced Elements:**
- Syntax highlighting for code
- Callouts/admonitions (note, warning, tip)
- Tabs for multi-option examples
- Collapsible sections

### 6.2 Code Display

**Inline Code:**
- Monospace font
- Distinct background color
- Slightly smaller than body text
- No line breaks

**Code Blocks:**
- Language-specific syntax highlighting
- Line numbers (optional)
- Filename/title (optional)
- Copy button
- Wrap or scroll for long lines

### 6.3 Interactive Elements

**Links:**
- Distinct from body text (color, underline)
- Hover state
- Visited state (optional)
- External link indicator (optional)

**Buttons:**
- Clear affordance (looks clickable)
- Hover and active states
- Disabled state (when applicable)
- Loading state (when applicable)

---

## 7. Dark Mode Principles

**Requirements:**
- Support both light and dark modes
- System preference detection
- Manual toggle available
- Preference persistence

**Color Adjustments:**
- Invert lightness values
- Reduce contrast slightly (dark mode softer than inverted light mode)
- Adjust syntax highlighting for readability
- Maintain semantic color meanings

**Consistency:**
- All UI elements support both modes
- Images/icons work in both modes
- No hardcoded colors that break in either mode

---

## 9. Performance Principles

### 8.1 Loading Performance

- Fast initial page load (< 200ms p95)
- Progressive enhancement
- Critical CSS inline
- Lazy load images
- Optimize web fonts

### 8.2 Runtime Performance

- Smooth scrolling
- Instant search (< 100ms)
- Fast navigation (< 50ms)
- No layout shifts

### 8.3 Asset Optimization

- Minified CSS/JS
- Compressed images
- Font subsetting
- Cache strategy

---

## 10. Invariants

Documentation websites implementing this design system MUST:

1. **MUST maintain high contrast** (WCAG AA minimum)
2. **MUST be keyboard navigable** (all interactive elements)
3. **MUST use semantic HTML** (proper heading hierarchy)
4. **MUST support responsive layouts** (mobile, tablet, desktop)
5. **MUST provide search functionality** (for sites with >10 pages)
6. **MUST use consistent spacing** (base 4px grid)
7. **MUST distinguish code from prose** (monospace font, distinct styling)
8. **MUST provide clear navigation** (sidebar or equivalent)

Documentation websites implementing this design system MUST NOT:

1. **MUST NOT use decorative animations** (functional transitions only)
2. **MUST NOT use color alone for information** (accessibility)
3. **MUST NOT use small target sizes** (< 44x44px)
4. **MUST NOT auto-play content** (accessibility)
5. **MUST NOT use large border radius** (minimal aesthetic)
6. **MUST NOT use decorative colors** (neutral palette only)
7. **MUST NOT sacrifice readability for density** (adequate spacing required)
8. **MUST NOT create unpredictable layouts** (consistent patterns required)

---

## Agent Instructions

### When to Load This Document

Load `docs/foundation/documentation_design_system.md` when:
- Designing a documentation website
- Defining design tokens for documentation UI
- Establishing navigation patterns
- Planning layout and information architecture
- Making accessibility decisions

### Required Co-Loaded Documents

- Project-specific core identity document (for brand alignment)
- Implementation-specific design system document (for concrete details)
- Accessibility requirements document (if exists)

### Constraints Agents Must Enforce

1. MUST follow design principles (minimal, technical, trustworthy, deterministic)
2. MUST prioritize standardized components over custom implementations (Component Standardization Principle)
3. MUST use abstract design tokens as specified
4. MUST implement navigation patterns as described
5. MUST meet accessibility requirements
6. MUST maintain responsive behavior principles

### Forbidden Patterns

- Creating custom components when standardized alternatives exist in established component libraries
- Introducing decorative elements inconsistent with minimal aesthetic
- Using color without considering accessibility
- Creating non-keyboard-navigable UI
- Breaking semantic HTML structure
- Using large border radius or decorative animations

---

## Summary

This design system establishes generalized principles for documentation websites that prioritize:

1. **Minimal aesthetic**: Content-first, clean layouts, essential elements only
2. **Technical focus**: Monospace for code, structured layouts, developer-friendly
3. **Trustworthy presentation**: Professional colors, consistent patterns, clear feedback
4. **Deterministic behavior**: Predictable layouts, standard patterns, reproducible experiences

These principles create documentation experiences that are accessible, performant, and optimized for technical audiences while maintaining visual consistency and usability across devices and contexts.

For repository-specific implementation details (component libraries, CSS variables, build configuration), see the implementation documentation in your project's UI documentation directory.


