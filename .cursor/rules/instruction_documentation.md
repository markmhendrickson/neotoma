# Instruction Documentation Rule

**Reference:** `docs/foundation/agent_instructions.md` — Repository-wide agent instructions

## Purpose

Ensures that important instructions, constraints, and guidelines are:

1. Documented in appropriate documentation files
2. Available to all Cursor agents automatically as repo rules
3. Maintained and kept up-to-date

---

## Trigger Patterns

**CRITICAL:** When any of the following occur, agents MUST **IMMEDIATELY** document the instruction in the appropriate repository documentation file. Documentation MUST happen during the same conversation, before proceeding with other work.

### High-Priority Triggers (Immediate Documentation Required)

- User says **"always do X"** or **"never do Y"** — These are permanent instructions that MUST be documented immediately
- User says **"remember to"** or **"make sure to"** — Persistent behavioral instructions
- User says **"all agents should"** or **"everyone must"** — Repository-wide requirements

### Standard Triggers

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

  - "follow this pattern" or "use this approach"
  - "this is important" or "critical requirement"
  - "never store docs in repo root" or similar documentation location constraints

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

2. **MUST NOT store documentation in repo root:**
   - All documentation files MUST be placed in appropriate subdirectories under `docs/`
   - Summary files, review files, implementation notes, and similar documentation MUST be placed in relevant `docs/` subdirectories (e.g., `docs/conventions/`, `docs/developer/`)
   - Only configuration files (e.g., `package.json`, `tsconfig.json`) and essential project files (e.g., `README.md`, `LICENSE`) belong in repo root

3. **Reference in `repo_doctrine.md`:**
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

### During Conversation (MANDATORY Workflow)

**When user provides instructions (especially "always" or "never" statements):**

**CRITICAL:** Agents MUST follow this workflow IMMEDIATELY, before proceeding with any other work.

1. **Detect instruction trigger:**

   - Identify if instruction matches trigger patterns (especially "always"/"never")
   - Recognize this as a permanent instruction requiring documentation

2. **Acknowledge and commit to documentation:**

   - "I'll document this instruction permanently in [location]"
   - Do NOT proceed with other work until documentation is complete

3. **Classify instruction type:**

   - Determine appropriate documentation location (see Step 1: Detect Instruction Type)
   - Determine if Cursor repo rule is needed
   - Determine if both documentation and rule file are needed

4. **Document IMMEDIATELY (same conversation):**

   - Read the target documentation file
   - Add instruction to appropriate section using proper format
   - Create or update rule file in `.cursor/rules/` if needed
   - Update `repo_doctrine.md` if new rule file created
   - Use clear, directive language (MUST/SHOULD/MUST NOT/ALWAYS/NEVER)

5. **Update downstream documentation (if applicable):**

   - Identify downstream docs that reference or depend on this instruction
   - Update downstream docs to maintain consistency
   - See `.cursor/rules/downstream_doc_updates.md` for requirements

6. **Confirm completion with details:**
   - "Instruction documented permanently in [location]"
   - "Rule created at `.cursor/rules/[name].md`" (if applicable)
   - "Downstream docs updated: [list]" (if applicable)
   - "Available to all agents via [reference]"

**MUST NOT:**
- Skip documentation and proceed with other work
- Promise to document "later" or in a future conversation
- Document only in conversation memory without updating repo files
- Assume the instruction is temporary or context-specific

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
- **MUST document "always" and "never" instructions IMMEDIATELY** during the same conversation
- **MUST NOT** defer documentation to a future conversation or session
- **MUST NOT** document only in conversation memory — all permanent instructions MUST be in repo files
- **ALWAYS** classify instruction type before documenting
- **ALWAYS** update `repo_doctrine.md` when adding new rules
- **ALWAYS** update downstream documentation when upstream docs change
- **ALWAYS** use clear, directive language (MUST/SHOULD/MUST NOT/ALWAYS/NEVER)
- **NEVER** duplicate instructions across multiple files without cross-references
- **ALWAYS** ensure instructions are discoverable via `repo_doctrine.md` or `.cursor/rules/`
- **MUST NOT** store documentation files in repo root — all documentation MUST be placed in appropriate `docs/` subdirectories

---

## Related Documents

- `docs/foundation/agent_instructions.md` — Repository-wide agent instructions
- `.cursor/rules/repo_doctrine.md` — Central reference for all repo rules
- `.cursor/rules/downstream_doc_updates.md` — Downstream documentation update rules
- `.cursor/rules/readme_maintenance.md` — README synchronization rules
- `docs/conventions/documentation_standards.md` — Documentation standards
- `docs/feature_units/standards/` — Workflow and process standards
