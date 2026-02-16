<!-- Source: docs/conventions/ui_imports_rules.mdc -->

# UI Component Import Path Rules

## Purpose

Ensures agents use correct import paths for UI components and hooks, preventing runtime errors from incorrect module resolution.

## Scope

This document covers:
- Correct import paths for shadcn/ui components
- Correct import paths for custom hooks
- Pattern detection for common import errors
- Automatic correction rules

This document does NOT cover:
- General TypeScript import conventions (see `code_conventions_rules.mdc`)
- Component implementation details

## Trigger Patterns

When agents import UI components or hooks, they MUST use the correct import paths:

### UI Components (shadcn/ui)

All shadcn/ui components MUST be imported from `@/components/ui/`:

- `@/components/ui/button` (Button)
- `@/components/ui/card` (Card, CardContent, CardHeader, CardTitle, CardDescription)
- `@/components/ui/dialog` (Dialog, DialogContent, DialogHeader, DialogTitle, etc.)
- `@/components/ui/input` (Input)
- `@/components/ui/label` (Label)
- `@/components/ui/textarea` (Textarea)
- `@/components/ui/select` (Select, SelectContent, SelectItem, SelectTrigger, SelectValue)
- `@/components/ui/badge` (Badge)
- `@/components/ui/use-toast` (useToast, toast)
- All other shadcn/ui components follow this pattern

### Custom Hooks

Custom application hooks MUST be imported from `@/hooks/`:

- `@/hooks/useSettings` (useSettings)
- `@/hooks/useKeys` (useKeys)
- `@/hooks/useMCPConfig` (useMCPConfig)

**Exception:** `useToast` is from shadcn/ui, so it lives in `@/components/ui/use-toast`, NOT `@/hooks/use-toast`.

### Contexts

Application contexts MUST be imported from `@/contexts/`:

- `@/contexts/AuthContext` (useAuth, AuthProvider)

## Agent Actions

### When Writing New Components

1. **Check existing imports in similar components:**
   - Search for existing usage: `grep -r "import.*useToast" frontend/src`
   - Verify import path matches existing pattern

2. **Verify component exports exist:**
   - Read the component file to check available exports
   - Example: Read `frontend/src/components/ui/dialog.tsx` to verify `DialogFooter` exists
   - Search for the export: `grep -r "export.*DialogFooter" frontend/src`
   - If export doesn't exist, either:
     - Use an alternative component that exists
     - Add the missing export to the component file
     - Use plain HTML/div with appropriate styling

3. **Use correct import paths:**
   - shadcn/ui components → `@/components/ui/{component}`
   - Custom hooks → `@/hooks/{hook}`
   - Contexts → `@/contexts/{context}`

4. **Never assume components exist:**
   - Always verify exports before importing
   - Check the actual component file for available exports
   - Don't rely on typical shadcn/ui patterns - verify what's actually exported

### When Detecting Import Errors

If Vite shows "Failed to resolve import" errors:

1. **Identify the incorrect import path** from error message
2. **Search for correct location:**
   ```bash
   # Find the actual export
   grep -r "export.*{component}" frontend/src
   ```
3. **Update all affected files** with correct import path
4. **Verify build passes** after fix

### Pattern Detection Rules

**Common mistakes:**

- ❌ `@/hooks/use-toast` → ✅ `@/components/ui/use-toast`
- ❌ `@/components/useToast` → ✅ `@/components/ui/use-toast`
- ❌ `@/ui/button` → ✅ `@/components/ui/button`
- ❌ Importing `DialogFooter` without verifying it exists → ✅ Check exports first, add if missing

**Detection logic:**

1. If import includes `use-toast` or `useToast`:
   - MUST use `@/components/ui/use-toast`
   - This is a shadcn/ui component, not a custom hook

2. If import starts with `@/components/ui/`:
   - Component must exist in `frontend/src/components/ui/`
   - Verify file exists before using import

3. If import starts with `@/hooks/`:
   - Hook must exist in `frontend/src/hooks/`
   - Verify file exists before using import

## Constraints

Agents MUST:
- **Read component files to verify exports exist** before importing them
- Verify import paths by checking existing usage before writing new imports
- Search for exports to find correct location
- Use `@/components/ui/use-toast` for toast functionality (not `@/hooks/use-toast`)
- Add missing exports to component files if they're standard shadcn/ui components (e.g., DialogFooter)
- Fix import errors immediately when detected by Vite
- Update all affected files when fixing import paths

Agents MUST NOT:
- Import components without verifying they exist in the source file
- Assume import paths without verification
- Assume standard shadcn/ui components exist without checking (e.g., DialogFooter may not be exported)
- Use incorrect import paths based on naming patterns
- Leave import errors unresolved
- Create custom import paths that don't match existing patterns

## Validation Checklist

Before completing component creation:

- [ ] **Read UI component files to verify all imports are actually exported**
- [ ] All UI component imports use `@/components/ui/` path
- [ ] `useToast` import uses `@/components/ui/use-toast` (not `@/hooks/use-toast`)
- [ ] Custom hook imports use `@/hooks/` path
- [ ] Context imports use `@/contexts/` path
- [ ] All imported components exist in their source files (verified by reading the file)
- [ ] Missing exports added to component files if needed (e.g., DialogFooter)
- [ ] Build passes without import resolution errors
- [ ] Vite dev server loads components without errors

## Integration with Existing Rules

This rule complements:
- `conventions/code_conventions_rules.mdc` - General TypeScript conventions
- `conventions/documentation_standards_rules.mdc` - Documentation structure

## Forbidden Patterns

- Using `@/hooks/use-toast` (incorrect location)
- Using `@/ui/*` instead of `@/components/ui/*`
- Guessing import paths without verification
- Leaving unresolved import errors
