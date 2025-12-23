# Agent Instructions

Optional agent instruction templates for AI coding assistants.

## Overview

Foundation provides generic agent instruction patterns that can be customized for your project:

- **Agent Instructions Template** - Standard structure for agent instructions in docs
- **Cursor Rules** - Generic rules for Cursor AI
- **Cursor Commands** - Generic command templates

All agent instructions are optional and configurable via `foundation-config.yaml`.

## Configuration

```yaml
agent_instructions:
  enabled: true
  location: "docs/foundation/agent_instructions.md"
  cursor_rules:
    enabled: true
    location: ".cursor/rules/"
  cursor_commands:
    enabled: true
    location: ".cursor/commands/"
  constraints: []
    # Project-specific constraints
    # - "Never commit secrets"
    # - "Always update documentation when code changes"
  validation_checklist:
    enabled: true
    custom_checks: []
```

## Agent Instructions Template

Standard structure for "Agent Instructions" sections in documentation.

### Format

```markdown
## Agent Instructions

### When to Load This Document
[Specific triggers for loading this doc]

### Required Co-Loaded Documents
- [Project manifest]
- [Related docs]

### Constraints Agents Must Enforce
1. [Constraint 1]
2. [Constraint 2]

### Forbidden Patterns
- [Anti-pattern 1]
- [Anti-pattern 2]

### Validation Checklist
- [ ] Requirement 1
- [ ] Requirement 2
```

### Usage

Add to documentation files where agent behavior needs guidance:

```markdown
# Feature Implementation Guide

[... main content ...]

---

## Agent Instructions

### When to Load This Document
Load when implementing or modifying feature X.

### Required Co-Loaded Documents
- `docs/architecture/overview.md`
- `docs/testing/standards.md`

### Constraints Agents Must Enforce
1. All functions must include error handling
2. Database changes require migration file
3. New endpoints require tests

### Forbidden Patterns
- No direct database queries in controllers
- No hardcoded configuration values

### Validation Checklist
- [ ] Tests cover all code paths
- [ ] Documentation updated
- [ ] Migration file created (if schema changes)
```

## Generic Cursor Rules

Foundation provides templates for generic Cursor rules:

### 1. Instruction Documentation (`cursor-rules/instruction_documentation.md`)
Rules for documenting instructions in code and docs.

### 2. Downstream Doc Updates (`cursor-rules/downstream_doc_updates.md`)
Rules for updating dependent documentation when upstream docs change.

### 3. README Maintenance (`cursor-rules/readme_maintenance.md`)
Rules for keeping README.md in sync with documentation.

### 4. Security Rules (`cursor-rules/security.md`)
Generic security patterns and checks.

### 5. Worktree Environment (`cursor-rules/worktree_env.md`)
Rules for handling environment files in worktrees.

## Generic Cursor Commands

Foundation provides templates for generic commands:

### 1. Commit Command (`cursor-commands/commit.md`)
Generic commit workflow with security audit and testing.

### Usage

Copy generic rules/commands to your `.cursor/` directory:

```bash
# Copy generic rules
cp foundation/agent-instructions/cursor-rules/*.md .cursor/rules/

# Copy generic commands
cp foundation/agent-instructions/cursor-commands/*.md .cursor/commands/

# Add repo-specific rules/commands
vim .cursor/rules/my_rule.md
vim .cursor/commands/my_command.md
```

## Generic vs Repo-Specific

### Generic (Foundation)
- Instruction documentation patterns
- Security rules (generic patterns)
- README maintenance rules
- Worktree environment rules
- Commit workflow

### Repo-Specific (Your Repo)
- Feature creation workflows
- Release management
- Project-specific validations
- Domain-specific rules

## Best Practices

1. **Use foundation templates** - Start with generic patterns
2. **Customize for your project** - Add project-specific constraints
3. **Keep it actionable** - Make instructions clear and specific
4. **Update regularly** - Keep instructions current as project evolves
5. **Test with agents** - Verify agents follow instructions correctly

## Example: Project-Specific Agent Instructions

```markdown
# docs/foundation/agent_instructions.md

## Repository-Wide Agent Instructions

### Loading Order
1. Load `docs/foundation/agent_instructions.md` (this file)
2. Load project manifest
3. Load specific feature/module docs

### Constraints
1. **Never commit secrets** - Run security audit before commit
2. **Always update tests** - Add tests for all new functionality
3. **Update documentation** - Keep docs in sync with code changes
4. **Follow conventions** - See `foundation/conventions/code-conventions.md`

### Forbidden Patterns
- Committing to main/dev directly
- Skipping tests
- Using deprecated APIs
- Hardcoding configuration

### Validation Checklist
- [ ] Security audit passed
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Code follows conventions
- [ ] No secrets committed
```

## Integration

Agent instructions integrate with:

- **Documentation standards** - Standard "Agent Instructions" sections
- **Code conventions** - Reference coding standards
- **Security rules** - Enforce security checks
- **Testing standards** - Enforce test requirements

## References

See project-specific examples:
- Neotoma: `docs/foundation/agent_instructions.md`
- Neotoma: `.cursor/rules/` directory
- Neotoma: `.cursor/commands/` directory

