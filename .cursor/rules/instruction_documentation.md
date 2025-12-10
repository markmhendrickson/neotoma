# Instruction Documentation Rule

**Reference:** `docs/foundation/agent_instructions.md` — Repository-wide agent instructions

## Purpose

Ensures that important instructions, constraints, and guidelines are:

1. Documented in appropriate documentation files
2. Available to all Cursor agents automatically as repo rules
3. Maintained and kept up-to-date

---

## Trigger Patterns

When any of the following occur, agents MUST ensure instructions are documented:

- User provides explicit instructions about:

  - Code style, patterns, or conventions
  - Architectural constraints or boundaries
  - Workflow processes or procedures
  - Testing requirements or standards
  - Documentation standards
  - Security or privacy requirements
  - Error handling or validation rules
  - Repository-wide policies or rules

- User mentions:

  - "always do X" or "never do Y"
  - "follow this pattern" or "use this approach"
  - "remember to" or "make sure to"
  - "this is important" or "critical requirement"
  - "all agents should" or "everyone must"

- Instructions that affect:
  - Multiple files or subsystems
  - Future development work
  - Agent behavior or decision-making
  - Code generation patterns

---

## Agent Actions

### Step 1: Detect Instruction Type

**Classify the instruction:**

1. **Repository-wide agent instructions:**

   - Affects all agents working on the repo
   - General constraints, patterns, or policies
   - **Location:** `docs/foundation/agent_instructions.md`

2. **Workflow or process instructions:**

   - Affects how work is organized or executed
   - Feature unit, release, or development workflows
   - **Location:** `docs/feature_units/standards/` or `.cursor/rules/`

3. **Architectural constraints:**

   - System boundaries, layer rules, invariants
   - **Location:** `docs/foundation/` or `docs/architecture/`

4. **Code conventions:**

   - Style, patterns, naming conventions
   - **Location:** `docs/conventions/` or `.cursor/rules/`

5. **Cursor-specific repo rules:**
   - Rules that should be automatically applied by Cursor agents
   - Detection patterns, automatic behaviors
   - **Location:** `.cursor/rules/`

### Step 2: Document Instruction

**For repository-wide agent instructions:**

1. **Check if instruction exists:**

   - Read `docs/foundation/agent_instructions.md`
   - Search for similar or related instructions
   - Check if it's already documented

2. **If instruction is new or needs updating:**

   - Add to appropriate section in `docs/foundation/agent_instructions.md`
   - Use clear, directive language (MUST/SHOULD/MUST NOT)
   - Include examples if helpful
   - Reference related documents

3. **If instruction is Cursor-specific:**
   - Create or update rule file in `.cursor/rules/`
   - Follow existing rule file format (see other `.cursor/rules/*.md` files)
   - Add reference to `repo_doctrine.md` if needed

### Step 3: Make Available as Repo Rule

**For Cursor repo rules:**

1. **Create rule file** in `.cursor/rules/`:

   - Use descriptive filename: `{topic}_rule.md` or `{topic}_management.md`
   - Follow format of existing rules (Purpose, Trigger Patterns, Agent Actions, Constraints)

2. **Update `repo_doctrine.md`:**

   - Add reference to new rule in appropriate section
   - Include brief description of when rule applies
   - Link to rule file

3. **Ensure rule is discoverable:**
   - Rule files in `.cursor/rules/` are automatically available to Cursor agents
   - Reference in `repo_doctrine.md` ensures visibility

**For documentation-only instructions:**

1. **Document in appropriate location:**

   - `docs/foundation/agent_instructions.md` for agent instructions
   - `docs/conventions/` for conventions
   - `docs/architecture/` for architectural rules
   - `docs/feature_units/standards/` for workflow standards

2. **Reference in `repo_doctrine.md`:**
   - Add to "Required Reading" section if critical
   - Add to relevant workflow section if process-related

---

## Documentation Standards

### Format for Agent Instructions

When adding to `docs/foundation/agent_instructions.md`:

```markdown
## Section Number. Clear Title

Brief description of what this instruction covers.

### Subsection. Specific Rule

1. **Rule statement** (use MUST/SHOULD/MUST NOT)
2. **Rationale or context** (why this matters)
3. **Examples** (if helpful)
4. **Related documents** (links to relevant docs)
```

### Format for Cursor Repo Rules

When creating `.cursor/rules/{topic}.md`:

```markdown
# Rule Title

**Reference:** `docs/path/to/related/doc.md` — Related documentation

## Purpose

Clear statement of what this rule ensures.

---

## Trigger Patterns

When [conditions], agents MUST [action].

---

## Agent Actions

### Step 1: [Action]

**Agent MUST:**

1. [Specific action]
2. [Specific action]

### Step 2: [Action]

[Detailed steps]

---

## Constraints

- **MUST** / **MUST NOT** statements
- **ALWAYS** / **NEVER** statements

---

## Related Documents

- `docs/path/to/doc.md` — Related documentation
```

---

## Automatic Availability

**Cursor agents automatically have access to:**

1. **All files in `.cursor/rules/`** — Automatically loaded as repo rules
2. **`repo_doctrine.md`** — Central reference that links to all rules
3. **Files referenced in `repo_doctrine.md`** — Should be loaded when relevant

**To ensure instructions are available:**

1. **For automatic agent behavior:**

   - Create rule file in `.cursor/rules/`
   - Add reference to `repo_doctrine.md`

2. **For documentation context:**

   - Add to `docs/foundation/agent_instructions.md`
   - Reference in `repo_doctrine.md` "Required Reading" if critical

3. **For workflow processes:**
   - Document in `docs/feature_units/standards/`
   - Create detection rule in `.cursor/rules/` if automatic detection needed

---

## Agent Actions When Instructions Are Given

### During Conversation

**When user provides instructions:**

1. **Acknowledge instruction:**

   - "I'll document this instruction in [location]"

2. **Classify instruction:**

   - Determine appropriate documentation location
   - Determine if Cursor repo rule is needed

3. **Document immediately:**

   - Add to appropriate file
   - Create rule file if needed
   - Update `repo_doctrine.md` if needed

4. **Update downstream documentation:**

   - Identify downstream docs that depend on the new instruction
   - Update downstream docs to maintain consistency
   - See `.cursor/rules/downstream_doc_updates.md` for requirements

5. **Confirm completion:**
   - "Instruction documented in [location]"
   - "Rule created at `.cursor/rules/[name].md`"
   - "Downstream docs updated: [list]"
   - "Available to all agents via [reference]"

### When Reviewing Existing Instructions

**Before starting work:**

1. **Load required rules:**

   - Read `repo_doctrine.md`
   - Load referenced rule files
   - Load `docs/foundation/agent_instructions.md`

2. **Check for updates:**
   - Verify instructions are current
   - Check if new instructions need to be added

---

## Constraints

- **NEVER** skip documenting important instructions
- **ALWAYS** classify instruction type before documenting
- **ALWAYS** update `repo_doctrine.md` when adding new rules
- **ALWAYS** update downstream documentation when upstream docs change
- **ALWAYS** use clear, directive language (MUST/SHOULD/MUST NOT)
- **NEVER** duplicate instructions across multiple files without cross-references
- **ALWAYS** ensure instructions are discoverable via `repo_doctrine.md` or `.cursor/rules/`

---

## Related Documents

- `docs/foundation/agent_instructions.md` — Repository-wide agent instructions
- `.cursor/rules/repo_doctrine.md` — Central reference for all repo rules
- `.cursor/rules/downstream_doc_updates.md` — Downstream documentation update rules
- `.cursor/rules/readme_maintenance.md` — README synchronization rules
- `docs/conventions/documentation_standards.md` — Documentation standards
- `docs/feature_units/standards/` — Workflow and process standards
