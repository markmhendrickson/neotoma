---
description: "Self-adaptive behavior improvement through post-intervention analysis and proactive rule/skill/hook suggestions. Load when analyzing agent behavior or suggesting rule/skill updates."
alwaysApply: false
---

<!-- Source: foundation/.cursor/rules/behavioral_self_adaptation.mdc -->

# Behavioral Self-Adaptation Rule

**Reference:** `foundation/agent_instructions/cursor_rules/instruction_documentation.mdc` - Rule creation standards

## Purpose

Enables agents to learn from user interventions and proactively suggest behavioral improvements. When a user provides guidance that resolves an agent stopping point, the agent analyzes the intervention, identifies generalizable patterns, and suggests appropriate rules, skills, or hooks to prevent similar stops in the future.

## Scope

This document defines:
- When agents MUST analyze interventions for patterns
- How to classify intervention types
- How to suggest appropriate artifacts (rules/skills/hooks)
- Integration with existing meta-rules and decision frameworks

This document does NOT cover:
- Explicit instruction capture (see `prompt_integration_rules.mdc`)
- Risk management hold points (see `risk_management.mdc`)
- Rule creation standards (see `instruction_documentation.mdc`)

## Configuration

No additional configuration required. This rule integrates with existing systems:

```yaml
# Uses existing configuration from:
# - foundation-config.yaml (risk management, agent instructions)
# - docs/prompt_integration_rules.mdc (explicit instruction patterns)
# - foundation/agent_instructions/cursor_rules/instruction_documentation.mdc (rule standards)
```

## Trigger Patterns

Agents MUST analyze for self-adaptation opportunities when:

1. **After agent stops/pauses** and requests user input
2. **User provides guidance** that resolves the stopping point
3. **Guidance implies pattern** beyond one-time instruction
4. **Pattern is generalizable** to future similar circumstances

**Detection signals:**
- Agent asked a question, user answered with behavioral guidance
- Agent stopped at uncertainty, user clarified decision rule
- Agent completed partial work, user indicated to continue with related work
- Agent requested approval, user indicated future similar cases should proceed automatically

## Agent Actions

### Step 1: Post-Intervention Analysis

When user provides guidance after agent stopped/paused:

1. **Identify stopping point context:**
   - What task was being performed?
   - Why did the agent stop? (uncertainty, constraint, scope boundary, missing decision rule)
   - What question or approval was requested?

2. **Analyze user's intervention:**
   - What specific guidance did user provide?
   - Does it resolve just this instance or imply persistent behavior?
   - Is the guidance generalizable to future similar situations?

3. **Check for pattern indicators:**
   - Contains "always", "whenever", "going forward", "in the future"
   - Describes a decision rule or process pattern
   - Clarifies scope boundaries or workflow extensions
   - Indicates automation preferences or tool choices

### Step 2: Intervention Classification

Classify intervention into one or more categories:

**Scope Expansion:**
- User indicates agent should continue further without stopping
- Example: "Yes, also update related tasks" → Agent should update related tasks proactively
- Target artifact: Rule enhancement

**Decision Rule:**
- User provides choice logic for future similar decisions
- Example: "When processing financial data, use X tool" → Agent should use X tool for financial data
- Target artifact: Rule addition or skill step

**Workflow Extension:**
- User adds step(s) to existing workflow
- Example: "After sending email, archive thread" → Agent should archive after sending
- Target artifact: Skill enhancement or rule addition

**Constraint Clarification:**
- User clarifies that something is actually allowed/required
- Example: "You can modify config files without approval for dev settings" → Agent has broader permission
- Target artifact: Rule modification or constraint update

**Automation Preference:**
- User indicates preferred tool, approach, or method
- Example: "Always use API when available, not manual instructions" → Agent should prefer automation
- Target artifact: Rule addition

### Step 3: Check Decision Framework Alignment

Before suggesting artifact, verify alignment:

1. **Check strategy layer** (`/strategy/strategy/`):
   - Does suggestion align with strategic goals?
   - Would it conflict with established strategy?

2. **Review tactics layer** (`/strategy/tactics/`):
   - Is there existing tactical guidance that covers this?
   - Does suggestion complement or conflict with tactics?

3. **Consult operations layer** (`/strategy/operations/`):
   - Does operating manual allow this behavior?
   - Are there domain-specific constraints to respect?

4. **Respect risk management** (`risk_management.mdc`):
   - Would suggestion bypass legitimate security/safety hold points?
   - Does it respect high-risk change requirements?

5. **Validate constraints** (`agent_constraints.mdc`):
   - Does suggestion violate forbidden patterns?
   - Would it break architectural boundaries or data integrity?

### Step 4: Determine Appropriate Artifact

Based on intervention classification, suggest:

**Rule (New or Enhanced):**
- Persistent behavior that applies across multiple contexts
- Decision rules, constraints, or policies
- "Always do X" or "Never do Y" patterns
- Location: `docs/*_rules.mdc` (repository) or `foundation/agent_instructions/cursor_rules/*.mdc` (global)

**Skill (New or Enhanced):**
- Multi-step workflow or process pattern
- On-demand behavior triggered by context
- Complex procedures with multiple decision points
- Location: `.cursor/skills/[skill-name]/SKILL.md`

**Hook (New or Enhanced):**
- Automated enforcement of rules
- Pre-commit validation or checks
- Requires implementation script
- Location: `.pre-commit-config.yaml` + implementation script

**Rule Enhancement:**
- Addition to existing rule file
- Clarification of existing constraint
- Extension of existing workflow requirement
- Location: Existing rule file

### Step 5: Suggest Artifact to User

Present suggestion in clear format:

```
---
BEHAVIORAL IMPROVEMENT SUGGESTION
---

Stopping Point Context:
I stopped because: [reason for stopping]
You provided: [summary of user's intervention]

Pattern Analysis:
This suggests a persistent behavioral pattern: [pattern description]
Classification: [Scope expansion / Decision rule / Workflow extension / Constraint clarification / Automation preference]

Suggested Improvement:
Artifact type: [Rule / Skill / Hook / Rule enhancement]
Location: [specific file path]
Integration: [how it works with existing rules]

Proposed Content:
[Specific text to add/modify in appropriate format]

Alignment Check:
- Strategy: [aligned / conflict / N/A]
- Tactics: [aligned / conflict / N/A]
- Operations: [aligned / conflict / N/A]
- Risk management: [respects hold points / N/A]
- Constraints: [respects constraints / N/A]

Would you like me to implement this improvement?
If approved, I'll create/update the artifact and apply it to the current task immediately.
---
```

**Constraints on suggestion format:**
- MUST NOT include emojis (per communication constraints)
- MUST use clear, directive language
- MUST specify exact file path and content
- MUST show alignment checks
- MUST request explicit approval

### Step 6: Implementation (If Approved)

If user approves suggestion:

1. **Create or update artifact:**
   - Follow `instruction_documentation.mdc` standards for format
   - Use RFC 2119 terminology (MUST, MUST NOT, SHOULD, etc.)
   - Include proper frontmatter and structure
   - Add cross-references to related documents

2. **Apply to current task:**
   - Immediately use the new rule/skill/hook on current work
   - Continue task execution without stopping at same point again
   - Demonstrate the behavioral improvement in action

3. **Update related documentation:**
   - Update downstream docs if needed (per `downstream_doc_updates.mdc`)
   - Update README or foundation docs if global rule added
   - Add cross-references in related rules

4. **Confirm completion:**
   - Briefly state what was created/updated
   - Confirm application to current task
   - Continue work seamlessly

## Constraints

Agents MUST:
- Analyze interventions for generalizable patterns after stopping points
- Classify intervention type before suggesting artifact
- Check decision framework alignment (strategy/tactics/operations)
- Verify suggestion respects risk management and constraints
- Present clear suggestion with specific content and location
- Request explicit user approval before implementing
- Apply implemented improvement to current task immediately

Agents MUST NOT:
- Auto-implement suggestions without user approval
- Suggest bypassing legitimate risk management hold points
- Suggest violating security, safety, or architectural constraints
- Suggest changes that conflict with strategy/tactics/operations hierarchy
- Analyze explicit "always do X" instructions (handled by `prompt_integration_rules.mdc`)
- Create artifacts without following `instruction_documentation.mdc` standards
- Skip alignment checks with existing decision frameworks

## Integration with Existing Meta-Rules

**Division of responsibilities:**

- **`prompt_integration_rules.mdc`:** Handles explicit instructions ("always do X", "when Y happens, do Z")
  - Immediate integration without suggestion
  - User explicitly states persistent behavior
  - Auto-documented in appropriate location

- **`behavioral_self_adaptation.mdc` (this rule):** Handles implicit patterns from interventions
  - User resolves stopping point with guidance
  - Pattern implied but not explicitly stated as rule
  - Suggested for user approval before implementation

- **`instruction_documentation.mdc`:** Defines how to create/format rules
  - Standards for rule structure and format
  - Where to place rules (global vs repository)
  - File naming and organization conventions

**Workflow integration:**

```
User provides guidance
    ↓
Does it contain explicit "always/never/when" language?
    ↓ Yes → prompt_integration_rules.mdc (auto-integrate)
    ↓ No
    ↓
Did it resolve an agent stopping point?
    ↓ Yes → behavioral_self_adaptation.mdc (analyze & suggest)
    ↓ No → Continue work
```

## Example Scenarios

### Scenario 1: Scope Expansion

**Context:**
- Agent creates transaction record from payment data
- Agent stops: "Should I also update the related task record?"

**User intervention:**
- "Yes, always update related tasks when processing financial transactions"

**Analysis:**
- Stopping point: Uncertainty about workflow scope
- Intervention: Indicates scope should include related task updates
- Classification: Scope expansion + Decision rule
- Generalizable: Yes (applies to all financial transaction processing)

**Suggestion:**
```
---
BEHAVIORAL IMPROVEMENT SUGGESTION
---

Stopping Point Context:
I stopped because: I was uncertain whether to update related task records after creating a transaction
You provided: "Yes, always update related tasks when processing financial transactions"

Pattern Analysis:
This suggests a persistent behavioral pattern: Financial transaction processing should automatically include related task updates
Classification: Scope expansion, Decision rule

Suggested Improvement:
Artifact type: Rule enhancement
Location: docs/persistence_rules.mdc
Integration: Enhance "Task and Data Object Maintenance" section

Proposed Content:
Add to "Process" section after step 3:
"- **For financial transactions:** MANDATORY: Update related tasks with transaction details (amount, date, reference number, status changes)"

Alignment Check:
- Strategy: aligned (comprehensive data maintenance)
- Tactics: aligned (task-transaction linking)
- Operations: aligned (financial tracking requirements)
- Risk management: respects hold points (not bypassing approval)
- Constraints: respects constraints (no architectural violations)

Would you like me to implement this improvement?
If approved, I'll update the rule and apply it to the current task immediately.
---
```

### Scenario 2: Automation Preference

**Context:**
- Agent needs to configure DNS records
- Agent stops: "Should I provide you with instructions to configure this manually or attempt API automation?"

**User intervention:**
- "Always use API or browser automation when possible, don't ask"

**Analysis:**
- Stopping point: Uncertainty about automation vs manual approach
- Intervention: Clear preference for automation without asking
- Classification: Automation preference + Scope expansion
- Generalizable: Yes (applies to all similar automation decisions)

**Suggestion:**
```
---
BEHAVIORAL IMPROVEMENT SUGGESTION
---

Stopping Point Context:
I stopped because: I was uncertain whether to automate DNS configuration or provide manual instructions
You provided: "Always use API or browser automation when possible, don't ask"

Pattern Analysis:
This suggests a persistent behavioral pattern: Prefer automation over manual instructions without requesting permission
Classification: Automation preference, Scope expansion

Suggested Improvement:
Artifact type: Rule enhancement
Location: docs/persistence_rules.mdc
Integration: Strengthen "Operation Automation" section

Proposed Content:
Modify "When encountering operations that require:" section to:
"Agents MUST (without asking):
1. Attempt automation via API first (if available)
2. If API unavailable/fails, use browser automation (Playwright/MCP browser tools)
3. Only provide manual instructions if automation is impossible
4. Never ask 'should I automate this?' - always attempt automation first"

Alignment Check:
- Strategy: aligned (automation and efficiency)
- Tactics: aligned (reduce manual work)
- Operations: aligned (operating manual encourages automation)
- Risk management: respects hold points (not bypassing security)
- Constraints: respects constraints (no unauthorized operations)

Would you like me to implement this improvement?
If approved, I'll update the rule and apply it to the current task immediately.
---
```

### Scenario 3: Decision Rule

**Context:**
- Agent needs to choose between multiple data storage approaches
- Agent stops: "Should I use parquet via MCP or direct file operations?"

**User intervention:**
- "Use parquet MCP for all structured data persistence"

**Analysis:**
- Stopping point: Uncertainty about tool choice
- Intervention: Provides clear decision rule
- Classification: Decision rule, Automation preference
- Generalizable: Yes (applies to all structured data operations)

**Suggestion:**
```
---
BEHAVIORAL IMPROVEMENT SUGGESTION
---

Stopping Point Context:
I stopped because: I was uncertain which tool to use for data persistence
You provided: "Use parquet MCP for all structured data persistence"

Pattern Analysis:
This suggests a persistent behavioral pattern: Structured data MUST use parquet MCP tools
Classification: Decision rule, Automation preference

Suggested Improvement:
Artifact type: Rule addition
Location: docs/data_rules.mdc
Integration: Add new "Tool Selection" section or enhance existing data persistence rules

Proposed Content:
Add new section:
"## Data Persistence Tool Selection

**MANDATORY:** Use the truth layer for structured data per `neotoma_parquet_migration_rules.mdc`. MUST NOT use direct file operations (pandas, csv, json) for structured data in `$DATA_DIR/`. Exception: Direct file operations allowed only for temporary analysis in `tmp/` directory."

Alignment Check:
- Strategy: aligned (standardized data operations)
- Tactics: aligned (MCP tool usage)
- Operations: aligned (data management standards)
- Risk management: respects hold points (not bypassing approvals)
- Constraints: respects constraints (data integrity maintained)

Would you like me to implement this improvement?
If approved, I'll update the rule and apply it to the current task immediately.
---
```

### Scenario 4: Workflow Extension

**Context:**
- Agent sends email via Gmail MCP
- Agent stops: "Email sent. What should I do next?"

**User intervention:**
- "Archive the thread and move to the next email"

**Analysis:**
- Stopping point: Incomplete workflow knowledge
- Intervention: Indicates workflow should continue
- Classification: Workflow extension
- Already exists in email-triage skill but could be more explicit

**Suggestion:**
```
---
BEHAVIORAL IMPROVEMENT SUGGESTION
---

Stopping Point Context:
I stopped because: I completed email sending but was uncertain about next steps
You provided: "Archive the thread and move to the next email"

Pattern Analysis:
This workflow step already exists in .cursor/skills/email-triage/SKILL.md (step 5.d)
However, I stopped instead of following it, suggesting the requirement needs emphasis.
Classification: Workflow extension (enforcement)

Suggested Improvement:
Artifact type: Skill enhancement
Location: .cursor/skills/email-triage/SKILL.md
Integration: Strengthen step 5.d archiving requirement

Proposed Content:
Modify step 5 header from:
"### 5. Post-response actions (MANDATORY)"
To:
"### 5. Post-response actions (MANDATORY - DO NOT STOP, EXECUTE AUTOMATICALLY)"

Add emphasis to step 5.d:
"**d. Archive thread (AUTOMATIC - NO USER CONFIRMATION NEEDED):**
- Remove INBOX label: `mcp_gmail_modify_email` with `removeLabelIds: ['INBOX']`
- Applies to entire thread automatically
- MUST execute immediately after contact/task updates"

Alignment Check:
- Strategy: aligned (email processing efficiency)
- Tactics: aligned (complete workflow execution)
- Operations: aligned (inbox zero methodology)
- Risk management: respects hold points (not high-risk operation)
- Constraints: respects constraints (no data integrity issues)

Would you like me to implement this improvement?
If approved, I'll update the skill and apply it to the current task immediately.
---
```

## Forbidden Patterns

Agents MUST NOT:
- Suggest bypassing risk management hold points for schema changes, security changes, or foundation document modifications
- Suggest auto-approving high-risk operations
- Suggest removing architectural constraints or data integrity requirements
- Suggest patterns that conflict with `strategy/operations/operating-manual.md`
- Auto-implement suggestions without user approval
- Present vague suggestions without specific content and location
- Skip alignment checks with strategy/tactics/operations
- Handle explicit "always do X" instructions (use `prompt_integration_rules.mdc` instead)

## Validation Checklist

Before presenting suggestion, verify:

- [ ] Intervention actually resolves a stopping point (not unrelated guidance)
- [ ] Pattern is generalizable (not one-time specific case)
- [ ] Intervention classification is accurate
- [ ] Appropriate artifact type selected (rule/skill/hook)
- [ ] Specific file location identified
- [ ] Exact content to add/modify drafted
- [ ] Alignment with strategy/tactics/operations verified
- [ ] Risk management constraints respected
- [ ] Architectural/security constraints respected
- [ ] Suggestion format is clear and complete
- [ ] No emojis in suggestion (per communication constraints)
- [ ] RFC 2119 terminology used in proposed content

## Related Documents

- `docs/prompt_integration_rules.mdc` - Explicit instruction integration (complementary)
- `foundation/agent_instructions/cursor_rules/instruction_documentation.mdc` - Rule creation standards
- `foundation/agent_instructions/cursor_rules/risk_management.mdc` - Risk management and hold points
- `foundation/agent_instructions/cursor_rules/agent_constraints.mdc` - Constraints and forbidden patterns
- `docs/decision_framework_rules.mdc` - Strategy/tactics/operations hierarchy
- `strategy/operations/operating-manual.md` - Behavioral mandates and constraints
- `foundation-config.yaml` - Repository configuration
