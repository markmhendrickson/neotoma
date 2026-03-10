---
name: create-rule
description: Create Cursor rule for persistent AI guidance.
triggers:
  - create rule
  - /create_rule
  - create-rule
---

# Create Rule

Create a new rule file with `_rules` suffix and automatically create symlink in `.cursor/rules/`.

**SUBMODULE MODE**: If a submodule name is provided (e.g., `/create-rule foundation`), create the rule in that submodule. If no submodule name is provided, create in the main repository's `docs/` directory.

## Command

```
create-rule [submodule_name]
```

## Inputs

- `submodule_name` (optional string): Submodule name to create rule in (e.g., "foundation"). If omitted, creates rule in main repository's `docs/` directory.

## Workflow Overview

**If submodule name provided:**
1. Verify submodule exists
2. Determine submodule rule location
3. Prompt user for rule details
4. Create rule file in submodule
5. Run setup script to create symlink (if applicable)
6. Exit after submodule rule creation

**If no submodule name provided (default - repo mode):**
1. Prompt user for rule details
2. Create rule file in `docs/{location}/{name}_rules.md`
3. Include standard Agent Instructions template
4. Run setup script to create symlink
5. Verify symlink created

## Tasks

### Step 1: Determine Scope

**If submodule name provided:**

1. Verify submodule exists:
   ```bash
   if ! git submodule status <submodule_name> >/dev/null 2>&1; then
     echo "❌ Submodule not found: <submodule_name>"
     exit 1
   fi
   ```

2. Determine submodule rule location:
   - For `foundation` submodule: `foundation/agent_instructions/cursor_rules/`
   - For other submodules: Check for standard rule directories or prompt user

3. Set context for submodule rule creation

**If no submodule name provided:**
- Set context for main repository rule creation in `docs/` directory

### Step 2: Prompt User for Rule Details

**Repository mode prompts:**
1. **Rule file name** (without `_rules.md` suffix)
   - Example: "entity_resolution" will become "entity_resolution_rules.md"
   - Validate: alphanumeric with underscores only

2. **Location in `docs/` directory**
   - Options: `conventions`, `foundation`, `subsystems`, `architecture`, `developer`, etc.
   - Validate: directory must exist or ask to create

3. **Rule purpose and scope**
   - Brief description of what this rule ensures
   - What triggers loading this rule

4. **Key constraints/MUST/SHOULD rules**
   - List of main rules this document will enforce
   - Use RFC 2119 language (MUST, SHOULD, MUST NOT)

**Submodule mode prompts:**
1. **Rule file name** (without `_rules.mdc` suffix for foundation submodule, or without `.mdc` for foundation submodule - MUST use `.mdc` extension for foundation rules)

2. **Rule purpose and scope**

3. **Key constraints/MUST/SHOULD rules**

### Step 3: Create Rule File

**Repository mode:**

Create file at `docs/{location}/{name}_rules.md` with content:

```markdown
# {Rule Title}

**Reference:** `docs/{reference_doc}.md` — Related documentation (if applicable)

{Brief description of what this rule ensures}

## Purpose

{Expanded purpose from user input}

## Trigger Patterns

When any of the following occur:

- {Trigger pattern 1}
- {Trigger pattern 2}
- {Trigger pattern 3}

## Agent Actions

### Step 1: {Action Title}

{Description of what agent should do}

### Step 2: {Action Title}

{Description of what agent should do}

## Constraints

### MUST

1. {MUST constraint 1}
2. {MUST constraint 2}

### SHOULD

1. {SHOULD constraint 1}
2. {SHOULD constraint 2}

### MUST NOT

1. {MUST NOT constraint 1}
2. {MUST NOT constraint 2}

## Examples

### Example 1: {Example Title}

{Example description and code/steps}

---

## Agent Instructions

### When to Load This Document

Load this document when:

- {Trigger condition 1}
- {Trigger condition 2}

### Required Co-Loaded Documents

- {Required document 1}
- {Required document 2}

### Constraints Agents Must Enforce

1. {Constraint to enforce 1}
2. {Constraint to enforce 2}

### Forbidden Patterns

- {Anti-pattern 1}
- {Anti-pattern 2}

### Validation Checklist

- [ ] {Validation item 1}
- [ ] {Validation item 2}
```

**Submodule mode:**

For foundation submodule, create file following foundation cursor-rules pattern (simpler structure without Agent Instructions section since these are loaded automatically).

### Step 4: Run Setup Script

**Repository mode:**

1. Run foundation setup script:
   ```bash
   ./foundation/scripts/setup-cursor-rules.sh
   ```

2. Verify symlink created in `.cursor/rules/`:
   - Expected symlink name: `{location}_{name}_rules.md`
   - Example: `docs/conventions/entity_resolution_rules.md` → `.cursor/rules/conventions_entity_resolution_rules.md`

3. Output success message:
   ```
   ✅ Rule created successfully!
   
   File: docs/{location}/{name}_rules.md
   Symlink: .cursor/rules/{location}_{name}_rules.md
   
   The rule is now available to all Cursor agents in this repository.
   
   Next steps:
   1. Review the generated rule file and fill in any remaining details
   2. Test the rule by triggering its conditions
   3. Update related documentation to reference this rule if needed
   ```

**Submodule mode:**

1. If submodule is `foundation`, run setup script from main repository:
   ```bash
   ./foundation/scripts/setup-cursor-rules.sh
   ```

2. Verify symlink created (for foundation rules, they're prefixed with `foundation-`)

3. Output success message:
   ```
   ✅ Rule created in submodule successfully!
   
   File: {submodule}/{rule_path}/{name}{suffix}.mdc (for foundation submodule, use .mdc extension)
   Symlink: .cursor/rules/{prefix}{name}.mdc (if applicable)
   
   The rule is now available to all repositories using this submodule.
   ```

## Error Handling

- If submodule not found: Exit with error message
- If location directory doesn't exist in repo mode: Offer to create it or exit
- If file already exists: Warn and ask to overwrite or exit
- If setup script fails: Report error but keep the created file

## Configuration

Optional configuration in `foundation-config.yaml`:

```yaml
agent_instructions:
  rules:
    default_location: "docs/conventions"  # Default location for new rules
    template_path: null  # Custom template path (optional)
    auto_run_setup: true  # Automatically run setup script after creation
```

## Examples

### Example 1: Create Repository Rule

```
/create-rule
```

Prompts:
- Rule file name: `entity_resolution`
- Location: `subsystems`
- Purpose: "Ensure consistent entity resolution patterns across codebase"
- Key constraints: "MUST use deterministic merging, MUST NOT introduce randomness"

Creates:
- `docs/subsystems/entity_resolution_rules.md`
- `.cursor/rules/subsystems_entity_resolution_rules.md` (symlink)

### Example 2: Create Foundation Submodule Rule

```
/create-rule foundation
```

Prompts:
- Rule file name: `testing_patterns`
- Purpose: "Enforce consistent testing patterns"
- Key constraints: "MUST include unit tests, SHOULD use fixtures"

Creates:
- `foundation/agent_instructions/cursor_rules/testing_patterns.mdc`
- `.cursor/rules/foundation_testing_patterns.mdc` (symlink)

## Required Documents

Load before starting:

- `foundation/scripts/setup-cursor-rules.sh` (setup script)
- `docs/conventions/documentation_standards_rules.md` (if creating repo rule)
- `foundation-config.yaml` (configuration)

