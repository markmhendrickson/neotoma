# Shared UI Components Submodule Setup

This document describes how to set up and use the shared UI components as a git submodule.

## Overview

The shared UI components (`shared-ui-components`) are maintained as a separate git repository and included in both ateles and neotoma as submodules. This allows:

- Single source of truth for shared components
- Version control across projects
- Independent development and releases
- Easy updates across all consuming projects

## Repository Structure

```
react-components/
├── components/
│   ├── ui/              # Base UI components (sidebar, breadcrumb, button)
│   ├── Layout.jsx       # Configurable layout component
│   ├── AppSidebar.jsx   # Configurable sidebar navigation
│   └── ErrorBoundary.jsx # Error boundary component
├── lib/
│   └── utils.js         # Utility functions (cn helper)
├── README.md
├── package.json
└── .gitignore
```

## Initial Setup

### Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `react-components`
3. Description: "Shared React UI components for ateles and neotoma"
4. Set to Private (if needed)
5. **Do NOT** initialize with README, .gitignore, or license
6. Click "Create repository"

### Step 2: Push React Components Repository

The repository is already set up at `~/repos/react-components`. Push it to GitHub:

```bash
cd ~/repos/react-components

# Add remote (replace with your actual repo URL)
git remote add origin git@github.com:markmhendrickson/react-components.git

# Push to remote
git push -u origin main
```

The repository includes:
- GitHub Actions CI workflows (type-check, lint, build)
- TypeScript configuration
- Proper package.json for npm publishing
- Complete component library structure

### Step 3: Remove from Ateles Parent Repo

```bash
cd /Users/markmhendrickson/repos/ateles

# Remove the shared directory from git tracking (keep files)
git rm -r --cached execution/website/shared

# Commit the removal
git commit -m "Remove shared directory (converting to submodule)"
```

### Step 4: Add as Submodule to Ateles

```bash
cd /Users/markmhendrickson/repos/ateles

# Remove existing shared directory from git (keep files if needed)
git rm -r --cached execution/website/shared 2>/dev/null || true
rm -rf execution/website/shared

# Add submodule
git submodule add git@github.com:markmhendrickson/react-components.git execution/website/shared

# Commit the submodule addition
git add .gitmodules execution/website/shared
git commit -m "Add react-components as submodule"
```

### Step 5: Add as Submodule to Neotoma

```bash
cd /Users/markmhendrickson/repos/neotoma

# Add submodule
git submodule add git@github.com:markmhendrickson/react-components.git frontend/src/shared

# Commit the submodule addition
git add .gitmodules frontend/src/shared
git commit -m "Add react-components as submodule"
```

**Or use the setup script:**

```bash
cd /Users/markmhendrickson/repos/neotoma
./scripts/complete_submodule_setup.sh git@github.com:markmhendrickson/react-components.git
```

### Step 6: Update Vite Configuration

**In Neotoma (`frontend/vite.config.ts`):**

```typescript
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
    "@shared": path.resolve(__dirname, "./src/shared"), // Add this
  },
},
```

**In Ateles websites (`vite.config.js`):**

```javascript
resolve: {
  alias: {
    '@shared': path.resolve(__dirname, '../shared'),
  },
},
```

## Using the Submodule

### Cloning a Repository with Submodules

When cloning a repository that uses submodules:

```bash
# Clone with submodules
git clone --recurse-submodules <repository-url>

# Or if already cloned, initialize submodules
git submodule update --init --recursive
```

### Updating Submodule to Latest Version

```bash
cd <repository-root>

# Update submodule to latest commit
cd frontend/src/shared  # or execution/website/shared in ateles
git pull origin main
cd ../..

# Commit the submodule update
git add frontend/src/shared
git commit -m "Update shared-ui-components submodule"
```

### Updating Submodule to Specific Version

```bash
cd frontend/src/shared  # or execution/website/shared in ateles

# Checkout specific commit or tag
git checkout <commit-hash>
# or
git checkout v1.0.0  # if using tags

cd ../..
git add frontend/src/shared
git commit -m "Pin shared-ui-components to v1.0.0"
```

### Making Changes to Shared Components

1. **Make changes in the submodule:**

```bash
cd frontend/src/shared  # or execution/website/shared in ateles

# Make your changes
# ... edit files ...

# Commit in submodule
git add .
git commit -m "Add new feature to Layout component"
git push origin main
```

2. **Update parent repository to use new version:**

```bash
cd <repository-root>

# Update submodule reference
cd frontend/src/shared
git pull origin main
cd ../..

# Commit the update
git add frontend/src/shared
git commit -m "Update shared-ui-components: Add new feature"
```

## Workflow Best Practices

### Development Workflow

1. **For shared component changes:**
   - Work directly in the submodule directory
   - Test in one project first
   - Commit and push to shared repository
   - Update other projects to use new version

2. **For project-specific changes:**
   - Don't modify shared components directly
   - Create project-specific wrappers or extensions
   - Consider contributing changes back to shared if generally useful

### Versioning Strategy

- Use git tags for stable releases: `v1.0.0`, `v1.1.0`, etc.
- Pin submodules to specific tags for production
- Use `main` branch for development/testing

### Troubleshooting

**Submodule shows as modified when it shouldn't:**

```bash
# This usually means the submodule is on a different commit
cd frontend/src/shared
git status  # Check what's different
git checkout main  # Reset to tracked commit
```

**Submodule is empty after clone:**

```bash
# Initialize and update submodules
git submodule update --init --recursive
```

**Need to remove submodule:**

```bash
# Remove submodule
git submodule deinit -f frontend/src/shared
git rm -f frontend/src/shared
rm -rf .git/modules/frontend/src/shared
git commit -m "Remove react-components submodule"
```

## Migration from Current Setup

If you're migrating from the current setup (components copied in each repo):

1. Follow steps 1-6 above to set up submodule
2. Update imports in your code:
   - Change `@/components/Layout` → `@shared/components/Layout`
   - Change `@/components/ErrorBoundary` → `@shared/components/ErrorBoundary`
   - etc.
3. Remove old copied components
4. Test thoroughly
5. Commit changes

## Related Documentation

- [Git Submodules Documentation](https://git-scm.com/book/en/v2/Git-Tools-Submodules)
- [Shared Components README](../../../frontend/src/shared/README.md) (after submodule is added)
