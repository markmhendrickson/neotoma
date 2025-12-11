# README Maintenance Rule

**Reference:** `README.md` — Project overview and entry point

## Purpose

Ensures that `README.md` remains synchronized with documentation changes, providing accurate and comprehensive representation of the repository at all times.

---

## Trigger Patterns

When any of the following occur, agents MUST update `README.md`:

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

---

## Agent Actions

**CRITICAL:** README updates are **mandatory** and **automatic** — whenever documentation is updated in materially affecting ways, README MUST be **regenerated** (not patched) in the same workflow, not as a separate step.

### Step 1: Detect Material Documentation Changes

**When modifying ANY documentation, agents MUST:**

1. **Determine if change is material:**

   A change is material if it affects:

   - Core identity (`docs/foundation/core_identity.md`)
   - Product positioning (`docs/foundation/product_positioning.md`)
   - MVP scope (`docs/specs/MVP_OVERVIEW.md`)
   - Architecture (`docs/architecture/architecture.md`)
   - Features or capabilities (feature specs)
   - Release status (`docs/releases/in_progress/`)
   - Documentation structure (new categories, reorganization)
   - Development workflow (setup, scripts)
   - Integrations (providers added/removed)
   - Philosophy/principles (`docs/foundation/philosophy.md`)
   - Problem statement (`docs/foundation/problem_statement.md`)
   - Target users (`docs/specs/ICP_PROFILES.md`)

2. **If material change detected:**

   - **Regenerate entire README** using `docs/conventions/readme_generation_framework.md`
   - Do NOT patch individual sections
   - Use primary sources to regenerate from scratch
   - **Regenerate in same tool call batch as documentation changes**

3. **If non-material change (typos, formatting, minor clarifications):**
   - May patch specific sections if needed
   - Still verify consistency with docs

### Step 2: Regenerate README

**For material changes, agents MUST:**

1. **Follow regeneration process:**

   - Read primary source documents (per framework)
   - Extract key information (value prop, features, architecture, etc.)
   - Generate README following required section structure
   - Apply content guidelines (tone, style, confident positioning)
   - Verify all sections against source docs

2. **Maintain README structure:**

   - Follow exact section order from framework
   - Preserve formatting patterns
   - Keep all 18 required sections

3. **Verify completeness:**
   - All major documentation areas represented
   - All quick links functional
   - Current status accurate
   - Development instructions current
   - All information matches source docs exactly

### Step 3: Validate Changes

**Before completing, agents MUST:**

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

---

## README Sections and Update Triggers

| README Section              | Update Trigger                                |
| --------------------------- | --------------------------------------------- |
| **What It Does**            | Core workflow changes, new capabilities       |
| **Architecture**            | Architecture docs modified, layer changes     |
| **Releases**                | Release status changes, new releases added    |
| **Quick Links**             | New documentation added, structure changes    |
| **Development**             | Setup instructions changed, new scripts added |
| **Documentation Structure** | New doc categories, reorganization            |
| **Core Principles**         | Philosophy or principles updated              |
| **Testing**                 | Testing standards updated, coverage changes   |

---

## Constraints

- **MUST** regenerate README (not patch) whenever documentation changes in materially affecting ways
- **MUST** regenerate README automatically in same tool call batch as material documentation changes
- **MUST** use `docs/conventions/readme_generation_framework.md` for regeneration process
- **MUST** regenerate from primary sources, not from existing README
- **MUST** maintain README accuracy and completeness against source docs
- **MUST** verify all links before completing regeneration
- **MUST NOT** patch individual sections for material changes (always regenerate)
- **MUST NOT** add information to README that contradicts documentation
- **MUST** preserve README's role as entry point and overview document
- **MUST** follow required section structure exactly as defined in framework
- **MUST** ensure confident, positive tone throughout (not defensive)

---

## Related Documents

- `README.md` — Project README file
- `docs/conventions/readme_generation_framework.md` — **REQUIRED:** Framework for regenerating README
- `docs/conventions/documentation_standards.md` — Documentation standards
- `docs/context/index.md` — Documentation navigation guide
- `.cursor/rules/instruction_documentation.md` — Instruction documentation rule
