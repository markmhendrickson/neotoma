---
description: "Defines how agents MUST document important instructions, constraints, and guidelines in appropriate files"
globs: ["**/*"]
alwaysApply: true
---

<!-- Source: foundation/agent_instructions/cursor_rules/instruction_documentation.mdc -->

# Instruction Documentation Rule

_(Cursor Rule: Agent Behavior)_

---

## Purpose

This document defines how agents MUST document important instructions, constraints, and guidelines in appropriate files. It ensures all instructions are available to Cursor agents via the symlinked rule structure, avoiding single points of failure.

## Scope

This rule covers:
- When and how to document "always" and "never" instructions
- Where to place rules (global vs repository-specific)
- How rules are discovered via symlink structure
- Format standards for rule files

This rule does NOT cover:
- Content of specific rules (covered by individual rule files)
- Documentation standards for non-rule documentation (see `foundation/conventions/documentation_standards.md`)

## Configuration

All instructions are Cursor rules, stored in two scopes:

```yaml
cursor_rules:
  # Global rules (for all repos using foundation)
  global:
    enabled: true
    location: "foundation/agent_instructions/cursor_rules/"
  
  # Repository-specific rules (for this repo only)
  repository:
    enabled: true
    # Examples of common locations (choose appropriate docs/ subdirectory based on topic):
    example_locations:
      - "docs/conventions/"           # Code and documentation conventions
      - "docs/foundation/"             # Foundation and architectural rules
      - "docs/feature_units/standards/" # Feature unit workflow rules
      - "docs/developer/"              # Development workflow rules
```

**Note:** All `*_rules.md` files in `docs/` are automatically symlinked to `.claude/rules/` via the setup script. No central reference file is needed. Rules are discoverable via the symlink structure.

## Trigger Patterns

Agents MUST document instructions immediately during the same conversation, before proceeding with other work.

**High-priority triggers:**
- "always do X" or "never do Y"
- "remember to" or "make sure to"
- "all agents should" or "everyone must"

**Standard triggers:**
- Code style, patterns, conventions
- Architectural constraints or boundaries
- Workflow processes or procedures
- Testing requirements or standards
- Documentation standards
- Security or privacy requirements
- Error handling or validation rules
- Repository-wide policies

## Meta-Rule: Creating Rules

When user says "always X" or "never Y", agents MUST:

1. Recognize as rule creation request (all rules are Cursor rules)
2. Determine scope:
   - **Global rule** (benefits all repos using foundation): `foundation/agent_instructions/cursor_rules/{topic}.mdc` (MUST use `.mdc` extension)
   - **Repository rule** (this repo only): Place in appropriate `docs/` subdirectory based on topic. MUST NOT use `.claude/rules/`
     - Examples (choose subdirectory that best matches rule's topic):
       - Code/documentation conventions → `docs/conventions/{topic}_rules.md`
       - Foundation/architectural → `docs/foundation/{topic}_rules.md`
       - Feature unit workflows → `docs/feature_units/standards/{topic}_rules.md`
       - Development workflows → `docs/developer/{topic}_rules.md`
3. Create rule immediately without asking for confirmation
4. Update references (foundation README for global rules, repo docs for repository rules)

**Decision tree:**
- Benefits ALL repos using foundation → Global rule (`foundation/agent_instructions/cursor_rules/`)
- Generic agent behavior → Global rule (`foundation/agent_instructions/cursor_rules/`)
- Repository-specific domain/architecture → Repository rule (appropriate `docs/` subdirectory)
- Project-specific features/constraints → Repository rule (appropriate `docs/` subdirectory)

## Instruction Classification

Rules are classified by scope and topic:

**Global rules:**
- Location: `foundation/agent_instructions/cursor_rules/`
- Scope: All repos using foundation
- Examples: Generic agent behavior, cross-repo patterns

**Repository rules:**
- Location: Appropriate `docs/` subdirectory based on topic
- Scope: This repo only
- Examples:
  - Workflow/process instructions → `docs/feature_units/standards/` or `docs/developer/`
  - Architectural constraints → `docs/foundation/` or `docs/architecture/`
  - Code conventions → `docs/conventions/`
- MUST NOT use `.claude/rules/` directly (rules are symlinked automatically)

## Documenting Instructions

**For repository-wide agent instructions:**
1. Search `docs/` for existing `*_rules.md` files that match the instruction topic
2. Add instruction to appropriate rule file using RFC 2119 directive language
3. Create new rule file if no appropriate existing file exists (see "For Cursor rules" below)

**For Cursor rules (all rules are Cursor rules):**
1. Determine scope:
   - **Global rule** (all repos) → `foundation/agent_instructions/cursor_rules/{topic}.mdc` (MUST use `.mdc` extension)
   - **Repository rule** (this repo) → `docs/{appropriate_subdirectory}/{topic}_rules.md` based on topic
     - Examples (choose subdirectory that best matches rule's topic):
       - Code/documentation conventions → `docs/conventions/`
       - Foundation/architectural → `docs/foundation/`
       - Feature unit workflows → `docs/feature_units/standards/`
       - Development workflows → `docs/developer/`
2. MUST NOT use `.claude/rules/` directly
3. Use filename: 
   - Foundation rules: `{topic}.mdc` or `{topic}_management.mdc` (MUST use `.mdc`)
   - Repository rules: `{topic}_rules.md` or `{topic}_management.md`
4. Follow existing rule format (Purpose, Trigger Patterns, Agent Actions, Constraints)
5. Update references if applicable

**For documentation-only instructions (not rules):**
1. Document in appropriate `docs/` subdirectory based on topic
2. MUST NOT store documentation in repo root
3. Store temporary assessment/analysis files in `tmp/` directory
4. Update references if applicable

## Format Standards

**Cursor rule format (MUST follow this structure):**

```markdown
# Rule Title

## Purpose

Clear statement of what this rule ensures.

## Trigger Patterns

When [conditions], agents MUST [action].

## Agent Actions

### Step 1: [Action]

1. [Specific action]
2. [Specific action]

## Constraints

- MUST / MUST NOT statements (per RFC 2119)
- ALWAYS / NEVER statements
```

**Language requirements:**
- Use RFC 2119 terminology: MUST, MUST NOT, SHOULD, SHOULD NOT, MAY
- Use directive tone: clear, unambiguous statements
- MUST NOT use vague qualifiers: "maybe", "perhaps", "possibly"
- MUST NOT use marketing language: "powerful", "seamless", "revolutionary"
- Use simple, declarative sentences with active voice

## Workflow

When user provides instructions (especially "always" or "never"), agents MUST:

1. Detect trigger pattern
2. Acknowledge: "Documenting instruction permanently in [location]"
3. Classify instruction type and determine rule scope (apply Meta-Rule above)
4. Document immediately (same conversation):
   - Read target documentation file if it exists
   - Add instruction using proper format
   - Create or update rule file if needed
   - Update references if new rule created
   - Use directive language per RFC 2119 (MUST/SHOULD/MUST NOT/ALWAYS/NEVER)
5. Update downstream documentation if applicable (see `downstream_doc_updates.md`)
6. Confirm completion with details

**MUST NOT:**
- Skip documentation and proceed with other work
- Promise to document "later" or in future conversation
- Document only in conversation memory
- Assume instruction is temporary

**Before starting work:**
1. Load required rules (rule files from symlinked locations)
2. Verify instructions are current

## Constraints

Agents MUST:
- Document "always" and "never" instructions immediately during same conversation
- Classify instruction type before documenting
- Use directive language per RFC 2119 (MUST/SHOULD/MUST NOT/ALWAYS/NEVER)
- Ensure instructions are discoverable via symlink structure (global: `foundation/agent_instructions/cursor_rules/`, repository: `docs/` subdirectories)
- Update downstream documentation when upstream docs change
- Store temporary assessment/analysis files in `tmp/` directory

Agents MUST NOT:
- Defer documentation to future conversation
- Document only in conversation memory
- Duplicate instructions across multiple files without cross-references
- Store documentation files in repo root
- Store temporary assessment/analysis files in `docs/`
- Use `.claude/rules/` directly (rules are symlinked automatically)

## Availability

Cursor agents automatically have access to all rules via symlink structure:

1. **Global rules**: `foundation/agent_instructions/cursor_rules/` files are symlinked to `.claude/rules/` with `foundation_` prefix
2. **Repository rules**: All `*_rules.md` files in `docs/` subdirectories are automatically symlinked to `.claude/rules/` via setup script
3. **No central reference file needed**: Rules are discoverable directly via symlink structure

---

## Agent Instructions

### When to Load This Document

Load this document when:
- User provides "always" or "never" instructions
- Creating or updating rule files
- Determining where to place new instructions
- Reviewing rule structure and organization

### Required Co-Loaded Documents

- `foundation/conventions/documentation_standards.md` (for format standards)

### Constraints Agents Must Enforce

1. All "always" and "never" instructions MUST be documented immediately in same conversation
2. Rules MUST use RFC 2119 terminology (MUST, MUST NOT, SHOULD, SHOULD NOT, MAY)
3. Rules MUST follow the format structure defined in Format Standards section
4. Repository rules MUST be placed in appropriate `docs/` subdirectory based on topic
5. Global rules MUST be placed in `foundation/agent_instructions/cursor_rules/`
6. Agents MUST NOT use `.claude/rules/` directly (rules are symlinked automatically)
7. Agents MUST NOT defer documentation to future conversations

### Forbidden Patterns

- Documenting instructions only in conversation memory
- Creating rules in `.claude/rules/` directly
- Using vague language instead of RFC 2119 terminology
- Deferring rule creation to later conversations
- Duplicating instructions across multiple files without cross-references

### Validation Checklist

- [ ] Rule file follows format structure (Purpose, Trigger Patterns, Agent Actions, Constraints)
- [ ] Rule uses RFC 2119 terminology correctly
- [ ] Rule is placed in correct location (global vs repository, appropriate subdirectory)
- [ ] Rule file uses `*_rules.md` naming convention
- [ ] No references to non-existent central reference files
- [ ] Instructions documented immediately during same conversation
