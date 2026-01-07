# Neotoma Documentation System

React-based documentation website with sidebar navigation, markdown rendering, and shadcn/ui components.

## Architecture

The documentation system follows the design principles defined in:
- **Foundation**: [`docs/foundation/documentation_design_system.md`](../../../docs/foundation/documentation_design_system.md) - Generalized design system principles
- **Implementation**: [`docs/ui/documentation_design_system_implementation.md`](../../../docs/ui/documentation_design_system_implementation.md) - Repository-specific implementation details

## Components

### Core Components

- **`DocumentationApp.tsx`** - Main application component
- **`DocumentationLayout.tsx`** - Layout wrapper with sidebar
- **`DocumentationSidebar.tsx`** - Navigation sidebar (responsive, using shadcn Sheet for mobile)
- **`DocumentationPage.tsx`** - Page wrapper with header/footer
- **`MarkdownContent.tsx`** - Markdown renderer with syntax highlighting

### Component Structure

```
frontend/src/docs/
├── main.tsx                     # Entry point
├── DocumentationApp.tsx         # Main app
├── DocumentationLayout.tsx      # Layout with sidebar
├── DocumentationSidebar.tsx     # Navigation sidebar
├── DocumentationPage.tsx        # Page wrapper
├── MarkdownContent.tsx          # Markdown renderer
└── README.md                    # This file
```

## Design System

### CSS Variables

Documentation-specific CSS variables are defined in `frontend/src/index.css`:

- `--doc-background` - Background color
- `--doc-foreground` - Primary text color
- `--doc-secondary` - Secondary text color
- `--doc-border` - Border color
- `--doc-code-bg` - Code block background
- `--doc-primary` - Primary action color (#0066CC)
- `--doc-primary-hover` - Primary hover state
- `--doc-radius-minimal` - Minimal border radius (2px)
- `--doc-radius-default` - Default border radius (4px)

### shadcn/ui Components Used

- **Sheet** - Mobile navigation drawer
- **ScrollArea** - Scrollable sidebar navigation
- **Button** - Navigation items and actions
- **Separator** - Section dividers
- **Input** - Search input

## Development

### Install Dependencies

```bash
npm install
```

Dependencies include:
- `react-markdown` - Markdown rendering
- `react-syntax-highlighter` - Code syntax highlighting
- `lucide-react` - Icons
- `@types/react-syntax-highlighter` - TypeScript types

### Development Server

Run the documentation app in development mode:

```bash
npm run docs:dev
```

This starts Vite dev server with hot reload at `http://localhost:5173`.

### Build for Production

Build the documentation app:

```bash
npm run docs:build
```

This builds both the main app and documentation app to `public/`.

### Serve Built App

Serve the built documentation app:

```bash
npm run docs:serve
```

This serves the documentation at `http://localhost:3000`.

## Features

### Responsive Sidebar

- **Desktop**: Fixed sidebar, always visible
- **Mobile/Tablet**: Collapsible drawer (Sheet component)
- **Collapsible sections**: Click section headers to expand/collapse
- **Active state highlighting**: Current page highlighted in navigation

### Markdown Rendering

- **Syntax highlighting**: Code blocks with language-specific highlighting
- **Copy to clipboard**: Copy button for code blocks
- **Custom styling**: Headings, lists, tables, blockquotes, links
- **Personal website aesthetic**: Minimal, clean, high contrast

### Search

- Search input in header (desktop)
- Keyboard shortcut support (planned)
- Integration with documentation index (planned)

## Styling

The documentation follows the personal website aesthetic:

- **Colors**: Black text on white background, #666 for secondary text
- **Typography**: Inter for UI text, JetBrains Mono for code
- **Spacing**: 4px base unit system
- **Border radius**: Minimal (2px for code, 4px for containers)
- **Contrast**: High contrast for accessibility (WCAG AA)

## Navigation Structure

The sidebar is organized into sections:

- **Overview**: Getting Started, What It Does, Core Workflow
- **API Reference**: MCP Actions, REST API
- **Architecture**: Overview, Data Models, Entity Resolution
- **Developer Guides**: Development Workflow, MCP Setup
- **Integration Guides**: Plaid Setup, Gmail Setup
- **Troubleshooting**: Common Issues

Update navigation in `DocumentationSidebar.tsx` by modifying the `navigationSections` array.

## Accessibility

- **Keyboard navigation**: All interactive elements keyboard accessible
- **Screen reader support**: Semantic HTML, ARIA labels
- **High contrast**: WCAG AA compliant contrast ratios
- **Responsive**: Works on all screen sizes
- **Focus indicators**: Visible focus states

## Dark Mode

The system supports dark mode through CSS variables:

- System preference detection
- Manual toggle (planned)
- All components support both light and dark themes

## Next Steps

### Planned Features

1. **Search functionality**: Full-text search across documentation
2. **Table of contents**: Auto-generated from headings
3. **Breadcrumbs**: Show navigation hierarchy
4. **Version selector**: Switch between documentation versions
5. **Theme toggle**: Manual dark/light mode switch
6. **Keyboard shortcuts**: Quick navigation (/, Cmd+K)

### Enhancement Opportunities

1. **Code tabs**: Multi-language code examples
2. **Callouts**: Note, warning, tip admonitions
3. **Collapsible sections**: Expand/collapse content blocks
4. **Copy feedback**: Toast notification on copy
5. **Analytics**: Track page views and search queries

## Contributing

When adding new documentation pages:

1. Add markdown files to `docs/` directory
2. Update `navigationSections` in `DocumentationSidebar.tsx`
3. Follow the design system guidelines
4. Ensure accessibility requirements are met
5. Test on mobile and desktop

## References

- **Foundation Document**: [`docs/foundation/documentation_design_system.md`](../../../docs/foundation/documentation_design_system.md)
- **Implementation Document**: [`docs/ui/documentation_design_system_implementation.md`](../../../docs/ui/documentation_design_system_implementation.md)
- **shadcn/ui Components**: [`docs/ui/SHADCN_COMPONENTS.md`](../../../docs/ui/SHADCN_COMPONENTS.md)
- **Design System**: [`docs/ui/design_system.md`](../../../docs/ui/design_system.md)


