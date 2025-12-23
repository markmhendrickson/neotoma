# Contributing to Foundation

Thank you for contributing to Foundation! This document explains how to contribute improvements and maintain the shared processes.

## Principles

1. **Keep it generic** - Remove project-specific content
2. **Make it configurable** - Use `foundation-config.yaml` for customization
3. **Maintain backward compatibility** - Don't break existing consumers
4. **Document everything** - All changes need documentation
5. **Test thoroughly** - Verify changes work across different repos

## How to Contribute

### 1. Set Up Development Environment

```bash
# Clone foundation repository
git clone <foundation-repo>
cd foundation

# Test changes in a consuming repository
cd ../test-project
git submodule add ../foundation foundation
```

### 2. Make Changes

- Edit files in the foundation repository
- Test changes in a consuming repository
- Ensure configuration is flexible

### 3. Test Your Changes

```bash
# In a test repository
./foundation/scripts/validate-setup.sh

# Test specific components
./foundation/security/pre-commit-audit.sh
./foundation/development/worktree-setup.sh test-branch
```

### 4. Submit Changes

```bash
# In foundation repository
git add .
git commit -m "Add: description of changes"
git push origin main
```

## Types of Contributions

### Adding New Processes

1. Create new files in appropriate directory
2. Add configuration options to `foundation-config.yaml`
3. Update README.md with new component
4. Add integration scripts if needed

**Example: Adding a new security check**

```bash
# Create new security check
vim foundation/security/new-check.sh
chmod +x foundation/security/new-check.sh

# Add configuration
vim foundation/config/foundation-config.yaml
# security:
#   new_check:
#     enabled: false

# Document
vim foundation/security/README.md

# Test
./foundation/security/new-check.sh
```

### Improving Existing Processes

1. Identify improvement area
2. Make changes
3. Test in consuming repositories
4. Update documentation

### Fixing Bugs

1. Create issue describing bug
2. Fix bug in foundation
3. Test fix in consuming repositories
4. Reference issue in commit message

## Code Standards

### Scripts

- Use `#!/bin/bash` shebang
- Use `set -e` for error handling
- Add help text with `-h` flag
- Use colors for output (see existing scripts)
- Make scripts executable: `chmod +x`

### Documentation

- Follow documentation standards in `conventions/documentation-standards.md`
- Use clear, directive language
- Include examples
- Update README.md when adding new components

### Configuration

- Add new options to `foundation-config.yaml`
- Provide sensible defaults
- Document all options with comments
- Test with options enabled/disabled

## Testing Checklist

Before submitting changes:

- [ ] Changes work in at least 2 different repositories
- [ ] Configuration is flexible and documented
- [ ] No project-specific content included
- [ ] Scripts are executable and have help text
- [ ] Documentation is updated
- [ ] Backward compatibility maintained
- [ ] `validate-setup.sh` passes
- [ ] Security checks still work

## Review Process

1. **Self-review** - Check your own changes thoroughly
2. **Test in multiple repos** - Verify works across different projects
3. **Update docs** - Ensure documentation is current
4. **Get feedback** - Share with team/community if applicable

## Breaking Changes

If you need to make breaking changes:

1. Document the breaking change
2. Provide migration guide
3. Update MIGRATION.md
4. Increment major version
5. Notify consuming repositories

## Maintenance

### Adding New Language Support

To add support for a new language:

1. Add language section to `conventions/code-conventions.md`
2. Add naming patterns to `conventions/naming-patterns.yaml`
3. Add configuration to `foundation-config.yaml`
4. Add examples

### Updating Configuration Schema

When changing configuration:

1. Update `foundation-config.yaml` template
2. Update all repo adapters
3. Document new options
4. Provide backward-compatible defaults

## Best Practices

1. **Test before committing** - Always test in consuming repos
2. **Keep changes focused** - One improvement per commit
3. **Write clear commit messages** - Explain why, not just what
4. **Update documentation** - Keep docs in sync with code
5. **Consider backward compatibility** - Don't break existing users

## Questions?

If you have questions about contributing:

1. Check existing documentation
2. Review similar components in foundation
3. Ask in foundation repository issues/discussions

## License

By contributing to Foundation, you agree that your contributions will be licensed under the same license as the project.

