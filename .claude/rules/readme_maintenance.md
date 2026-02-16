---
description: "Ensures that README.md remains synchronized with documentation changes, providing accurate and comprehensive representation of the repository"
globs: ["**/*"]
alwaysApply: true
---

<!-- Source: foundation/agent_instructions/cursor_rules/readme_maintenance.mdc -->

# README Maintenance Rule

**Reference:** `README.md` — Project overview and entry point

Ensures that `README.md` remains synchronized with documentation changes, providing accurate and comprehensive representation of the repository at all times.

## Configuration

This rule can be configured in `foundation-config.yaml`:

```yaml
tooling:
  readme_generation:
    enabled: true
    source_documents: []  # List of source documents for regeneration
    structure_template: null  # Path to README structure template
    regenerate_triggers: []  # File patterns that trigger regeneration
```

## Trigger Patterns

When any of the following occur, update `README.md`:

- Documentation files are created, modified, or deleted:
  - New documentation sections added (e.g., new subsystem docs, new integration guides)
  - Architecture changes documented
  - New features or capabilities added to specs
  - Release status changes
  - Testing standards updated
  - Integration providers added or removed

- User explicitly requests README update:
  - "update README"
  - "sync README with docs"
  - "ensure README reflects [change]"

- Significant changes to:
  - Core features or capabilities
  - Architecture or system design
  - Development workflow or setup
  - Documentation structure
  - Current project status

## Agent Actions

README updates are mandatory and automatic - whenever documentation is updated in materially affecting ways, README must be regenerated (not patched) in the same workflow, not as a separate step.

### Step 1: Detect Material Documentation Changes

When modifying ANY documentation:

1. **Determine if change is material:**

   A change is material if it affects:
   - Core identity or philosophy documents
   - Product positioning or problem statement
   - MVP scope or specifications
   - Architecture or system design
   - Features or capabilities
   - Release status
   - Documentation structure (new categories, reorganization)
   - Development workflow (setup, scripts)
   - Integrations (providers added/removed)
   - Target users or personas

2. **If material change detected:** Regenerate entire README using configured regeneration framework or template. Do NOT patch individual sections. Use primary sources to regenerate from scratch. Regenerate in same tool call batch as documentation changes.

3. **If non-material change (typos, formatting, minor clarifications):**
   - May patch specific sections if needed
   - Still verify consistency with docs

### Step 2: Regenerate README

For material changes:

1. **Follow regeneration process:**
   - Read primary source documents (per configuration)
   - Extract key information (value prop, features, architecture, etc.)
   - Generate README following required section structure
   - Apply content guidelines (tone, style, confident positioning)
   - Verify all sections against source docs

2. **Maintain README structure:**
   - Follow exact section order from template or framework
   - Preserve formatting patterns
   - Keep all required sections

3. **Verify completeness:**
   - All major documentation areas represented
   - All quick links functional
   - Current status accurate
   - Development instructions current
   - All information matches source docs exactly

### Step 3: Validate Changes

Before completing:

1. **Check for broken links:**
   - Verify all documentation links resolve correctly
   - Ensure relative paths are correct

2. **Verify consistency:**
   - README matches documentation content
   - No contradictions between README and docs
   - Terminology consistent across README and docs

3. **Ensure accuracy:**
   - Feature lists match current capabilities
   - Architecture description matches architecture docs
   - Status information is current

## README Sections and Update Triggers

Common README sections and their update triggers (customize per repository):

| README Section              | Update Trigger                                |
| --------------------------- | --------------------------------------------- |
| **What It Does**            | Core workflow changes, new capabilities       |
| **Architecture**            | Architecture docs modified, layer changes     |
| **Releases**                | Release status changes, new releases added    |
| **Quick Links**             | New documentation added, structure changes    |
| **Development**            | Setup instructions changed, new scripts added |
| **Documentation Structure** | New doc categories, reorganization            |
| **Core Principles**         | Philosophy or principles updated              |
| **Testing**                 | Testing standards updated, coverage changes   |

## Constraints

- Regenerate README (not patch) whenever documentation changes in materially affecting ways
- Regenerate README automatically in same tool call batch as material documentation changes
- Use configured regeneration framework or template for regeneration process
- Regenerate from primary sources, not from existing README
- Maintain README accuracy and completeness against source docs
- Verify all links before completing regeneration
- Do NOT patch individual sections for material changes (always regenerate)
- Do NOT add information to README that contradicts documentation
- Preserve README's role as entry point and overview document
- Follow required section structure exactly as defined in template or framework
- Ensure confident, positive tone throughout (not defensive)









