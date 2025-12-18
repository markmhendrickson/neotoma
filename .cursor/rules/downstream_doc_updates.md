# Downstream Documentation Update Rule

**Reference:** `docs/conventions/documentation_standards.md` — Documentation standards

## Purpose

Ensures that when upstream documentation is updated, all downstream documentation that depends on it is also updated to maintain consistency across the documentation tree.

**Automated Validation:** This rule is enforced via:

- Dependency mapping: `docs/doc_dependencies.yaml` — Explicit upstream→downstream relationships
- Validation script: `scripts/validate-doc-dependencies.js` — Checks downstream docs for outdated references
- Pre-commit hook: Automatically validates modified docs before commit

---

## Trigger Patterns

When any of the following occur, agents MUST identify and update downstream documentation:

- **Upstream documentation changes:**

  - Foundation documents modified (`docs/foundation/`)
  - Architecture documents updated (`docs/architecture/`)
  - Specification changes (`docs/specs/`)
  - Subsystem documentation modified (`docs/subsystems/`)
  - Standards or conventions updated (`docs/conventions/`, `docs/feature_units/standards/`)

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

---

## Documentation Dependency Hierarchy

### Upstream → Downstream Relationships

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

1. **Foundation docs** (`docs/foundation/`) → All other docs depend on these
2. **Architecture docs** (`docs/architecture/`) → Subsystems, feature units, releases
3. **Specs** (`docs/specs/`) → Feature units, releases, developer docs
4. **Standards** (`docs/feature_units/standards/`) → Completed feature units, releases
5. **Subsystems** (`docs/subsystems/`) → Feature units, developer docs, integrations
6. **All docs** → README.md (via readme_maintenance rule)

---

## Agent Actions

### Step 1: Identify Upstream Change

**When modifying documentation, agents MUST:**

1. **Classify the change:**

   - Foundation change (core identity, philosophy, principles)
   - Architecture change (system design, layer boundaries)
   - Specification change (requirements, MCP spec, feature units)
   - Subsystem change (ingestion, extraction, search, etc.)
   - Standard change (testing, documentation, workflow)

2. **Determine scope of impact:**
   - Which downstream docs reference this upstream doc?
   - Which docs restate or depend on this information?
   - Which docs might contradict if not updated?

### Step 2: Identify Downstream Dependencies

**Agents MUST:**

1. **Use dependency map first:**

   - Check `docs/doc_dependencies.yaml` for explicit downstream dependencies
   - Run validation script: `node scripts/validate-doc-dependencies.js [upstream-doc-path]`
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
   - Feature unit specs (reference architecture, specs, standards)
   - Release plans (reference specs, feature units, architecture)
   - Developer docs (reference architecture, subsystems, standards)
   - Integration guides (reference subsystems, specs)
   - README.md (references all major doc categories)

### Step 3: Update Downstream Documentation

**For each downstream document, agents MUST:**

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

**Before completing, agents MUST:**

1. **Run validation script:**

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

---

## Common Downstream Update Scenarios

### Scenario 1: Foundation Document Change

**Upstream:** `docs/foundation/core_identity.md` modified

**Downstream to check:**

- `docs/architecture/architecture.md` (references core identity)
- `docs/specs/MVP_OVERVIEW.md` (restates core identity)
- `docs/feature_units/standards/feature_unit_spec.md` (references core identity)
- All subsystem docs (must align with core identity)
- `README.md` (references core identity)

### Scenario 2: Architecture Change

**Upstream:** `docs/architecture/architecture.md` modified

**Downstream to check:**

- `docs/subsystems/*` (must align with architecture)
- `docs/feature_units/completed/*` (reference architecture)
- `docs/releases/*` (reference architecture)
- `docs/developer/getting_started.md` (references architecture)
- `README.md` (references architecture)

### Scenario 3: Specification Change

**Upstream:** `docs/specs/MCP_SPEC.md` modified

**Downstream to check:**

- `docs/architecture/architecture.md` (references MCP)
- `docs/feature_units/completed/*` (implement MCP actions)
- `docs/releases/*` (reference MCP spec)
- `docs/developer/*` (reference MCP)
- `README.md` (references MCP)

### Scenario 4: Standard Change

**Upstream:** `docs/testing/testing_standard.md` modified

**Downstream to check:**

- `docs/feature_units/standards/feature_unit_spec.md` (references testing)
- `docs/feature_units/completed/*` (must follow testing standard)
- `docs/releases/*` (reference testing standard)
- `README.md` (references testing)

### Scenario 5: Subsystem Change

**Upstream:** `docs/subsystems/ingestion/ingestion.md` modified

**Downstream to check:**

- `docs/architecture/architecture.md` (references ingestion)
- `docs/feature_units/completed/*` (implement ingestion features)
- `docs/releases/*` (reference ingestion)
- `docs/developer/*` (reference ingestion)
- `docs/integrations/*` (may reference ingestion)
- `README.md` (references ingestion)

---

## Constraints

- **MUST** identify downstream dependencies when updating upstream docs
- **MUST** update all downstream docs that restate or depend on upstream changes
- **MUST** verify consistency across documentation tree
- **MUST NOT** leave contradictions between upstream and downstream docs
- **MUST NOT** skip downstream updates due to scope
- **MUST** maintain document integrity while updating

---

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

**Example:**

```markdown
## Related Documents

- [`docs/architecture/architecture.md`](../architecture/architecture.md) — System architecture
- [`docs/subsystems/schema_registry.md`](./schema_registry.md) — Schema registry patterns
- [`docs/foundation/core_identity.md`](../foundation/core_identity.md) — Core identity
```

---

## Automated Validation

### Dependency Map

The dependency map (`docs/doc_dependencies.yaml`) explicitly defines upstream→downstream relationships:

```yaml
docs/foundation/core_identity.md:
  downstream:
    - path: docs/architecture/architecture.md
      type: explicit
      reason: References core identity in Purpose section
```

**Types:**

- `explicit`: Document has direct link/reference to upstream (MUST have reference)
- `implicit`: Document depends on concepts from upstream
- `restates`: Document restates information from upstream (MUST stay in sync)

### Validation Script

Run validation manually:

```bash
# Check specific upstream doc
node scripts/validate-doc-dependencies.js docs/foundation/core_identity.md

# Check all upstream docs
node scripts/validate-doc-dependencies.js --all

# Check modified docs (git diff)
node scripts/validate-doc-dependencies.js --check-modified
```

**Script checks:**

- ✅ Downstream docs exist
- ✅ Explicit dependencies have references
- ✅ Links resolve correctly
- ⚠️ Warns on missing explicit references
- ❌ Errors on broken links or missing files

### Pre-commit Hook

The pre-commit hook automatically validates modified documentation files before commit. Agents MUST:

- Fix validation errors before committing
- Review warnings and update downstream docs if needed
- Update dependency map if new relationships are discovered

---

## Related Documents

- `docs/doc_dependencies.yaml` — Explicit dependency mapping
- `scripts/validate-doc-dependencies.js` — Validation script
- `.cursor/rules/readme_maintenance.md` — README synchronization rules
- `.cursor/rules/instruction_documentation.md` — Instruction documentation rule
- `docs/conventions/documentation_standards.md` — Documentation standards
- `docs/context/index.md` — Documentation navigation guide



