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

### Step 1: Detect Documentation Changes

**When modifying documentation, agents MUST:**

1. **Identify affected README sections:**

   - Architecture changes → Update "Architecture" section
   - New features → Update "Key Features" section
   - New docs → Update "Documentation Structure" section
   - Integration changes → Update "Integrations" section
   - Testing changes → Update "Testing" section
   - Release status → Update "Current Status" section

2. **Check README for outdated information:**
   - Read current `README.md`
   - Compare with modified documentation
   - Identify discrepancies or missing information

### Step 2: Update README

**Agents MUST:**

1. **Update relevant sections:**

   - Add new information where appropriate
   - Remove outdated information
   - Update links and references
   - Ensure consistency with documentation

2. **Maintain README structure:**

   - Preserve existing organization
   - Follow established formatting patterns
   - Keep sections logically ordered

3. **Verify completeness:**
   - All major documentation areas represented
   - All quick links functional
   - Current status accurate
   - Development instructions current

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

| README Section              | Update Trigger                                   |
| --------------------------- | ------------------------------------------------ |
| **What It Does**            | Core workflow changes, new capabilities          |
| **Architecture**            | Architecture docs modified, layer changes        |
| **Key Features**            | Feature specs updated, MVP scope changes         |
| **Quick Links**             | New documentation added, structure changes       |
| **Development**             | Setup instructions changed, new scripts added    |
| **Documentation Structure** | New doc categories, reorganization               |
| **Core Principles**         | Philosophy or principles updated                 |
| **Integrations**            | Provider docs added/removed, integration changes |
| **Testing**                 | Testing standards updated, coverage changes      |
| **Current Status**          | Release status changes, version updates          |

---

## Constraints

- **MUST** update README when documentation changes affect user-facing information
- **MUST** maintain README accuracy and completeness
- **MUST** verify all links before completing updates
- **MUST NOT** remove sections without ensuring information is obsolete
- **MUST NOT** add information to README that contradicts documentation
- **MUST** preserve README's role as entry point and overview document

---

## Related Documents

- `README.md` — Project README file
- `docs/conventions/documentation_standards.md` — Documentation standards
- `docs/context/index.md` — Documentation navigation guide
- `.cursor/rules/instruction_documentation.md` — Instruction documentation rule

