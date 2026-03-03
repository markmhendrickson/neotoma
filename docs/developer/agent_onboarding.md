# Agent Onboarding (First Run)

## Scope

This guide defines a first-run onboarding flow where a human asks their agent to install and initialize Neotoma, then preview candidate personal data for confirmation before saving.

This is a one-time onboarding UX layer. After onboarding is complete, standard Neotoma agent behavior applies.

## Agent-driven setup prompt

Use this prompt with your agent:

```text
Install and initialize Neotoma for me using npm, then report what changed.

Use this exact sequence:
1) npm install -g neotoma
2) neotoma init

After init, preview any personal data you already have in this session/context, show me a proposed save list, and ask for my confirmation before saving anything to Neotoma.
```

## First-run onboarding sequence

1. Install via npm: `npm install -g neotoma`
2. Run init: `neotoma init`
3. Gather candidate personal data using the discovery workflow below.
4. Present a preview grouped by entity type (for example: person, task, event, transaction) with key fields and source hints.
5. Ask for explicit user decision:
   - approve all
   - approve selected
   - edit before save
   - reject
6. Save only approved items.
7. Mark onboarding complete and continue with normal Neotoma behavior.

## Data discovery workflow

Use this workflow when the user asks to preview, audit, or discover data that could be stored in Neotoma.

### Step 1: Survey passive sources first (already in context)

Collect candidates without running new tool calls:

- Current conversation + prior in-session messages (names, dates, commitments, preferences, obligations)
- Injected host context (when available), such as:
  - user info (OS, shell, workspace path)
  - git status (repo, branch, modified/untracked files)
  - open/recently viewed files
  - terminal session state and outputs
  - linked conversation transcript references

### Step 2: Survey active sources second (tool-driven)

If needed, run focused tool calls to enrich the preview:

- Git metadata (`git config`, `git log`, `git remote -v`) for user/collaborator/project signals
- Project metadata (`README`, `package.json`, selected config files, env var names not values)
- Configured MCP/tool outputs already available in-session (email, calendar, browser, parquet, web, etc.)
- Existing Neotoma memory (`retrieve_entities` or CLI list/search) to separate already-stored facts from new candidates

### Step 3: Prioritize candidates by Neotoma value

Order preview candidates by truth-layer value:

- Tier 1 (highest): people/contacts, relationships, commitments, obligations, deadline-bearing tasks
- Tier 2: events, decisions, preferences, meaningful financial facts
- Tier 3: project/codebase context that is stable and reusable
- Tier 4 (lowest): transient session state (ephemeral diffs, one-off terminal lines, temporary open-file state)

### Step 4: Present preview with provenance

Before any save action:

- Group by priority tier, then by entity type
- Include key fields and source attribution (for example: "from git config", "from package.json", "from current message")
- Mark each item as already stored vs. new candidate
- Ask for explicit confirmation (approve all / approve selected / edit / reject)

## Guardrails

- Do not run background scanning outside current context/tool outputs.
- Do not save previewed personal data before explicit user confirmation.
- Keep confirmation-first behavior scoped to first-run onboarding only.

## Related documents

- [Getting started](getting_started.md)
- [Agent CLI configuration](agent_cli_configuration.md)
- [CLI agent instructions](cli_agent_instructions.md)
- [MCP instructions](mcp/instructions.md)
