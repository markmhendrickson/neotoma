---
description: "Load when modifying foundation, architecture, specs, or subsystem docs: identify downstream dependencies via doc_dependencies.yaml, update all downstream docs that restate or depend on the change, run validation script."
alwaysApply: false
---

<!-- Source: foundation/agent_instructions/cursor_rules/downstream_doc_updates.mdc -->

# Downstream Documentation Update Rule

**Reference:** `foundation/conventions/documentation-standards.md` — Documentation standards

Ensures that when upstream documentation is updated, all downstream documentation that depends on it is also updated to maintain consistency across the documentation tree.

Automated validation via:

- Dependency mapping: `docs/doc_dependencies.yaml` (or configured path) — Explicit upstream→downstream relationships
- Validation script: `scripts/validate-doc-dependencies.js` (or configured path) — Checks downstream docs for outdated references
- Pre-commit hook: Automatically validates modified docs before commit

## Configuration

Configure dependency tracking in `foundation-config.yaml`:

```yaml
tooling:
  doc_dependencies:
    enabled: true
    dependency_map_path: "docs/doc_dependencies.yaml"  # Optional
    validation_script_path: "scripts/validate-doc-dependencies.js"  # Optional
```

## Trigger Patterns

When any of the following occur, agents MUST identify and update downstream documentation:

- **Upstream documentation changes:**
  - Foundation documents modified (`docs/foundation/` or configured path)
  - Architecture documents updated (`docs/architecture/` or configured path)
  - Specification changes (`docs/specs/` or configured path)
  - Subsystem documentation modified (`docs/subsystems/` or configured path)
  - Standards or conventions updated (`docs/conventions/`, `docs/feature_units/standards/` or configured paths)

- **User explicitly requests downstream updates:**
  - "update downstream docs"
  - "sync docs with [upstream change]"
  - "ensure all docs reflect [change]"

- **Significant changes to:**
  - Core principles or philosophy
  - Architectural decisions or patterns
  - API contracts or specifications
  - Data models or schemas
  - Workflow processes or standards

## Documentation Dependency Hierarchy

### Generic Upstream → Downstream Relationships

```
docs/foundation/ (root)
  ↓
docs/architecture/
docs/specs/
docs/conventions/
  ↓
docs/subsystems/
docs/feature_units/standards/
  ↓
docs/feature_units/completed/
docs/releases/
docs/developer/
docs/integrations/
  ↓
README.md
```

**Key Dependencies:**

1. **Foundation docs** (`docs/foundation/` or configured) → All other docs depend on these
2. **Architecture docs** (`docs/architecture/` or configured) → Subsystems, feature units, releases
3. **Specs** (`docs/specs/` or configured) → Feature units, releases, developer docs
4. **Standards** (`docs/feature_units/standards/` or configured) → Completed feature units, releases
5. **Subsystems** (`docs/subsystems/` or configured) → Feature units, developer docs, integrations
6. **All docs** → README.md (via readme_maintenance rule)

**Note:** Customize directory structure per repository. The hierarchy above is a common pattern but should be adapted to your project structure.

## Agent Actions

### Step 1: Identify Upstream Change

When modifying documentation:

1. **Classify the change:**
   - Foundation change (core identity, philosophy, principles)
   - Architecture change (system design, layer boundaries)
   - Specification change (requirements, API specs, feature units)
   - Subsystem change (components, modules, services)
   - Standard change (testing, documentation, workflow)

2. **Determine scope of impact:**
   - Which downstream docs reference this upstream doc?
   - Which docs restate or depend on this information?
   - Which docs might contradict if not updated?

### Step 2: Identify Downstream Dependencies

1. **Use dependency map first (if configured):**
   - Check dependency map file for explicit downstream dependencies
   - Run validation script if available: `node scripts/validate-doc-dependencies.js [upstream-doc-path]`
   - Review script output for missing references or broken links

2. **Search for explicit references:**
   - Links to the modified document
   - Cross-references in "Related Documents" sections (see format below)
   - Mentions of concepts from the upstream doc

3. **Identify implicit dependencies:**
   - Docs that restate information from upstream
   - Docs that depend on concepts defined upstream
   - Docs that must align with upstream changes

4. **Check common downstream locations:**
   - Feature specs (reference architecture, specs, standards)
   - Release plans (reference specs, features, architecture)
   - Developer docs (reference architecture, subsystems, standards)
   - Integration guides (reference subsystems, specs)
   - README.md (references all major doc categories)

### Step 3: Update Downstream Documentation

For each downstream document:

1. **Review content for outdated information:**
   - Check if downstream doc restates upstream information
   - Verify consistency with upstream changes
   - Identify contradictions or outdated references

2. **Update as needed:**
   - Update restated information to match upstream
   - Update references and links
   - Remove contradictions
   - Add new information if relevant

3. **Maintain document integrity:**
   - Preserve document structure and purpose
   - Keep downstream-specific context intact
   - Ensure updates don't break document flow

### Step 4: Validate Consistency

Before completing:

1. **Run validation script (if configured):**
   ```bash
   node scripts/validate-doc-dependencies.js [modified-upstream-doc-path]
   ```
   - Fix any errors (broken links, missing files)
   - Review warnings (missing explicit references)
   - Ensure all downstream dependencies are validated

2. **Verify consistency:**
   - Downstream docs align with upstream changes
   - No contradictions between docs
   - Terminology consistent across docs

3. **Check references:**
   - All links resolve correctly
   - Cross-references are accurate
   - Related Documents sections are current (see format below)

4. **Ensure completeness:**
   - All affected downstream docs identified
   - All necessary updates made
   - No critical dependencies missed
   - Dependency map updated if new relationships discovered

## Common Downstream Update Scenarios

### Scenario 1: Foundation Document Change

**Upstream:** Foundation document modified

**Downstream to check:**
- Architecture docs (reference foundation)
- Specs (restate foundation concepts)
- Feature specs (reference foundation)
- All subsystem docs (must align with foundation)
- `README.md` (references foundation)

### Scenario 2: Architecture Change

**Upstream:** Architecture document modified

**Downstream to check:**
- Subsystem docs (must align with architecture)
- Feature specs (reference architecture)
- Release plans (reference architecture)
- Developer docs (reference architecture)
- `README.md` (references architecture)

### Scenario 3: Specification Change

**Upstream:** Specification document modified

**Downstream to check:**
- Architecture docs (reference specs)
- Feature implementations (implement specs)
- Release plans (reference specs)
- Developer docs (reference specs)
- `README.md` (references specs)

### Scenario 4: Standard Change

**Upstream:** Standard document modified

**Downstream to check:**
- Feature specs (reference standards)
- Completed features (must follow standards)
- Release plans (reference standards)
- `README.md` (references standards)

### Scenario 5: Subsystem Change

**Upstream:** Subsystem document modified

**Downstream to check:**
- Architecture docs (reference subsystems)
- Feature implementations (implement subsystem features)
- Release plans (reference subsystems)
- Developer docs (reference subsystems)
- Integration guides (may reference subsystems)
- `README.md` (references subsystems)

## Related Documents Format

**Standard format for "Related Documents" sections:**

```markdown
## Related Documents

- [`docs/path/to/doc.md`](../relative/path/to/doc.md) — Brief description
- [`docs/another/doc.md`](./relative/path.md) — Brief description
```

**Requirements:**
- Use `## Related Documents` heading (level 2)
- List items with markdown links using backticks
- Include relative paths (not absolute)
- Provide brief description after link
- List upstream dependencies first, then related docs

## Constraints

- Identify downstream dependencies when updating upstream docs
- Update all downstream docs that restate or depend on upstream changes
- Verify consistency across documentation tree
- Do NOT leave contradictions between upstream and downstream docs
- Do NOT skip downstream updates due to scope
- Maintain document integrity while updating









