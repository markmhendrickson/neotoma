---
name: shadcn
description: Add or update shadcn/ui components, tokens, and registry components in the Neotoma frontend.
triggers:
  - shadcn
  - /shadcn
  - add component
  - install component
  - shadcn registry
---

# shadcn Skill

Use this skill when adding UI components, theme tokens, or integrating community/registry components from the shadcn ecosystem.

## Project Configuration

- **components.json**: repo root (`/components.json`)
- **Component output**: `frontend/src/components/ui/`
- **Tailwind config**: `tailwind.config.mjs` (repo root)
- **CSS tokens**: `frontend/src/index.css` (`@layer base` — CSS variables for light/dark)
- **Install command** (run from repo root):
  ```bash
  npx shadcn@latest add <component-name>
  ```

## Decision Tree: Which Component to Use

Work through these layers in order. Stop at the first match.

### 1. Core shadcn/ui (already installed)

Check `frontend/src/components/ui/` first. If the component is there, import and use it.

**Currently installed:**
`accordion`, `alert`, `avatar`, `badge`, `breadcrumb`, `button`, `card`, `checkbox`, `collapsible`, `command`, `dialog`, `dropdown-menu`, `form`, `input`, `input-group`, `label`, `navigation-menu`, `popover`, `progress`, `scroll-area`, `section-divider`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `sonner`, `switch`, `table`, `tabs`, `textarea`, `toast`, `toaster`, `tooltip`

### 2. Standard shadcn/ui (not yet installed)

If the component appears on [https://ui.shadcn.com/docs/components](https://ui.shadcn.com/docs/components), install it:

```bash
npx shadcn@latest add <component-name>
```

Common candidates not yet installed:
- `alert-dialog` — destructive confirmation dialogs
- `calendar` — date pickers
- `radio-group` — single-choice options
- `slider` — numeric range inputs
- `toggle`, `toggle-group` — toggle buttons
- `context-menu` — right-click menus
- `hover-card` — hover information cards
- `menubar` — application menu bars
- `pagination` — paginated data navigation
- `resizable` — resizable panel layouts

### 3. shadcn/ui Registry (community components)

If the standard library doesn't cover the use case, check the registry:
**URL**: [https://ui.shadcn.com/docs/registry](https://ui.shadcn.com/docs/registry)
**Directory**: [https://ui.shadcn.com/docs/directory](https://ui.shadcn.com/docs/directory)

Registry components are installable via URL:
```bash
npx shadcn@latest add <registry-url>
```

**When to use the registry:**
- Complex data tables with sorting/filtering/pagination (look for `data-table` variants)
- Date range pickers with calendar integration
- Multi-select combobox / tag inputs
- Rich text editors (Tiptap-based)
- File upload dropzones
- Color pickers
- Phone number inputs with country code
- Image cropping / upload components
- Charts (Recharts-based — `chart` from shadcn is standard, but registry has extensions)
- Timeline/feed components
- Drag-and-drop list/board components
- Code editors (Monaco/CodeMirror wrappers)

**How to find registry components:**

1. Browse [https://ui.shadcn.com/docs/directory](https://ui.shadcn.com/docs/directory) for the component category
2. Each listing shows the install URL — copy it exactly
3. Install: `npx shadcn@latest add <url>`
4. Component lands in `frontend/src/components/ui/` automatically

**Example — installing a registry component:**
```bash
# Find component URL from directory, then:
npx shadcn@latest add https://ui.shadcn.com/r/<component-name>.json
```

### 4. Custom hand-rolled component

Only build a custom component when:
- No shadcn or registry equivalent exists
- The registry equivalent has too many dependencies for the use case
- The component requires behavior that conflicts with Radix UI primitives

If building custom, still:
- Use `cn()` from `@/lib/utils` for class merging
- Use CVA for variants where applicable
- Follow the token system (see Token System section)

---

## Token System

All Tailwind classes must use the registered tokens. Never use arbitrary values that have a named token.

### Color tokens

```
bg-background / text-foreground
bg-muted / text-muted-foreground
bg-card / text-card-foreground
bg-popover / text-popover-foreground
bg-primary / text-primary-foreground
bg-secondary / text-secondary-foreground
bg-destructive / text-destructive-foreground
bg-accent / text-accent-foreground
border-border
ring-ring
bg-success / text-success
bg-warning / text-warning
bg-info / text-info
border-divider
bg-entity-person / bg-entity-company / bg-entity-location / bg-entity-event / bg-entity-document
```

### Font-size tokens

| Token | Size | Use |
|---|---|---|
| `text-caption` | 11px | Smallest labels, timestamps |
| `text-fine` | 12px | Secondary metadata, captions |
| `text-ui` | 13px | Primary UI text, table cells |
| `text-base` | 14px | Nav items, sidebar text |
| `text-body` | 15px | Body copy |
| `text-body-lg` | 16px | Larger body |
| `text-small` | 13px | Small alias |
| `text-mono` | 14px | Monospace |

Do not use `text-[11px]`, `text-[12px]`, `text-[13px]`, or `text-[14px]` — use the named tokens above.

### Shadow token

Use `shadow-card` instead of `shadow-[0px_15px_30px_0px_rgba(0,0,0,0.05)]`.

### Gradient classes

For radial gradient backgrounds, use the named CSS classes from `index.css`:
- `.gradient-hero-success` — green+blue hero radial
- `.gradient-hero-destructive` — red/destructive hero radial
- `.gradient-section-teal` — teal diagnostic overlay

---

## Installing Components

### Standard install (from repo root)

```bash
cd /path/to/neotoma
npx shadcn@latest add <component-name>
```

Answer prompts:
- If asked to overwrite `components.json`: **n** (preserve existing config)
- If asked to overwrite an existing component: **n** unless intentionally upgrading

### Registry install

```bash
npx shadcn@latest add <full-registry-url>
# Example:
npx shadcn@latest add https://ui.shadcn.com/r/data-table.json
```

### After installing

1. Verify the new file appears in `frontend/src/components/ui/`
2. Check for any new dependencies added to `package.json`
3. Run `npm install` if new dependencies were added
4. Verify the component uses the project's token system (update if it uses hardcoded colors/sizes)

---

## Replacing Hand-Rolled Patterns

### Expand/collapse → Accordion

Replace:
```tsx
<button type="button" className="group flex items-center gap-2 w-full text-left focus:outline-none">
  {/* trigger */}
</button>
{isOpen && <div>{/* content */}</div>}
```

With:
```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

<Accordion type="single" collapsible>
  <AccordionItem value="item-1">
    <AccordionTrigger>Trigger text</AccordionTrigger>
    <AccordionContent>Content</AccordionContent>
  </AccordionItem>
</Accordion>
```

### Raw checkbox → Checkbox

Replace:
```tsx
<input type="checkbox" className="rounded border-input" />
```

With:
```tsx
import { Checkbox } from "@/components/ui/checkbox";
<Checkbox id="my-checkbox" />
```

### Raw button → Button

Replace:
```tsx
<button type="button" className="...custom styles...">
```

With:
```tsx
import { Button } from "@/components/ui/button";
<Button variant="ghost" size="sm">Label</Button>
```

Available variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`
Available sizes: `default`, `sm`, `lg`, `icon`

---

## Key References

- Installed components inventory: `docs/ui/shadcn_components.md`
- Design system spec: `docs/ui/design_system.md`
- Token definitions (CSS variables): `frontend/src/index.css`
- Token registrations (Tailwind): `tailwind.config.mjs`
- shadcn/ui docs: https://ui.shadcn.com/docs
- Component registry/directory: https://ui.shadcn.com/docs/directory
- Radix UI primitives: https://www.radix-ui.com/
