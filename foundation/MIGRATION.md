# Migration Guide

This guide helps you migrate from project-specific processes to Foundation.

## Overview

Migration involves:

1. **Installing Foundation** - Add as submodule or symlink
2. **Creating Configuration** - Define repo-specific settings
3. **Migrating Content** - Move generic processes to foundation
4. **Updating References** - Point to foundation instead of local docs
5. **Testing** - Verify everything works

## Step-by-Step Migration

### Step 1: Install Foundation

```bash
# Method A: As git submodule (recommended)
git submodule add <foundation-repo-url> foundation

# Method B: As local symlink (for testing)
ln -s ../foundation foundation
```

### Step 2: Create Configuration

```bash
# Copy template
cp foundation/config/foundation-config.yaml ./foundation-config.yaml

# Customize for your repository
vim foundation-config.yaml
```

**Configure:**

- Repository name and type
- Branch naming patterns
- Code conventions (file naming, string quotes, etc.)
- Security rules (protected paths)
- Enable/disable optional features

### Step 3: Migrate Documentation

**Identify Generic Documentation:**

Look for documentation that could apply to any project:

- Development workflow
- Code conventions
- Testing standards
- Security practices

**Keep Project-Specific Documentation:**

Keep documentation that is unique to your project:

- Product specifications
- Architecture decisions
- Business logic
- Domain models

**Update References:**

```markdown
<!-- Before -->
See [Code Conventions](docs/conventions/code-conventions.md)

<!-- After -->
See [Code Conventions](foundation/conventions/code-conventions.md)
```

### Step 4: Migrate Scripts

**Generic Scripts → Foundation:**

Move scripts that could work in any project:

- Worktree setup scripts
- Security audit scripts
- Environment setup scripts

**Keep Project-Specific Scripts:**

Keep scripts that are specific to your project:

- Deployment scripts
- Database migration scripts
- Project-specific build scripts

### Step 5: Update Git Configuration

**Add to `.gitignore`:**

```
# Foundation local overrides
foundation-config.local.yaml

# Keep existing patterns
.env*
.secrets/
```

**Add git hooks (optional):**

```bash
# Copy pre-commit hook
cp foundation/security/pre-commit-audit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### Step 6: Test Migration

```bash
# Validate setup
./foundation/scripts/validate-setup.sh

# Test key workflows
./foundation/development/worktree-setup.sh test-branch
./foundation/security/pre-commit-audit.sh

# Run your tests
npm test  # or your test command
```

### Step 7: Update Team Documentation

Update onboarding docs and README to reference foundation:

```markdown
## Development

This project uses [Foundation](foundation/README.md) for development processes.

Key documents:
- [Development Workflow](foundation/development/workflow.md)
- [Code Conventions](foundation/conventions/code-conventions.md)
- [Security Rules](foundation/security/security-rules.md)
```

## Common Migration Scenarios

### Scenario 1: Migrating from Feature Branch Workflow

**Before:** Traditional feature branches

```bash
git checkout -b feature/my-feature
# ... develop ...
git push origin feature/my-feature
```

**After:** Foundation workflow with worktrees

```bash
./foundation/development/worktree-setup.sh my-feature
cd ../repo-my-feature
# ... develop ...
git push
```

**Configuration:**

```yaml
development:
  workflow:
    use_worktrees: true
```

### Scenario 2: Migrating Code Conventions

**Before:** Project-specific conventions doc

```
docs/
└── conventions.md  # All conventions in one file
```

**After:** Foundation conventions + repo adapter

```
foundation/conventions/code-conventions.md  # Generic conventions
foundation-config.yaml                      # Repo-specific overrides

# In foundation-config.yaml:
conventions:
  typescript:
    files: "kebab-case"  # Override if different
```

### Scenario 3: Migrating Security Practices

**Before:** Manual security checks

```bash
# Developer manually checks for secrets before commit
grep -r "api_key" .
```

**After:** Automated security audit

```bash
# Automatic via git hook
./foundation/security/pre-commit-audit.sh
```

## Handling Project-Specific Content

### Option 1: Configuration

For simple differences, use configuration:

```yaml
# foundation-config.yaml
conventions:
  typescript:
    files: "kebab-case"  # Override foundation default
```

### Option 2: Repo Adapter

For complex overrides, create a repo adapter:

```yaml
# foundation/config/repo-adapters/my-repo.yaml
repo_name: "my-repo"

# Override multiple settings
conventions:
  typescript:
    files: "kebab-case"
  sql:
    tables: "PascalCase"  # Different from foundation

security:
  pre_commit_audit:
    protected_paths:
      - "sensitive/"  # Custom protected path
```

### Option 3: Extend Foundation

For project-specific processes, keep separate:

```
docs/
├── project-specific/
│   ├── domain-model.md
│   ├── api-spec.md
│   └── deployment.md
foundation/ (submodule)
└── ...
```

## Rollback Plan

If migration causes issues:

1. **Remove foundation submodule:**

```bash
git submodule deinit foundation
git rm foundation
rm foundation-config.yaml
```

2. **Restore original documentation:**

```bash
git revert <migration-commit>
```

3. **Fix issues and try again later**

## Gradual Migration

You can migrate gradually:

**Phase 1:** Install foundation, configure, but keep using existing docs

```yaml
# foundation-config.yaml
documentation:
  enforce_agent_instructions: false  # Don't enforce yet
```

**Phase 2:** Migrate development workflow

- Start using foundation workflow
- Update references in README

**Phase 3:** Migrate conventions

- Start using foundation conventions
- Update linter configs

**Phase 4:** Migrate security

- Enable security checks
- Add git hooks

**Phase 5:** Full migration

- Remove duplicate documentation
- Enable all foundation features

## Validation

After migration, verify:

- [ ] `./foundation/scripts/validate-setup.sh` passes
- [ ] All team members can follow new workflow
- [ ] CI/CD still works
- [ ] Documentation is accessible
- [ ] Scripts are executable
- [ ] Configuration is correct

## Troubleshooting

### Issue: Submodule not updating

```bash
git submodule update --init --recursive
git submodule update --remote foundation
```

### Issue: Scripts not executable

```bash
chmod +x foundation/scripts/*.sh
chmod +x foundation/security/*.sh
chmod +x foundation/development/*.sh
```

### Issue: Configuration not taking effect

Check configuration file location and syntax:

```bash
# Should be in repository root
ls foundation-config.yaml

# Validate YAML syntax
python -c "import yaml; yaml.safe_load(open('foundation-config.yaml'))"
```

### Issue: Git hooks not working

```bash
# Reinstall hooks
cp foundation/security/pre-commit-audit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Test hook
.git/hooks/pre-commit
```

## Getting Help

If you encounter issues during migration:

1. Check `foundation/README.md` for documentation
2. Review `foundation-config.yaml` for configuration options
3. Test in a separate branch first
4. Ask for help in foundation repository

## Post-Migration

After successful migration:

1. **Document your configuration** - Add comments to `foundation-config.yaml`
2. **Train team** - Ensure everyone understands new processes
3. **Monitor adoption** - Check that team is following foundation
4. **Contribute back** - Share improvements with foundation
5. **Stay updated** - Regularly sync foundation updates

```bash
# Regular updates
git submodule update --remote foundation
```

